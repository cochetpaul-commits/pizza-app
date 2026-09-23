import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSupplierInvoices, getSuppliers, type PlSupplierInvoice, type PlDossier } from "@/lib/pennylane/api";
import { pdfToText } from "@/lib/pdfToText";
import { detectInvoice } from "@/lib/invoices/invoiceDetector";
import { PARSERS } from "@/lib/invoices/registry";
import { runImport, type ParsedInvoice } from "@/lib/invoices/importEngine";
import { geminiVisionParse } from "@/lib/invoices/geminiVisionParser";
import { estFournisseurInterne } from "@/lib/invoices/rapprochement";

/**
 * Récupération automatique des factures depuis Pennylane (Bello Mio).
 *
 * « Une seule facture » : tout est déposé une fois (Drive, mail, photo) et
 * Pennylane centralise. Ce module relit les factures Pennylane récentes :
 *  - fournisseur de la mercuriale → téléchargement du fichier d'origine,
 *    parse dédié (ou scan IA pour les photos), import complet produits+prix ;
 *  - autre fournisseur (EDF, locations…) → rien à faire ici : montant et
 *    catégorie arrivent déjà par la synchro des charges.
 * Journal dans auto_import_factures (idempotent, une ligne par facture).
 */

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

export type AutoImportResult = {
  periode: { from: string; to: string };
  examinees: number;
  importees: number;
  dejaConnues: number;
  horsMercuriale: number;
  aVerifier: number;
  erreurs: number;
  details: { fournisseur: string; statut: string; detail: string }[];
};

type Statut = "importee" | "deja_connue" | "hors_mercuriale" | "a_verifier" | "erreur";

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export type AutoImportCandidat = { pennylane_id: number; fournisseur: string; invoice_number: string | null; date: string | null; montant_ttc: number | null; fichier: boolean; deja_dans_app: boolean; libelle_pennylane: string | null };

/** Liste ce que l'import automatique traiterait sur la fenêtre, SANS rien écrire (factures de la mercuriale non encore passées). */
export async function autoImportCandidats(days = 30, dossier: PlDossier = "bello"): Promise<{ periode: { from: string; to: string }; candidats: AutoImportCandidat[] }> {
  const from = isoDaysAgo(days);
  const to = new Date().toISOString().slice(0, 10);
  const [invoices, plSuppliers, { data: appSuppliers }] = await Promise.all([
    getSupplierInvoices(from, to, dossier), getSuppliers(dossier),
    supabaseAdmin.from("suppliers").select("name").eq("is_active", true),
  ]);
  const plNameById = new Map(plSuppliers.map((s) => [s.id, s.name]));
  const mercuriale = (appSuppliers ?? []).filter((s) => !estFournisseurInterne(s.name as string)).map((s) => norm(s.name as string)).filter((n) => n.length > 3);
  const ids = invoices.map((i) => i.id);
  const traitees = new Set<number>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await supabaseAdmin.from("auto_import_factures").select("pennylane_id, statut").in("pennylane_id", ids.slice(i, i + 100));
    for (const r of data ?? []) if (r.statut !== "erreur") traitees.add(Number(r.pennylane_id));
  }
  const numeros = invoices.map((i) => i.invoice_number).filter((n): n is string => !!n);
  const connues = new Set<string>();
  for (let i = 0; i < numeros.length; i += 100) {
    const { data } = await supabaseAdmin.from("supplier_invoices").select("invoice_number").in("invoice_number", numeros.slice(i, i + 100));
    for (const r of data ?? []) connues.add(String(r.invoice_number));
  }
  const candidats: AutoImportCandidat[] = [];
  for (const inv of invoices) {
    if (traitees.has(inv.id) || inv.archived_at) continue;
    const fournisseur = inv.supplier?.id ? (plNameById.get(inv.supplier.id) ?? "?") : "?";
    const nf = norm(fournisseur);
    if (!(nf.length > 3 && mercuriale.some((m) => nf.includes(m) || m.includes(nf)))) continue;
    candidats.push({ pennylane_id: inv.id, fournisseur, invoice_number: inv.invoice_number ?? null, date: inv.date ?? null, montant_ttc: Number(inv.currency_amount ?? 0) || null, fichier: !!inv.public_file_url, deja_dans_app: !!inv.invoice_number && connues.has(inv.invoice_number), libelle_pennylane: (inv as { label?: string }).label ?? null });
  }
  return { periode: { from, to }, candidats };
}

