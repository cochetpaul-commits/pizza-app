import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { roleDenied } from "@/lib/getEtablissement";
import { CATEGORIES } from "@/types/ingredients";
import { COLS, EDITABLE, HEADER_TO_KEY, SHEET_PRODUITS, UNITES_BASE, boolIn, numIn, estabsIn, allergensIn, statusIn, norm, type ColKey } from "@/lib/ingredientsSheet";

export const runtime = "nodejs";
export const maxDuration = 60;

type Changement = { id: string | null; ligne: number; nom: string; nouveau: boolean; champs: Record<string, { avant: unknown; apres: unknown }> };
type Erreur = { ligne: number; nom: string; message: string };

const NUM_KEYS: ColKey[] = ["purchase_price", "purchase_unit", "order_quantity", "piece_weight_g", "piece_volume_ml", "density_g_per_ml", "stock_min", "stock_objectif", "stock_max"];
const TXT_KEYS: ColKey[] = ["name", "sub_category", "purchase_unit_label", "order_unit_label", "storage_zone", "storage_zone_2", "popina_name"];

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

  // Produits concernés (par tranches de 150 IDs)
  const ids = sheetRows.map((r) => String(r[[...headerMap.entries()].find(([, k]) => k === "id")![0]] ?? "").trim()).filter(Boolean);
  const existing = new Map<string, Record<string, unknown>>();
  for (let i = 0; i < ids.length; i += 150) {
    const { data } = await supabaseAdmin.from("ingredients").select("*").in("id", ids.slice(i, i + 150));
    for (const r of data ?? []) existing.set(r.id as string, r as Record<string, unknown>);
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
    if (nouveau) {
      if (!patch.category) { erreurs.push({ ligne, nom: nomCell, message: "Nouveau produit sans catégorie — ligne ignorée" }); return; }
      if (!patch.establishments) patch.establishments = [etabDefaut];
      if (!patch.default_unit) patch.default_unit = "g";
      patch.is_active = patch.is_active ?? true;
    }
    if (Object.keys(patch).length) changements.push({ id, ligne, nom: nomCell || String(avant?.name ?? ""), nouveau, champs });
    (row as Record<string, unknown>).__patch = patch;
  });

  if (mode !== "commit") {
    return NextResponse.json({ ok: true, mode: "preview", lignes: sheetRows.length, a_modifier: changements.filter((c) => !c.nouveau).length, a_creer: changements.filter((c) => c.nouveau).length, changements: changements.slice(0, 400), erreurs });
  }

  // Application
  const authHeader = req.headers.get("authorization") ?? "";
  const { data: auth } = await supabaseAdmin.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
  const userId = auth?.user?.id ?? null;
  const { data: etabs } = await supabaseAdmin.from("etablissements").select("id, slug");
  const etabIdOf = (slug: string) => (etabs ?? []).find((e) => String(e.slug).includes(slug === "bellomio" ? "bello" : "piccola"))?.id ?? null;

  let modifies = 0, crees = 0;
  const echecs: Erreur[] = [];
  const todo = sheetRows.map((r, i) => ({ row: r, idx: i })).filter(({ row }) => Object.keys((row.__patch as Record<string, unknown>) ?? {}).length);
  for (let i = 0; i < todo.length; i += 20) {
    await Promise.all(todo.slice(i, i + 20).map(async ({ row, idx }) => {
      const patch = row.__patch as Record<string, unknown>;
      const id = String(cellOf(row, "id") ?? "").trim() || null;
      const ligne = idx + 2;
      if (id) {
        const { error } = await supabaseAdmin.from("ingredients").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
        if (error) echecs.push({ ligne, nom: String(patch.name ?? ""), message: error.message }); else modifies++;
      } else {
        const estabs = (patch.establishments as string[]) ?? [etabDefaut];
        const { error } = await supabaseAdmin.from("ingredients").insert({ ...patch, user_id: userId, etablissement_id: etabIdOf(estabs[0]) ?? etabIdOf(etabDefaut), status: patch.status ?? "to_check" });
        if (error) echecs.push({ ligne, nom: String(patch.name ?? ""), message: error.message }); else crees++;
      }
    }));
  }
  return NextResponse.json({ ok: echecs.length === 0, mode: "commit", modifies, crees, echecs, erreurs });
}
