import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSupplierInvoices, getSuppliers, type PlSupplierInvoice } from "@/lib/pennylane/api";
import { pdfToText } from "@/lib/pdfToText";
import { detectInvoice } from "@/lib/invoices/invoiceDetector";
import { PARSERS } from "@/lib/invoices/registry";
import { runImport, type ParsedInvoice } from "@/lib/invoices/importEngine";
import { geminiVisionParse } from "@/lib/invoices/geminiVisionParser";

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

export async function autoImportFactures(etabId: string, days = 5): Promise<AutoImportResult> {
  const from = isoDaysAgo(days);
  const to = new Date().toISOString().slice(0, 10);
  const userId = process.env.AUTO_IMPORT_USER_ID ?? "bd335e2e-6a50-4311-89b4-8f735cf6bc0b";

  const [invoices, plSuppliers, { data: appSuppliers }] = await Promise.all([
    getSupplierInvoices(from, to),
    getSuppliers(),
    supabaseAdmin.from("suppliers").select("name").eq("is_active", true),
  ]);
  const plNameById = new Map(plSuppliers.map((s) => [s.id, s.name]));
  const mercuriale = (appSuppliers ?? [])
    .map((s) => norm(s.name as string))
    .filter((n) => n.length > 3);

  // Factures déjà passées par ce pipeline
  const ids = invoices.map((i) => i.id);
  const dejaTraitees = new Set<number>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await supabaseAdmin
      .from("auto_import_factures")
      .select("pennylane_id")
      .in("pennylane_id", ids.slice(i, i + 100));
    for (const r of data ?? []) dejaTraitees.add(Number(r.pennylane_id));
  }

  const res: AutoImportResult = {
    periode: { from, to },
    examinees: 0, importees: 0, dejaConnues: 0, horsMercuriale: 0, aVerifier: 0, erreurs: 0,
    details: [],
  };

  const log = async (inv: PlSupplierInvoice, fournisseur: string, statut: Statut, detail: string, parser?: string, lignes?: number) => {
    await supabaseAdmin.from("auto_import_factures").upsert({
      pennylane_id: inv.id,
      etablissement_id: etabId,
      fournisseur,
      invoice_number: inv.invoice_number ?? null,
      invoice_date: inv.date ?? null,
      montant_ttc: Number(inv.currency_amount ?? 0) || null,
      statut, detail, parser: parser ?? null, lignes: lignes ?? null,
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
    res.examinees++;

    const fournisseur = inv.supplier?.id ? (plNameById.get(inv.supplier.id) ?? "?") : "?";
    const nf = norm(fournisseur);
    const estMercuriale = nf.length > 3 && mercuriale.some((m) => nf.includes(m) || m.includes(nf));

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
      const contentType = rep.headers.get("content-type") ?? "";
      const estPdf = contentType.includes("pdf") || (inv.filename ?? "").toLowerCase().endsWith(".pdf") || (bytes[0] === 0x25 && bytes[1] === 0x50);

      let payload: ParsedInvoice | null = null;
      let rawText = "";
      let parserUtilise = "";
      let supplierName = fournisseur.toUpperCase();
      let defaultUnit: "g" | "pc" | "kg" | "l" = "g";

      if (estPdf) {
        rawText = await pdfToText(bytes);
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
          }
        }
      }

      // Photo, fournisseur sans parser, ou parse incohérent → scan IA
      if (!payload && process.env.GEMINI_API_KEY) {
        const mime = estPdf ? "application/pdf" : contentType.startsWith("image/") ? contentType : "image/jpeg";
        const scan = await geminiVisionParse(bytes, mime, fournisseur);
        payload = scan.invoice as unknown as ParsedInvoice;
        parserUtilise = "scan-ia";
        supplierName = (scan.supplierName || fournisseur).toUpperCase();
        defaultUnit = "pc";
      }

      if (!payload || payload.lines.length === 0) {
        await log(inv, fournisseur, "a_verifier", "aucun parser n'a lu cette facture — à importer à la main");
        continue;
      }

      const r = await runImport({
        supabase: supabaseAdmin, userId, supplierName, payload,
        sourceFileName: inv.filename ?? `pennylane_${inv.id}`,
        rawText: rawText || `pennylane_${inv.id}`, mode: "commit",
        establishment: "bellomio", defaultUnit, etabId,
      });

      await log(
        inv, fournisseur,
        r.invoiceAlreadyImported ? "deja_connue" : "importee",
        `${payload.lines.length} lignes · ${payload.total_ht != null ? `${payload.total_ht.toFixed(2)} € HT · ` : ""}${r.ingredientsCreated} produit(s) créé(s), ${r.offersInserted} prix mis à jour`,
        parserUtilise, payload.lines.length,
      );
    } catch (e) {
      await log(inv, fournisseur, "erreur", e instanceof Error ? e.message.slice(0, 300) : "erreur");
    }
  }

  return res;
}
