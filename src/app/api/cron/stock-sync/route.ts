import { NextResponse } from "next/server";
import { cronUnauthorized } from "@/lib/cronAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { inChunks } from "@/lib/supabaseChunks";

export const runtime = "nodejs";

/**
 * GET /api/cron/stock-sync
 * Called daily by Vercel cron at 06:00 UTC (after popina-sync at 05:00).
 * Syncs yesterday's sales → stock movements for all establishments.
 *
 * Replicates the logic of POST /api/stock/sync-ventes but called
 * server-side with supabaseAdmin, protégé par CRON_SECRET.
 */
export async function GET(req: Request) {
  const denied = cronUnauthorized(req);
  if (denied) return denied;

  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().slice(0, 10);

    // Get all active establishments
    const { data: etabs } = await supabaseAdmin
      .from("etablissements")
      .select("id, nom");

    if (!etabs || etabs.length === 0) {
      return NextResponse.json({ ok: true, message: "Aucun etablissement" });
    }

    const results: { etab: string; movements: number; ingredients: number; error?: string }[] = [];

    for (const etab of etabs) {
      try {
        const r = await syncVentesForEtab(etab.id, dateStr, dateStr);
        results.push({ etab: etab.nom, movements: r.movements, ingredients: r.ingredients });
      } catch (e) {
        results.push({ etab: etab.nom, movements: 0, ingredients: 0, error: e instanceof Error ? e.message : String(e) });
      }
    }

    return NextResponse.json({ ok: true, date: dateStr, results });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

async function syncVentesForEtab(etabId: string, dateFrom: string, dateTo: string) {
  // 1. Get sales
  const { data: ventes } = await supabaseAdmin
    .from("ventes_lignes")
    .select("description, quantite")
    .eq("etablissement_id", etabId)
    .eq("type_ligne", "Produit")
    .eq("annule", false)
    .gte("date_service", dateFrom)
    .lte("date_service", dateTo);

  const salesByName = new Map<string, number>();
  for (const v of ventes ?? []) {
    const name = (v.description ?? "").trim().toLowerCase();
    if (!name) continue;
    salesByName.set(name, (salesByName.get(name) ?? 0) + (v.quantite ?? 1));
  }

  if (salesByName.size === 0) return { movements: 0, ingredients: 0 };

  // 2. Load popina products
  const { data: products } = await supabaseAdmin
    .from("popina_products")
    .select("id, name, ingredient_id, kitchen_recipe_id")
    .eq("active", true);

  const productByName = new Map<string, { id: string; ingredient_id: string | null; kitchen_recipe_id: string | null }>();
  for (const p of products ?? []) {
    const key = (p.name ?? "").trim().toLowerCase();
    if (key) productByName.set(key, p);
  }

  // 3. Load dose maps
  const { data: doseMaps } = await supabaseAdmin
    .from("popina_dose_map")
    .select("popina_product_id, ingredient_id, dose, dose_unit");

  const dosesByProduct = new Map<string, { ingredient_id: string; dose: number; dose_unit: string }[]>();
  for (const d of doseMaps ?? []) {
    const arr = dosesByProduct.get(d.popina_product_id) ?? [];
    arr.push({ ingredient_id: d.ingredient_id, dose: Number(d.dose), dose_unit: d.dose_unit });
    dosesByProduct.set(d.popina_product_id, arr);
  }

  // 4. Load recipe lines
  const recipeIds = [...new Set((products ?? []).filter(p => p.kitchen_recipe_id).map(p => p.kitchen_recipe_id!))];
  const { data: recipeLines } = recipeIds.length > 0
    ? await supabaseAdmin.from("kitchen_recipe_lines").select("recipe_id, ingredient_id, qty, unit").in("recipe_id", recipeIds)
    : { data: [] };

  const linesByRecipe = new Map<string, { ingredient_id: string; qty: number; unit: string }[]>();
  for (const l of recipeLines ?? []) {
    if (!l.ingredient_id) continue;
    const arr = linesByRecipe.get(l.recipe_id) ?? [];
    arr.push({ ingredient_id: l.ingredient_id, qty: Number(l.qty), unit: l.unit ?? "g" });
    linesByRecipe.set(l.recipe_id, arr);
  }

  // 5. Load ingredients for conversion
  const allIngIds = new Set<string>();
  for (const d of doseMaps ?? []) allIngIds.add(d.ingredient_id);
  for (const p of products ?? []) if (p.ingredient_id) allIngIds.add(p.ingredient_id);
  for (const lines of linesByRecipe.values()) for (const l of lines) allIngIds.add(l.ingredient_id);

  const { data: ingredients } = await inChunks<{ id: string; piece_volume_ml: number | null; purchase_unit_label: string | null; default_unit: string | null }>(
    [...allIngIds], (batch) => supabaseAdmin.from("ingredients").select("id, piece_volume_ml, purchase_unit_label, default_unit").in("id", batch));

  const ingMap = new Map((ingredients ?? []).map(i => [i.id, i]));

  // 6. Compute stock movements
  type Movement = { ingredient_id: string; qty: number; unit: string };
  const movements: Movement[] = [];

  for (const [name, qty] of salesByName) {
    const product = productByName.get(name);
    if (!product) continue;

    // Path A: dose map
    const doses = dosesByProduct.get(product.id);
    if (doses && doses.length > 0) {
      for (const d of doses) {
        const raw = qty * d.dose;
        const conv = toStockUnits(d.ingredient_id, raw, d.dose_unit, ingMap);
        movements.push({ ingredient_id: d.ingredient_id, qty: conv.qty, unit: conv.unit });
      }
      continue;
    }

    // Path B: direct ingredient link
    if (product.ingredient_id) {
      const conv = toStockUnits(product.ingredient_id, qty, "pcs", ingMap);
      movements.push({ ingredient_id: product.ingredient_id, qty: conv.qty, unit: conv.unit });
      continue;
    }

    // Path C: recipe decomposition
    if (product.kitchen_recipe_id) {
      const lines = linesByRecipe.get(product.kitchen_recipe_id);
      if (lines) {
        for (const l of lines) {
          const raw = qty * l.qty;
          const conv = toStockUnits(l.ingredient_id, raw, l.unit, ingMap);
          movements.push({ ingredient_id: l.ingredient_id, qty: conv.qty, unit: conv.unit });
        }
      }
    }
  }

  if (movements.length === 0) return { movements: 0, ingredients: 0 };

  // 7. Aggregate by ingredient
  const aggr = new Map<string, { qty: number; unit: string }>();
  for (const m of movements) {
    const existing = aggr.get(m.ingredient_id);
    if (existing) {
      existing.qty += m.qty;
    } else {
      aggr.set(m.ingredient_id, { qty: m.qty, unit: m.unit });
    }
  }

  // 8. Delete existing vente movements for same period (idempotent)
  const refKey = `ventes_sync_${dateFrom}_${dateTo}`;
  await supabaseAdmin
    .from("stock_movements")
    .delete()
    .eq("etablissement_id", etabId)
    .eq("reference_type", refKey);

  // 9. Insert
  const rows = [...aggr.entries()].map(([ingredient_id, { qty, unit }]) => ({
    etablissement_id: etabId,
    ingredient_id,
    type: "vente",
    quantity: -qty, // negative = consumption
    unit,
    reference_type: refKey,
    note: `Sync auto ${dateFrom}`,
  }));

  const { error: insertErr } = await supabaseAdmin.from("stock_movements").insert(rows);
  if (insertErr) throw new Error(insertErr.message);

  return { movements: rows.length, ingredients: aggr.size };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toStockUnits(ingredientId: string, rawQty: number, rawUnit: string, ingMap: Map<string, any>): { qty: number; unit: string } {
  const ing = ingMap.get(ingredientId);
  if (!ing) return { qty: rawQty, unit: rawUnit };

  const volumeMl = Number(ing.piece_volume_ml) || 0;
  const stockLabel = ing.purchase_unit_label || ing.default_unit || "pcs";

  if ((rawUnit === "cl" || rawUnit === "cL") && volumeMl > 0) {
    return { qty: Math.round((rawQty * 10 / volumeMl) * 100) / 100, unit: stockLabel };
  }
  if (rawUnit === "ml" && volumeMl > 0) {
    return { qty: Math.round((rawQty / volumeMl) * 100) / 100, unit: stockLabel };
  }
  if (rawUnit === "pcs" || rawUnit === "pc") {
    return { qty: rawQty, unit: stockLabel };
  }

  return { qty: rawQty, unit: rawUnit };
}
