import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { roleDenied } from "@/lib/getEtablissement";
import { CATEGORIES } from "@/types/ingredients";
import { COLS, SHEET_PRODUITS, SHEET_LISTES, UNITES_BASE, CATEGORY_HELP, boolOut, estabsOut, allergensOut, statusOut, prixDepuisOffre } from "@/lib/ingredientsSheet";

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
  // Filtres facultatifs : ?cats=vins,soft&fournisseurs=<id>,<id> (fournisseur = meilleure offre ou fournisseur par défaut)
  const cats = (req.nextUrl.searchParams.get("cats") ?? "").split(",").map((c) => c.trim().toLowerCase()).filter(Boolean);
  const fournisseurs = (req.nextUrl.searchParams.get("fournisseurs") ?? "").split(",").map((c) => c.trim()).filter(Boolean);

  // Tout charger par tranches (pas de plafond PostgREST)
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    let q = supabaseAdmin.from("ingredients").select("*").order("category").order("sub_category").order("name").range(from, from + 999);
    if (etab === "bellomio" || etab === "piccola") q = q.or(`establishments.cs.{"${etab}"},establishments.is.null`);
    if (!inactifs) q = q.eq("is_active", true);
    if (cats.length) q = q.in("category", cats);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    rows.push(...((data ?? []) as Record<string, unknown>[]));
    if (!data || data.length < 1000) break;
  }

  const [{ data: offers }, { data: suppliers }, { data: zones }] = await Promise.all([
    supabaseAdmin.from("supplier_offers").select("*").eq("is_active", true).order("created_at", { ascending: false }).range(0, 4999),
    supabaseAdmin.from("suppliers").select("id, name"),
    supabaseAdmin.from("storage_zones").select("name").order("display_order"),
  ]);
  const supName = new Map((suppliers ?? []).map((s) => [s.id as string, s.name as string]));
  // Une offre active par produit : la plus récente si plusieurs fournisseurs
  const offerBy = new Map<string, Record<string, unknown>>();
  for (const o of (offers ?? []) as Record<string, unknown>[]) if (!offerBy.has(o.ingredient_id as string)) offerBy.set(o.ingredient_id as string, o);
  // Filtre fournisseur : on compare par NOM (un même fournisseur existe en double, un par établissement)
  const fournNoms = new Set(fournisseurs.map((id) => (supName.get(id) ?? "").trim().toLowerCase()).filter(Boolean));
  const rowsFiltrees = fournNoms.size
    ? rows.filter((r) => { const o = offerBy.get(r.id as string) as Record<string, unknown> | undefined; const sid = (o?.supplier_id as string) ?? (r.supplier_id as string) ?? null; return sid ? fournNoms.has((supName.get(sid) ?? "").trim().toLowerCase()) : false; })
    : rows;
  rows.length = 0; rows.push(...rowsFiltrees);

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
    const px = prixDepuisOffre(o, r);
    for (const c of COLS) {
      let v: unknown;
      switch (c.key) {
        case "prix_base": v = px.base ?? ""; break;
        case "prix_unitaire": v = px.unitaire; break;
        case "prix_nb": v = px.nb; break;
        case "prix_cond": v = px.cond; break;
        case "supplier_sku": v = px.sku ?? (r.supplier_sku as string | null) ?? ""; break;
        case "prix_date": v = px.date ?? ""; break;
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
    ["Réf. fournisseur et Date du prix : la référence article chez le fournisseur et la date à laquelle ce prix a été relevé. Modifiables : elles sont reprises dans l'offre enregistrée à l'import."],
    ["3. Les colonnes marquées (info) sont indicatives et ne sont pas relues à l'import (fournisseur, prix au kg, libellé facture)."],
    ["Prix : « Base de prix » dit si le produit s'achète au kg, au litre ou à la pièce (bouteille, boîte…). « Prix HT par kg, L ou pièce » est le prix de cette base. Si le produit arrive par carton / colis, indique le nombre d'unités par conditionnement et le prix du conditionnement (l'un des deux prix suffit, l'autre se déduit)."],
    ["4. Catégorie : utiliser le code (ex. « legumes_herbes »), voir la feuille Listes. Zones de stockage : le nom exact d'une zone existante."],
    ["5. Une ligne sans ID mais avec un Nom crée un nouveau produit."],
    ["6. Pour rendre un produit invisible sans le supprimer : Actif = non."],
    ["7. Réimporte le fichier depuis Base produits → bouton Import / Export : l'appli montre d'abord ce qui va changer, tu confirmes ensuite."],
    [""],
    [`Export du ${new Date().toLocaleString("fr-FR")} · ${rows.length} produits · périmètre : ${etab === "bellomio" ? "Bello Mio" : etab === "piccola" ? "Piccola Mia" : "les deux établissements"}${inactifs ? " (inactifs inclus)" : ""}${cats.length ? " · catégories : " + cats.join(", ") : ""}${fournNoms.size ? " · fournisseurs : " + [...fournNoms].join(", ") : ""}`],
    [`Codes catégories : ${CATEGORIES.join(", ")}`],
  ];
  const wsA = XLSX.utils.aoa_to_sheet(aide);
  wsA["!cols"] = [{ wch: 120 }];
  XLSX.utils.book_append_sheet(wb, wsA, "Mode d'emploi");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const suffixe = [cats.length ? cats.join("+") : "", fournNoms.size ? [...fournNoms].map((n) => n.replace(/[^a-z0-9]+/g, "")).join("+") : ""].filter(Boolean).join("-");
  const nom = `base-produits-${etab}${suffixe ? "-" + suffixe : ""}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nom}"`,
      "Cache-Control": "no-store",
    },
  });
}