export type AutoImportOptions = { creerFiches?: boolean; fournisseurs?: string[]; /** nb max de factures traitées par appel (fonction serveur limitée à 60 s) */ limit?: number; /** false = facture et lignes seulement, aucun prix (offre) écrit */ prix?: boolean; /** ne traiter que ces numéros de facture */ numeros?: string[] };

/**
 * Client lu sur la facture : « SASHA » / « BELLO MIO » = Bello Mio,
 * « I FRATELLI » / « PICCOLA » = Piccola Mia (lettres éventuellement espacées :
 * Vinoflo écrit « S A S H A »). Règle : l'adresse de FACTURATION fait foi, pas la
 * livraison. Si les deux noms figurent dans l'en-tête, on lit le bloc qui suit
 * « facturation » et le premier nom rencontré gagne ; sans bloc lisible (SDPF :
 * « BELLO MIO » et « I FRATELLI » côte à côte) → null, le dossier Pennylane décide.
 */
export function clientLuSurFacture(texte: string): "bello" | "piccola" | null {
  const tete = (texte ?? "").slice(0, 2500);
  const reBello = /S\s*A\s*S\s*H\s*A|B\s*E\s*L\s*L\s*O\s+M\s*I\s*O/i;
  const rePiccola = /I\s*F\s*R\s*A\s*T\s*E\s*L\s*L\s*I|P\s*I\s*C\s*C\s*O\s*L\s*A/i;
  const bello = reBello.test(tete);
  const piccola = rePiccola.test(tete);
  if (bello && !piccola) return "bello";
  if (piccola && !bello) return "piccola";
  if (!bello && !piccola) return null;
  // Les deux : bloc « facturation » (adresse de facturation, facturé à…), premier nom trouvé
  const m = /factur(?:ation|[ée]e?\s+[àa])/i.exec(tete);
  if (!m) return null;
  const bloc = tete.slice(m.index + m[0].length, m.index + m[0].length + 300);
  const iB = bloc.search(reBello), iP = bloc.search(rePiccola);
  if (iB < 0 && iP < 0) return null;
  if (iB < 0) return "piccola";
  if (iP < 0) return "bello";
  return iB < iP ? "bello" : "piccola";
}

