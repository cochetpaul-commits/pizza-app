import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { roleDenied } from "@/lib/getEtablissement";
import { CATEGORIES } from "@/types/ingredients";
import { COLS, EDITABLE, HEADER_TO_KEY, SHEET_PRODUITS, UNITES_BASE, boolIn, numIn, estabsIn, allergensIn, statusIn, norm, prixDepuisOffre, prixBaseIn, dateIn, type ColKey, type PrixBase } from "@/lib/ingredientsSheet";

export const runtime = "nodejs";
export const maxDuration = 60;

type Changement = { id: string | null; ligne: number; nom: string; nouveau: boolean; champs: Record<string, { avant: unknown; apres: unknown }> };
type Erreur = { ligne: number; nom: string; message: string };

const NUM_KEYS: ColKey[] = ["order_quantity", "piece_weight_g", "piece_volume_ml", "density_g_per_ml", "stock_min", "stock_objectif", "stock_max"];
const TXT_KEYS: ColKey[] = ["name", "sub_category", "order_unit_label", "storage_zone", "storage_zone_2", "popina_name"];
// supplier_sku et prix_date sont traités avec le bloc prix (ils vivent sur l'offre, pas sur le produit)

/**
 * POST /api/ingredients/import  (multipart : file, mode=preview|commit, etab=bellomio|piccola)
 * Relit le classeur produit par /api/ingredients/export. Aperçu = liste des
 * changements champ par champ ; commit = application. Seules les colonnes
 * éditables sont relues ; une cellule vide efface la valeur (sauf Nom).
 */
