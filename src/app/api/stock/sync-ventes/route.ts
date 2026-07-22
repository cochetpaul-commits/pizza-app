import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getEtablissement, EtabError } from "@/lib/getEtablissement";

/**
 * POST /api/stock/sync-ventes
 * Calculates stock consumption from ventes_lignes for a date range.
 *
 * Two paths:
 * A) popina_product → ingredient_id (direct link or dose_map)
 *    → converts dose (cl/g) to stock units (bouteilles/pcs) via piece_volume_ml
 * B) popina_product → kitchen_recipe_id (recipe link)
 *    → decomposes recipe into ingredient lines, converts to stock units
 *
 * Idempotent: deletes existing "vente" movements for the same period before inserting.
 */
export async function POST(req: NextRequest) {
  let etabId: string;
  try {
    ({ etabId } = await getEtablissement(req));
  } catch (e) {
    if (e instanceof EtabError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const { date_from, date_to } = await req.json();
  if (!date_from || !date_to) {
    return NextResponse.json({ error: "date_from et date_to requis" }, { status: 400 });
  }

  // 1. Get all sales lines for the period
  const { data: ventes, error: ventesErr } = await supabaseAdmin
    .from("ventes_lignes")
    .select("description, quantite")
    .eq("etablissement_id", etabId)
    .eq("type_ligne", "Produit")
    .eq("annule", false)
    .gte("date_service", date_from)
    .lte("date_service", date_to);

  if (ventesErr) return NextResponse.json({ error: ventesErr.message }, { status: 500 });

  // 2. Aggregate sales by product name
  const salesByName = new Map<string, number>();
  for (const v of ventes ?? []) {
    const name = (v.description ?? "").trim().toLowerCase();
    if (!name) continue;
    salesByName.set(name, (salesByName.get(name) ?? 0) + (v.quantite ?? 1));
  }

  // 3. Load popina_products with their links
  const { data: products } = await supabaseAdmin
    .from("popina_products")
    .select("id, name, ingredient_id, kitchen_recipe_id, linked_type")
    .eq("active", true);

  const productByName = new Map<string, { id: string; ingredient_id: string | null; kitchen_recipe_id: string | null }>();
  for (const p of products ?? []) {
    const key = (p.name ?? "").trim().toLowerCase();
    if (key) productByName.set(key, { id: p.id, ingredient_id: p.ingredient_id, kitchen_recipe_id: p.kitchen_recipe_id });
  }

  // 4. Load dose_map
  const { data: doseMaps } = await supabaseAdmin
    .from("popina_dose_map")
    .select("popina_product_id, ingredient_id, dose, dose_unit");

  const dosesByProduct = new Map<string, { ingredient_id: string; dose: number; dose_unit: string }[]>();
  for (const d of doseMaps ?? []) {
    const arr = dosesByProduct.get(d.popina_product_id) ?? [];
    arr.push({ ingredient_id: d.ingredient_id, dose: Number(d.dose), dose_unit: d.dose_unit });
    dosesByProduct.set(d.popina_product_id, arr);
  }

  // 5. Load all recipe lines for linked recipes
  const recipeIds = [...new Set(
    (products ?? []).filter(p => p.kitchen_recipe_id).map(p => p.kitchen_recipe_id!)
  )];
  const { data: recipeLines } = recipeIds.length > 0
    ? await supabaseAdmin
        .from("kitchen_recipe_lines")
        .select("recipe_id, ingredient_id, qty, unit")
        .in("recipe_id", recipeIds)
    : { data: [] };

  // recipe_id → [{ ingredient_id, qty, unit }]
  const linesByRecipe = new Map<string, { ingredient_id: string; qty: number; unit: string }[]>();
  for (const l of recipeLines ?? []) {
    if (!l.ingredient_id) continue;
    const arr = linesByRecipe.get(l.recipe_id) ?? [];
    arr.push({ ingredient_id: l.ingredient_id, qty: Number(l.qty), unit: l.unit ?? "g" });
    linesByRecipe.set(l.recipe_id, arr);
  }

  // 6. Load ingredient data for unit conversion
  const allIngIds = new Set<string>();
  for (const d of doseMaps ?? []) allIngIds.add(d.ingredient_id);
  for (const p of products ?? []) if (p.ingredient_id) allIngIds.add(p.ingredient_id);
  for (const lines of linesByRecipe.values()) for (const l of lines) allIngIds.add(l.ingredient_id);

  const { data: ingredients } = allIngIds.size > 0
    ? await supabaseAdmin
        .from("ingredients")
        .select("id, name, default_unit, piece_volume_ml, purchase_unit_label")
        .in("id", [...allIngIds])
    : { data: [] };

  const ingMap = new Map((ingredients ?? []).map(i => [i.id, i]));

  // Also load supplier_offers for pack info (for g → pcs conversion)
  const { data: offers } = allIngIds.size > 0
    ? await supabaseAdmin
        .from("supplier_offers")
        .select("ingredient_id, pack_count, pack_each_qty, pack_each_unit")
        .eq("is_active", true)
        .in("ingredient_id", [...allIngIds])
        .not("pack_count", "is", null)
    : { data: [] };

  // ingredient_id → { pack_count, pack_each_qty (g or ml per piece), pack_each_unit }
  const packMap = new Map<string, { pack_count: number; pack_each_qty: number; pack_each_unit: string }>();
  for (const o of offers ?? []) {
    if (!packMap.has(o.ingredient_id) && o.pack_count) {
      packMap.set(o.ingredient_id, {
        pack_count: o.pack_count,
        pack_each_qty: o.pack_each_qty ?? 1,
        pack_each_unit: o.pack_each_unit ?? "pcs",
      });
    }
  }

  /**
   * Convert a raw consumption amount (in dose_unit like cl/g) to stock units (bouteilles/pcs).
   * Returns { qty: number, unit: string }
   */
  function toStockUnits(ingredientId: string, rawQty: number, rawUnit: string): { qty: number; unit: string } {
    const ing = ingMap.get(ingredientId);
    if (!ing) return { qty: rawQty, unit: rawUnit };

    const volumeMl = Number(ing.piece_volume_ml) || 0;
    const stockLabel = ing.purchase_unit_label || ing.default_unit || "pcs";

    // cl → bouteilles/pcs via piece_volume_ml
    if (rawUnit === "cl" && volumeMl > 0) {
      const rawMl = rawQty * 10; // cl to ml
      const pieces = rawMl / volumeMl;
      return { qty: Math.round(pieces * 100) / 100, unit: stockLabel };
    }

    // g → pcs via pack info (e.g., 1000g per paquet)
    if (rawUnit === "g") {
      const pack = packMap.get(ingredientId);
      if (pack && pack.pack_each_unit === "g" && pack.pack_each_qty > 0) {
        // pack_each_qty is grams per piece (e.g., 1000g per paquet)
        const pieces = rawQty / pack.pack_each_qty;
        return { qty: Math.round(pieces * 100) / 100, unit: stockLabel };
      }
      if (pack && pack.pack_each_unit === "kg" && pack.pack_each_qty > 0) {
        const pieces = rawQty / (pack.pack_each_qty * 1000);
        return { qty: Math.round(pieces * 100) / 100, unit: stockLabel };
      }
    }

    // ml → pcs via piece_volume_ml
    if (rawUnit === "ml" && volumeMl > 0) {
      const pieces = rawQty / volumeMl;
      return { qty: Math.round(pieces * 100) / 100, unit: stockLabel };
    }

    // pcs → pcs (no conversion needed)
    if (rawUnit === "pcs") {
      return { qty: rawQty, unit: stockLabel };
    }

    // Fallback: keep raw
    return { qty: rawQty, unit: rawUnit };
  }

  // 7. Calculate consumption per ingredient (in stock units)
  const consumption = new Map<string, { qty: number; unit: string }>();

  function addConsumption(ingredientId: string, qty: number, unit: string) {
    const converted = toStockUnits(ingredientId, qty, unit);
    const existing = consumption.get(ingredientId) ?? { qty: 0, unit: converted.unit };
    existing.qty += converted.qty;
    consumption.set(ingredientId, existing);
  }

  let matchedCount = 0;
  let recipeCount = 0;

  for (const [name, salesQty] of salesByName) {
    const product = productByName.get(name);
    if (!product) continue;
    matchedCount++;

    // A) Dose map → ingredient with dose conversion
    const doses = dosesByProduct.get(product.id);
    if (doses && doses.length > 0) {
      for (const d of doses) {
        addConsumption(d.ingredient_id, salesQty * d.dose, d.dose_unit);
      }
    }
    // B) Direct ingredient link (no dose) → 1 sale = 1 pcs
    else if (product.ingredient_id) {
      addConsumption(product.ingredient_id, salesQty, "pcs");
    }
    // C) Recipe link → decompose into ingredients
    else if (product.kitchen_recipe_id) {
      const lines = linesByRecipe.get(product.kitchen_recipe_id);
      if (lines) {
        recipeCount++;
        for (const line of lines) {
          addConsumption(line.ingredient_id, salesQty * line.qty, line.unit);
        }
      }
    }
  }

  // 8. Delete existing vente movements for this period (idempotent)
  await supabaseAdmin
    .from("stock_movements")
    .delete()
    .eq("etablissement_id", etabId)
    .eq("type", "vente")
    .eq("reference_type", "ventes_sync")
    .gte("created_at", `${date_from}T00:00:00`)
    .lte("created_at", `${date_to}T23:59:59`);

  // 9. Insert new movements (negative quantities, in stock units)
  const movements = [...consumption.entries()].map(([ingredientId, { qty, unit }]) => ({
    etablissement_id: etabId,
    ingredient_id: ingredientId,
    type: "vente" as const,
    quantity: -qty,
    unit,
    reference_type: "ventes_sync",
    note: `Ventes ${date_from} → ${date_to}`,
    created_at: `${date_to}T23:59:00`,
  }));

  let inserted = 0;
  if (movements.length > 0) {
    const { error: insertErr } = await supabaseAdmin.from("stock_movements").insert(movements);
    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });
    inserted = movements.length;
  }

  return NextResponse.json({
    ok: true,
    period: { from: date_from, to: date_to },
    sales_lines: ventes?.length ?? 0,
    matched_products: matchedCount,
    unmatched_products: salesByName.size - matchedCount,
    recipes_decomposed: recipeCount,
    ingredients_impacted: inserted,
  });
}