export async function autoImportFactures(etabId: string, days = 30, dossier: PlDossier = "bello", opts: AutoImportOptions = {}): Promise<AutoImportResult> {
  const creerFiches = opts.creerFiches !== false;
  const seulement = (opts.fournisseurs ?? []).map(norm).filter(Boolean);
  const numeros = new Set((opts.numeros ?? []).map((n) => n.trim()).filter(Boolean));
  const from = isoDaysAgo(days);
  const to = new Date().toISOString().slice(0, 10);
  const userId = process.env.AUTO_IMPORT_USER_ID ?? "bd335e2e-6a50-4311-89b4-8f735cf6bc0b";

  const [invoices, plSuppliers, { data: appSuppliers }] = await Promise.all([
    getSupplierInvoices(from, to, dossier),
    getSuppliers(dossier),
    supabaseAdmin.from("suppliers").select("name").eq("is_active", true),
  ]);
  const plNameById = new Map(plSuppliers.map((s) => [s.id, s.name]));
  const mercuriale = (appSuppliers ?? [])
    .filter((s) => !estFournisseurInterne(s.name as string))
    .map((s) => norm(s.name as string))
    .filter((n) => n.length > 3);

  // Factures déjà passées par ce pipeline — sauf celles en erreur,
  // qu'on retente au passage suivant (fichier momentanément illisible…)
  const ids = invoices.map((i) => i.id);
  const dejaTraitees = new Set<number>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await supabaseAdmin
      .from("auto_import_factures")
      .select("pennylane_id, statut")
      .in("pennylane_id", ids.slice(i, i + 100));
    for (const r of data ?? []) {
      if (r.statut !== "erreur") dejaTraitees.add(Number(r.pennylane_id));
    }
  }

  const res: AutoImportResult = {
    periode: { from, to },
    examinees: 0, importees: 0, dejaConnues: 0, horsMercuriale: 0, aVerifier: 0, erreurs: 0,
    details: [],
  };

  const log = async (inv: PlSupplierInvoice, fournisseur: string, statut: Statut, detail: string, parser?: string, lignes?: number, texte?: string) => {
    await supabaseAdmin.from("auto_import_factures").upsert({
      pennylane_id: inv.id,
      etablissement_id: etabId,
      fournisseur,
      invoice_number: inv.invoice_number ?? null,
      invoice_date: inv.date ?? null,
      montant_ttc: Number(inv.currency_amount ?? 0) || null,
      statut, detail, parser: parser ?? null, lignes: lignes ?? null,
      // Texte du PDF gardé uniquement quand la facture n'a PAS été importée (diagnostic)
      raw_text: statut === "erreur" || statut === "a_verifier" ? (texte ? texte.slice(0, 40000) : null) : null,
    }, { onConflict: "pennylane_id" });
    if (statut === "importee") res.importees++;
    else if (statut === "deja_connue") res.dejaConnues++;
    else if (statut === "hors_mercuriale") res.horsMercuriale++;
    else if (statut === "a_verifier") res.aVerifier++;
    else res.erreurs++;
    if (statut !== "hors_mercuriale") res.details.push({ fournisseur, statut, detail });
  };

  for (const inv of invoices) {
    if (dejaTraitees.has(inv.id) || inv.archived_at) continue;
    if (opts.limit && res.examinees >= opts.limit) break;
    res.examinees++;

    const fournisseur = inv.supplier?.id ? (plNameById.get(inv.supplier.id) ?? "?") : "?";
    const nf = norm(fournisseur);
    const estMercuriale = nf.length > 3 && mercuriale.some((m) => nf.includes(m) || m.includes(nf));
    // Nom du fournisseur tel qu'il existe dans l'appli (« Mael »), pas le libellé Pennylane
    // (« SAS MAEL ») : sinon le scan IA créait une ligne fournisseur parallèle sans fiches.
    // Nom du fournisseur côté appli : correspondance exacte d'abord, sinon le nom le plus long qui
    // correspond (« Armor Emballages » avant « Armor » : vécu 23/09, deux lignes créées pour Bello).
    const candidatsApp = (appSuppliers ?? []).map((s) => s.name as string).filter((n) => { const k = norm(n); return k.length > 3 && (nf.includes(k) || k.includes(nf)); });
    const fournisseurApp = candidatsApp.find((n) => norm(n) === nf) ?? candidatsApp.sort((a, b) => b.length - a.length)[0] ?? fournisseur;
    // Rattrapage par lots : ne traiter que certains fournisseurs, sans marquer les autres
    if (seulement.length && !seulement.some((f) => nf.includes(f) || f.includes(nf))) { res.examinees--; continue; }
    if (numeros.size && !numeros.has(String(inv.invoice_number ?? "").trim())) { res.examinees--; continue; }

    try {
      if (!estMercuriale) {
        await log(inv, fournisseur, "hors_mercuriale", "montant + catégorie via la synchro Pennylane");
        continue;
      }

      // Déjà importée dans l'app (glissée à la main) ?
      if (inv.invoice_number) {
        const { data: connue } = await supabaseAdmin
          .from("supplier_invoices")
          .select("id")
          .eq("invoice_number", inv.invoice_number)
          .limit(1);
        if (connue && connue.length > 0) {
          await log(inv, fournisseur, "deja_connue", `facture ${inv.invoice_number} déjà dans l'app`);
          continue;
        }
      }

      if (!inv.public_file_url) {
        await log(inv, fournisseur, "a_verifier", "pas de fichier d'origine dans Pennylane");
        continue;
      }

      const rep = await fetch(inv.public_file_url);
      if (!rep.ok) {
        await log(inv, fournisseur, "erreur", `téléchargement impossible (${rep.status})`);
        continue;
      }
      const bytes = new Uint8Array(await rep.arrayBuffer());
      if (bytes.length === 0) {
        await log(inv, fournisseur, "a_verifier", "fichier d'origine vide dans Pennylane — à importer à la main");
        continue;
      }
      const contentType = rep.headers.get("content-type") ?? "";
      // Le vrai type se lit dans les premiers octets : %PDF, JPEG (FF D8), PNG (89 50)
      const magicPdf = bytes[0] === 0x25 && bytes[1] === 0x50;
      const magicJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
      const magicPng = bytes[0] === 0x89 && bytes[1] === 0x50;
      const estPdf = magicPdf || (!magicJpeg && !magicPng && (contentType.includes("pdf") || (inv.filename ?? "").toLowerCase().endsWith(".pdf")));
      // Trace technique jointe aux statuts d'échec (type annoncé, taille, signature)
      const trace = `[${contentType || "type ?"} · ${bytes.length} o · ${Array.from(bytes.slice(0, 4)).map((b) => b.toString(16).padStart(2, "0")).join(" ")}]`;

      let payload: ParsedInvoice | null = null;
      let rawText = "";
      let parserUtilise = "";
      let supplierName = fournisseurApp.toUpperCase();
      let defaultUnit: "g" | "pc" | "kg" | "l" = "g";
      let diag = "";

      if (estPdf) {
        // COPIE obligatoire : pdf.js transfère (et vide) le tampon qu'on lui donne —
        // le scan IA recevait ensuite 0 octet (« The document has no pages »).
        try { rawText = await pdfToText(bytes.slice()); } catch (e) { diag = `pdfToText : ${e instanceof Error ? e.message : "échec"}`; }
        const det = detectInvoice(rawText);
        const entry = det.supplier ? PARSERS[det.supplier.slug] : undefined;
        if (entry) {
          const parsed = entry.parse(rawText);
          const somme = Math.round(parsed.lines.reduce((a, l) => a + (l.total_price ?? 0), 0) * 100) / 100;
          const totalOk = parsed.total_ht == null || Math.abs(somme - parsed.total_ht) <= 1;
          if (parsed.lines.length > 0 && totalOk) {
            payload = parsed as unknown as ParsedInvoice;
            parserUtilise = det.supplier!.slug;
            supplierName = entry.supplierName;
            defaultUnit = entry.defaultUnit;
          } else {
            diag = `parser ${det.supplier!.slug} : ${parsed.lines.length} ligne(s), somme ${somme.toFixed(2)} vs total ${parsed.total_ht ?? "?"}`;
          }
        } else if (rawText.length < 50) {
          diag = diag || `texte PDF vide (${rawText.length} car.) — scan sans couche texte ?`;
        } else {
          diag = `fournisseur non reconnu dans le texte (${rawText.length} car.)`;
        }
      }

      // Photo, fournisseur sans parser, ou parse incohérent → scan IA
      if (!payload && process.env.GEMINI_API_KEY) {
        const mime = magicPdf ? "application/pdf" : magicPng ? "image/png" : magicJpeg ? "image/jpeg" : estPdf ? "application/pdf" : (contentType.startsWith("image/") ? contentType : "image/jpeg");
        try {
          const scan = await geminiVisionParse(bytes, mime, fournisseur);
          payload = scan.invoice as unknown as ParsedInvoice;
          parserUtilise = "scan-ia";
          // Même nom que le parser dédié quand le fournisseur est reconnu dans le texte (une seule ligne fournisseur)
          const detScan = rawText ? detectInvoice(rawText) : null;
          const entryScan = detScan?.supplier ? PARSERS[detScan.supplier.slug] : undefined;
          supplierName = entryScan?.supplierName ?? fournisseurApp.toUpperCase();
          defaultUnit = "pc";
        } catch (e) {
          // Message complet (un item par modèle essayé) pour comprendre un refus en prod
          const msg = e instanceof Error ? e.message.replace(/\s*\n+\s*/g, " | ").slice(0, 700) : "scan IA impossible";
          await log(inv, fournisseur, "erreur", `${diag ? diag + " · " : ""}scan IA : ${msg} ${trace}`, undefined, undefined, rawText);
          continue;
        }
      }

      // AVOIR : Pennylane donne un montant négatif. Si le parseur a lu des
      // lignes positives (parseur sans gestion des avoirs, ou scan IA), on
      // inverse quantités et totaux pour ne pas compter un achat à la place
      // d'un remboursement (vécu : Armor FA00069242 du 18/09/2026, −136,54 €
      // importé comme +113,78 € HT). Les prix unitaires restent valables.
      if (payload && Number(inv.currency_amount ?? 0) < 0) {
        const somme = payload.lines.reduce((a, l) => a + (l.total_price ?? 0), 0);
        if (somme > 0) {
          payload = {
            ...payload,
            total_ht: payload.total_ht != null ? -Math.abs(payload.total_ht) : payload.total_ht,
            total_ttc: payload.total_ttc != null ? -Math.abs(payload.total_ttc) : payload.total_ttc,
            lines: payload.lines.map((l) => ({
              ...l,
              quantity: l.quantity != null ? -Math.abs(l.quantity) : l.quantity,
              total_price: l.total_price != null ? -Math.abs(l.total_price) : l.total_price,
            })),
          };
          diag = `${diag ? diag + " · " : ""}avoir : lignes passées en négatif`;
        }
      }

      if (!payload || payload.lines.length === 0) {
        await log(inv, fournisseur, "a_verifier", `aucun parser n'a lu cette facture — à importer à la main${diag ? " · " + diag : ""} ${trace}`, undefined, undefined, rawText);
        continue;
      }

      // Mauvais dossier : facture adressée à l'autre restaurant (vécu : FB9725
      // Mael « BELLO MIO SASHA » présente dans le Pennylane de Piccola Mia et
      // importée chez Mael Piccola). On n'importe pas, on signale.
      const clientLu = clientLuSurFacture(rawText);
      const dossierAttendu = dossier === "piccola" ? "piccola" : "bello";
      if (clientLu && clientLu !== dossierAttendu) {
        const nom = (d: "bello" | "piccola") => (d === "bello" ? "Bello Mio (SASHA)" : "Piccola Mia (I Fratelli)");
        await log(inv, fournisseur, "a_verifier", `client lu sur la facture : ${nom(clientLu)} ≠ dossier Pennylane ${nom(dossierAttendu)} — non importée, à vérifier avec le comptable ${trace}`, parserUtilise, payload.lines.length, rawText);
        continue;
      }

      const r = await runImport({
        supabase: supabaseAdmin, userId, supplierName, payload,
        sourceFileName: inv.filename ?? `pennylane_${inv.id}`,
        rawText: rawText || `pennylane_${inv.id}`, mode: "commit",
        establishment: dossier === "piccola" ? "piccola" : "bellomio", defaultUnit, etabId, creerFiches, sansOffres: opts.prix === false,
      });

      await log(
        inv, fournisseur,
        r.invoiceAlreadyImported ? "deja_connue" : "importee",
        `${Number(inv.currency_amount ?? 0) < 0 ? "AVOIR · " : ""}${payload.lines.length} lignes · ${payload.total_ht != null ? `${payload.total_ht.toFixed(2)} € HT · ` : ""}${r.ingredientsCreated} produit(s) créé(s), ${r.offersInserted} prix mis à jour${r.offresAValider ? ` · ${r.offresAValider} baisse(s) de prix à valider` : ""}${r.lignesSansFiche.length ? ` · ${r.lignesSansFiche.length} ligne(s) sans fiche en attente : ${r.lignesSansFiche.join(" | ").slice(0, 1500)}` : ""}`,
        parserUtilise, payload.lines.length,
      );
    } catch (e) {
      await log(inv, fournisseur, "erreur", e instanceof Error ? e.message.slice(0, 300) : "erreur");
    }
  }

  return res;
}