export async function POST(req: NextRequest) {
  const denied = await roleDenied(req, ["group_admin", "manager"]);
  if (denied) return denied;

  const form = await req.formData();
  const file = form.get("file");
  const mode = String(form.get("mode") ?? "preview");
  const etabDefaut = String(form.get("etab") ?? "bellomio");
  if (!(file instanceof File)) return NextResponse.json({ error: "Fichier manquant" }, { status: 400 });

  let sheetRows: Record<string, unknown>[];
  try {
    const wb = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: "buffer" });
    const ws = wb.Sheets[SHEET_PRODUITS] ?? wb.Sheets[wb.SheetNames[0]];
    if (!ws) throw new Error("classeur vide");
    sheetRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
  } catch (e) {
    return NextResponse.json({ error: `Fichier illisible : ${e instanceof Error ? e.message : "format inconnu"}` }, { status: 400 });
  }
  if (sheetRows.length === 0) return NextResponse.json({ error: "Aucune ligne dans la feuille Produits" }, { status: 400 });

  // En-têtes → clés (tolérant à la casse / espaces)
  const headerMap = new Map<string, ColKey>();
  for (const h of Object.keys(sheetRows[0])) {
    const k = HEADER_TO_KEY[h.trim().toLowerCase()];
    if (k) headerMap.set(h, k);
  }
  if (!headerMap.size || ![...headerMap.values()].includes("id")) {
    return NextResponse.json({ error: `Colonnes non reconnues. Le fichier doit venir de l'export (colonne « ${COLS[0].header} » requise).` }, { status: 400 });
  }

  const { data: zones } = await supabaseAdmin.from("storage_zones").select("name");
  const zoneByNorm = new Map((zones ?? []).map((z) => [norm(z.name), z.name as string]));
  const { data: offersAll } = await supabaseAdmin.from("v_latest_offers").select("*").range(0, 4999);
  const offerBy = new Map((offersAll ?? []).map((o) => [o.ingredient_id as string, o as Record<string, unknown>]));
  const [{ data: etabs }, { data: fournisseursAll }] = await Promise.all([
    supabaseAdmin.from("etablissements").select("id, slug"),
    supabaseAdmin.from("suppliers").select("id, name, etablissement_id").eq("is_active", true),
  ]);
  const etabIdOf = (slug: string) => (etabs ?? []).find((e) => String(e.slug).includes(slug === "bellomio" ? "bello" : "piccola"))?.id ?? null;
  // Fournisseur de secours : par NOM, pour l'établissement de la fiche (Mael Bello ≠ Mael Piccola)
  const fournisseurParNom = (nom: unknown, etabId: string | null): string | null => {
    const k = norm(nom); if (!k) return null;
    const cands = (fournisseursAll ?? []).filter((f) => norm(f.name) === k);
    return (cands.find((f) => f.etablissement_id === etabId) ?? cands[0])?.id ?? null;
  };

  // Produits concernés (par tranches de 150 IDs)
  const ids = sheetRows.map((r) => String(r[[...headerMap.entries()].find(([, k]) => k === "id")![0]] ?? "").trim()).filter(Boolean);
  const existing = new Map<string, Record<string, unknown>>();
  for (let i = 0; i < ids.length; i += 150) {
    const { data } = await supabaseAdmin.from("ingredients").select("*").in("id", ids.slice(i, i + 150));
    for (const r of data ?? []) existing.set(r.id as string, r as Record<string, unknown>);
  }

  // Noms du fichier → fiches existantes portant ce nom (pour le contrôle de conflit)
  const lowerKey = (v: unknown) => String(v ?? "").trim().toLowerCase();
  const nomsFichier = [...new Set(sheetRows.map((r) => { const h = [...headerMap.entries()].find(([, k]) => k === "name")?.[0]; return h ? lowerKey(r[h]) : ""; }).filter(Boolean))];
  const nomsParEtab = new Map<string, { id: string; name: string; is_active: boolean }>();
  for (let i = 0; i < nomsFichier.length; i += 100) {
    const { data } = await supabaseAdmin.from("ingredients").select("id, name, is_active, etablissement_id").in("name_key", nomsFichier.slice(i, i + 100));
    for (const r of data ?? []) nomsParEtab.set(`${r.etablissement_id}|${lowerKey(r.name)}`, { id: r.id as string, name: r.name as string, is_active: !!r.is_active });
  }

  const changements: Changement[] = [];
  const erreurs: Erreur[] = [];
  const cellOf = (row: Record<string, unknown>, key: ColKey) => {
    const h = [...headerMap.entries()].find(([, k]) => k === key)?.[0];
    return h === undefined ? undefined : row[h];
  };

  sheetRows.forEach((row, idx) => {
    const ligne = idx + 2;
    const id = String(cellOf(row, "id") ?? "").trim() || null;
    const nomCell = String(cellOf(row, "name") ?? "").trim();
    const nouveau = !id;
    if (nouveau && !nomCell) return; // ligne vide
    const avant = id ? existing.get(id) : undefined;
    if (id && !avant) { erreurs.push({ ligne, nom: nomCell, message: "ID inconnu (produit supprimé ?) — ligne ignorée" }); return; }

    const patch: Record<string, unknown> = {};
    const champs: Changement["champs"] = {};
    const set = (k: string, v: unknown) => {
      const a = avant ? avant[k] ?? null : null;
      const same = JSON.stringify(a) === JSON.stringify(v ?? null) || (typeof a === "number" && typeof v === "number" && Math.abs(a - v) < 1e-9) || (a != null && v != null && String(a) === String(v));
      if (nouveau ? v !== null && v !== undefined && v !== "" : !same) { patch[k] = v; champs[k] = { avant: a, apres: v }; }
    };

    for (const key of EDITABLE) {
      const raw = cellOf(row, key);
      if (raw === undefined) continue; // colonne absente du fichier
      const s = String(raw ?? "").trim();
      switch (key) {
        case "name": if (s) set("name", s); else if (!nouveau) erreurs.push({ ligne, nom: String(avant?.name ?? ""), message: "Nom vide — conservé" }); break;
        case "supplier_sku": case "prix_date": break; // traités avec le prix
        case "is_active": case "favori_commande": { const b = boolIn(s); if (s && b === undefined) erreurs.push({ ligne, nom: nomCell, message: `${key} : « ${s} » n'est ni oui ni non` }); else if (b !== undefined) set(key, b); break; }
        case "establishments": { const e = estabsIn(s); if (e === "invalide") erreurs.push({ ligne, nom: nomCell, message: `Établissements « ${s} » non reconnus` }); else if (e) set("establishments", e); break; }
        case "category": { if (!s) break; const c = s.toLowerCase(); if (!(CATEGORIES as readonly string[]).includes(c)) erreurs.push({ ligne, nom: nomCell, message: `Catégorie « ${s} » inconnue (voir feuille Listes)` }); else set("category", c); break; }
        case "default_unit": { if (!s) break; const u = s.toLowerCase().replace("pcs", "pc").replace("pièce", "pc").replace("piece", "pc"); if (!(UNITES_BASE as readonly string[]).includes(u)) erreurs.push({ ligne, nom: nomCell, message: `Unité de base « ${s} » : g, kg, l ou pc` }); else set("default_unit", u); break; }
        case "storage_zone": case "storage_zone_2": { if (!s) { set(key, null); break; } const z = zoneByNorm.get(norm(s)); if (!z) erreurs.push({ ligne, nom: nomCell, message: `Zone « ${s} » inconnue (voir feuille Listes)` }); else set(key, z); break; }
        case "status": { const st = statusIn(s); if (st === "invalide") erreurs.push({ ligne, nom: nomCell, message: `Statut « ${s} » : « validé » ou « à vérifier »` }); else if (st) set("status", st); break; }
        case "allergens": set("allergens", allergensIn(s)); break;
        default:
          if (NUM_KEYS.includes(key)) { const n = numIn(s); if (n === "invalide") erreurs.push({ ligne, nom: nomCell, message: `${key} : « ${s} » n'est pas un nombre` }); else set(key, n); }
          else if (TXT_KEYS.includes(key)) set(key, s || null);
      }
    }
    // ── Prix (offre fournisseur active, comme la fiche produit) ──
    const prixCells = { base: cellOf(row, "prix_base"), unitaire: cellOf(row, "prix_unitaire"), nb: cellOf(row, "prix_nb"), cond: cellOf(row, "prix_cond") };
    if (Object.values(prixCells).some((v) => v !== undefined)) {
      const actuel = prixDepuisOffre(id ? offerBy.get(id) : undefined, avant ?? {});
      const b = prixBaseIn(prixCells.base);
      const u = numIn(prixCells.unitaire), nb = numIn(prixCells.nb), cond = numIn(prixCells.cond);
      if (b === "invalide") erreurs.push({ ligne, nom: nomCell, message: `Base de prix « ${String(prixCells.base)} » : kg, L ou pièce` });
      else if (u === "invalide" || nb === "invalide" || cond === "invalide") erreurs.push({ ligne, nom: nomCell, message: "Prix : une des cellules n'est pas un nombre" });
      else {
        const base: PrixBase | null = b ?? actuel.base ?? (avant?.default_unit === "kg" || avant?.default_unit === "g" ? "kg" : avant?.default_unit === "l" ? "L" : "pièce");
        let unitaire = u, condP = cond;
        const nbU = nb;
        if (unitaire == null && condP != null && nbU != null && nbU > 0) unitaire = Math.round((condP / nbU) * 10000) / 10000;
        if (condP == null && unitaire != null && nbU != null && nbU > 0) condP = Math.round(unitaire * nbU * 100) / 100;
        const diff = (x: number | null, y: number | null) => (x ?? null) !== (y ?? null) && !(x != null && y != null && Math.abs(x - y) < 0.005);
        const change = base !== actuel.base || diff(unitaire, actuel.unitaire) || diff(nbU, actuel.nb) || diff(condP, actuel.cond);
        const skuCell = cellOf(row, "supplier_sku"), dateCell = cellOf(row, "prix_date");
        const sku = skuCell === undefined ? (actuel.sku ?? null) : (String(skuCell ?? "").trim() || null);
        const dateP = dateCell === undefined ? null : dateIn(dateCell);
        if (dateP === "invalide") erreurs.push({ ligne, nom: nomCell, message: `Date du prix « ${String(dateCell)} » illisible (AAAA-MM-JJ ou JJ/MM/AAAA)` });
        const skuChange = skuCell !== undefined && (sku ?? null) !== (actuel.sku ?? null) && actuel.unitaire != null;
        if ((change || skuChange) && unitaire != null && unitaire > 0) {
          const etabFiche = (avant?.etablissement_id as string | null) ?? etabIdOf(((patch.establishments as string[]) ?? [etabDefaut])[0]);
          const sid = (avant?.default_supplier_id as string | undefined)
            ?? (avant?.supplier_id as string | undefined)
            ?? (id ? (offerBy.get(id)?.supplier_id as string | undefined) : undefined)
            ?? fournisseurParNom(cellOf(row, "fournisseur"), etabFiche)
            ?? null;
          if (!sid) erreurs.push({ ligne, nom: nomCell, message: `Prix non appliqué : aucun fournisseur trouvé${cellOf(row, "fournisseur") ? ` (« ${String(cellOf(row, "fournisseur"))} » inconnu pour cet établissement)` : " (colonne Fournisseur vide)"}` });
          else {
            (row as Record<string, unknown>).__prix = { base, unitaire, nb: nbU, cond: condP, sid, sku, date: dateP === "invalide" ? null : dateP };
            champs.prix = { avant: actuel.unitaire != null ? `${actuel.unitaire} €/${actuel.base}${actuel.cond ? ` · ${actuel.cond} € les ${actuel.nb}` : ""}${actuel.sku ? ` · réf. ${actuel.sku}` : ""}` : null, apres: `${unitaire} €/${base}${condP && nbU ? ` · ${condP} € les ${nbU}` : ""}${sku ? ` · réf. ${sku}` : ""}` };
          }
        } else if (change && unitaire == null && (condP != null || nbU != null)) {
          erreurs.push({ ligne, nom: nomCell, message: "Prix : il manque le prix unitaire ou le nombre d'unités par conditionnement" });
        }
      }
    }

    // Conflit de nom (index unique établissement + nom) : signalé ici plutôt que refusé à l'enregistrement
    if (patch.name) {
      const etabFiche = (avant?.etablissement_id as string | null) ?? etabIdOf(((patch.establishments as string[]) ?? [etabDefaut])[0]);
      const conflit = nomsParEtab.get(`${etabFiche}|${lowerKey(patch.name)}`);
      if (conflit && conflit.id !== id) {
        erreurs.push({ ligne, nom: nomCell, message: `Nom déjà pris dans cet établissement par « ${conflit.name} » (${conflit.is_active ? "active" : "inactive"}) — le renommage est ignoré${conflit.is_active ? "" : " ; fusionne ou renomme l'ancienne fiche d'abord"}` });
        delete patch.name; delete champs.name;
      }
    }

    if (nouveau) {
      if (!patch.category) { erreurs.push({ ligne, nom: nomCell, message: "Nouveau produit sans catégorie — ligne ignorée" }); return; }
      if (!patch.establishments) patch.establishments = [etabDefaut];
      if (!patch.default_unit) patch.default_unit = "g";
      patch.is_active = patch.is_active ?? true;
    }
    if (Object.keys(champs).length) changements.push({ id, ligne, nom: nomCell || String(avant?.name ?? ""), nouveau, champs });
    (row as Record<string, unknown>).__patch = patch;
  });

  if (mode !== "commit") {
    return NextResponse.json({ ok: true, mode: "preview", lignes: sheetRows.length, a_modifier: changements.filter((c) => !c.nouveau).length, a_creer: changements.filter((c) => c.nouveau).length, prix_maj: changements.filter((c) => c.champs.prix).length, changements: changements.slice(0, 400), erreurs });
  }

  // Application
  const authHeader = req.headers.get("authorization") ?? "";
  const { data: auth } = await supabaseAdmin.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
  const userId = auth?.user?.id ?? null;

  let modifies = 0, crees = 0, prixMaj = 0;
  const echecs: Erreur[] = [];
  const todo = sheetRows.map((r, i) => ({ row: r, idx: i })).filter(({ row }) => Object.keys((row.__patch as Record<string, unknown>) ?? {}).length || row.__prix);
  type Prix = { base: PrixBase; unitaire: number; nb: number | null; cond: number | null; sid: string | null; sku: string | null; date: string | null };
  const ecrireOffre = async (ingredientId: string, ing: Record<string, unknown> | undefined, p: Prix): Promise<string | null> => {
    const sid = p.sid ?? (ing?.supplier_id as string | null) ?? null;
    if (!sid) return "pas de fournisseur";
    const etabId = (ing?.etablissement_id as string | null) ?? null;
    const aujourdhui = new Date().toISOString().slice(0, 10);
    const commun = { user_id: userId, ingredient_id: ingredientId, supplier_id: sid, is_active: true, density_kg_per_l: null, piece_weight_g: (ing?.piece_weight_g as number | null) ?? null, supplier_sku: p.sku, valid_from: p.date ?? aujourdhui, ...(etabId ? { etablissement_id: etabId } : {}) };
    const pack = p.nb != null && p.nb > 0 && p.cond != null && p.cond > 0;
    const payload = p.base === "pièce"
      ? (pack ? { ...commun, price_kind: "pack_composed", pack_price: p.cond, price: p.cond, pack_count: p.nb, pack_each_unit: "pc", pack_each_qty: null }
              : { ...commun, price_kind: "unit", unit: "pc", unit_price: p.unitaire, price: p.unitaire })
      : (pack ? { ...commun, price_kind: "pack_simple", pack_price: p.cond, price: p.cond, pack_total_qty: p.nb, pack_unit: p.base === "kg" ? "kg" : "l", unit: p.base === "kg" ? "kg" : "l", unit_price: p.unitaire }
              : { ...commun, price_kind: "unit", unit: p.base === "kg" ? "kg" : "l", unit_price: p.unitaire, price: p.unitaire });
    // L'ancienne offre est clôturée (valid_to), jamais supprimée : l'historique des prix reste.
    const off = await supabaseAdmin.from("supplier_offers").update({ is_active: false, valid_to: p.date ?? aujourdhui }).eq("ingredient_id", ingredientId).eq("is_active", true);
    if (off.error) return off.error.message;
    const ins = await supabaseAdmin.from("supplier_offers").insert(payload);
    if (ins.error) return ins.error.message;
    prixMaj++;
    return null;
  };
  for (let i = 0; i < todo.length; i += 20) {
    await Promise.all(todo.slice(i, i + 20).map(async ({ row, idx }) => {
      const patch = row.__patch as Record<string, unknown>;
      const id = String(cellOf(row, "id") ?? "").trim() || null;
      const ligne = idx + 2;
      const prix = row.__prix as Prix | undefined;
      if (id) {
        if (Object.keys(patch).length) {
          const { error } = await supabaseAdmin.from("ingredients").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
          if (error) { echecs.push({ ligne, nom: String(patch.name ?? ""), message: error.message }); return; }
        }
        if (prix) { const e = await ecrireOffre(id, existing.get(id), prix); if (e) { echecs.push({ ligne, nom: String(patch.name ?? existing.get(id)?.name ?? ""), message: `prix : ${e}` }); return; } }
        modifies++;
      } else {
        const estabs = (patch.establishments as string[]) ?? [etabDefaut];
        const { data: cree, error } = await supabaseAdmin.from("ingredients").insert({ ...patch, user_id: userId, etablissement_id: etabIdOf(estabs[0]) ?? etabIdOf(etabDefaut), status: patch.status ?? "to_check" }).select("id, etablissement_id, piece_weight_g, supplier_id").single();
        if (error) { echecs.push({ ligne, nom: String(patch.name ?? ""), message: error.message }); return; }
        crees++;
        if (prix && cree && prix.sid) { const e = await ecrireOffre(cree.id as string, cree as Record<string, unknown>, prix); if (e) echecs.push({ ligne, nom: String(patch.name ?? ""), message: `créé, mais prix non enregistré : ${e}` }); }
      }
    }));
  }
  return NextResponse.json({ ok: echecs.length === 0, mode: "commit", modifies, crees, prix_maj: prixMaj, echecs, erreurs });
}
