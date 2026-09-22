import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { roleDenied } from "@/lib/getEtablissement";
import { CATEGORIES } from "@/types/ingredients";
import { COLS, SHEET_PRODUITS, SHEET_LISTES, UNITES_BASE, CATEGORY_HELP, boolOut, estabsOut, allergensOut, statusOut } from "@/lib/ingredientsSheet";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/ingredients/export?etab=bellomio|piccola|tous&inactifs=1
 * Classeur Excel de la base produits : une ligne par produit, colonnes
 * paramétrables + feuille « Listes » (valeurs autorisées) + mode d'emploi.
 * Se réimporte tel quel via POST /api/ingredients/import.
 */
export async function GET(req: NextRequest) {
  const denied = await roleDenied(req, ["group_admin", "manager"]);
  if (denied) return denied;

  const etab = (req.nextUrl.searchParams.get("etab") ?? "tous").toLowerCase();
  const inactifs = req.nextUrl.searchParams.get("inactifs") === "1";

  // Tout charger par tranches (pas de plafond PostgREST)
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    let q = supabaseAdmin.from("ingredients").select("*").order("category").order("sub_category").order("name").range(from, from + 999);
    if (etab === "bellomio" || etab === "piccola") q = q.or(`establishments.cs.{"${etab}"},establishments.is.null`);
    if (!inactifs) q = q.eq("is_active", true);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    rows.push(...((data ?? []) as Record<string, unknown>[]));
    if (!data || data.length < 1000) break;
  }

  const [{ data: offers }, { data: suppliers }, { data: zones }] = await Promise.all([
    supabaseAdmin.from("v_latest_offers").select("ingredient_id, supplier_id, unit_price, unit, pack_price, pack_unit, pack_total_qty, density_kg_per_l, piece_weight_g").range(0, 4999),
    supabaseAdmin.from("suppliers").select("id, name"),
    supabaseAdmin.from("storage_zones").select("name").order("display_order"),
  ]);
  const supName = new Map((suppliers ?? []).map((s) => [s.id as string, s.name as string]));
  const offerBy = new Map((offers ?? []).map((o) => [o.ingredient_id as string, o]));

  const prixKg = (r: Record<string, unknown>, o?: Record<string, unknown>): number | null => {
    if (r.cost_per_kg) return Math.round(Number(r.cost_per_kg) * 100) / 100;
    if (o?.unit_price && (o.unit === "kg" || o.unit === "L" || o.unit === "l")) return Math.round(Number(o.unit_price) * 100) / 100;
    if (o?.unit_price && o.unit === "g") return Math.round(Number(o.unit_price) * 1000 * 100) / 100;
    const pp = Number(r.purchase_price) || 0, pu = Number(r.purchase_unit) || 1, pul = String(r.purchase_unit_label ?? "").toLowerCase();
    if (pp > 0 && (pul === "kg" || pul === "l")) return Math.round((pp / pu) * 100) / 100;
    if (pp > 0 && r.piece_weight_g && Number(r.piece_weight_g) > 0) return Math.round((pp / pu / Number(r.piece_weight_g)) * 1000 * 100) / 100;
    return null;
  };

  const data = rows.map((r) => {
    const o = offerBy.get(r.id as string) as Record<string, unknown> | undefined;
    const sid = (o?.supplier_id as string) ?? (r.supplier_id as string) ?? null;
    const cell: Record<string, unknown> = {};
    for (const c of COLS) {
      let v: unknown;
      switch (c.key) {
        case "is_active": v = boolOut(r.is_active); break;
        case "favori_commande": v = boolOut(r.favori_commande); break;
        case "establishments": v = estabsOut(r.establishments); break;
        case "fournisseur": v = sid ? supName.get(sid) ?? "" : ""; break;
        case "prix_kg": v = prixKg(r, o); break;
        case "allergens": v = allergensOut(r.allergens); break;
        case "status": v = statusOut(r.status); break;
        default: v = r[c.key] ?? "";
      }
      cell[c.header] = v === null ? "" : v;
    }
    return cell;
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data, { header: COLS.map((c) => c.header) });
  ws["!cols"] = COLS.map((c) => ({ wch: c.key === "name" ? 44 : c.key === "id" ? 38 : Math.min(28, Math.max(12, c.header.length * 0.8)) }));
  ws["!freeze"] = { xSplit: 2, ySplit: 1 };
  ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: data.length, c: COLS.length - 1 } }) };
  XLSX.utils.book_append_sheet(wb, ws, SHEET_PRODUITS);

  // Listes de valeurs autorisées
  const subCats = [...new Set(rows.map((r) => r.sub_category as string).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr"));
  const zoneNames = [...new Set((zones ?? []).map((z) => z.name as string))];
  const maxLen = Math.max(CATEGORY_HELP.length, subCats.length, zoneNames.length, UNITES_BASE.length);
  const listes = Array.from({ length: maxLen }, (_, i) => ({
    "Catégories (code = libellé)": CATEGORY_HELP[i] ?? "",
    "Sous-catégories existantes": subCats[i] ?? "",
    "Zones de stockage": zoneNames[i] ?? "",
    "Unités de base": UNITES_BASE[i] ?? "",
    "Établissements": ["Bello Mio", "Piccola Mia", "les deux"][i] ?? "",
  }));
  const wsL = XLSX.utils.json_to_sheet(listes);
  wsL["!cols"] = [{ wch: 40 }, { wch: 30 }, { wch: 22 }, { wch: 14 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, wsL, SHEET_LISTES);

  const aide = [
    ["Mode d'emploi"],
    [""],
    ["1. Corrige les cellules directement dans la feuille « Produits ». Tu peux trier et filtrer, ça n'a pas d'importance."],
    ["2. Ne touche pas à la colonne « ID » : c'est elle qui relie la ligne au produit dans l'appli."],
    ["3. Les colonnes marquées (info) sont indicatives et ne sont pas relues à l'import (fournisseur, prix au kg, libellé facture)."],
    ["4. Catégorie : utiliser le code (ex. « legumes_herbes »), voir la feuille Listes. Zones de stockage : le nom exact d'une zone existante."],
    ["5. Une ligne sans ID mais avec un Nom crée un nouveau produit."],
    ["6. Pour rendre un produit invisible sans le supprimer : Actif = non."],
    ["7. Réimporte le fichier depuis Base produits → bouton Import / Export : l'appli montre d'abord ce qui va changer, tu confirmes ensuite."],
    [""],
    [`Export du ${new Date().toLocaleString("fr-FR")} · ${rows.length} produits · périmètre : ${etab === "bellomio" ? "Bello Mio" : etab === "piccola" ? "Piccola Mia" : "les deux établissements"}${inactifs ? " (inactifs inclus)" : ""}`],
    [`Codes catégories : ${CATEGORIES.join(", ")}`],
  ];
  const wsA = XLSX.utils.aoa_to_sheet(aide);
  wsA["!cols"] = [{ wch: 120 }];
  XLSX.utils.book_append_sheet(wb, wsA, "Mode d'emploi");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const nom = `base-produits-${etab}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nom}"`,
      "Cache-Control": "no-store",
    },
  });
}
