import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getEtablissement, EtabError } from "@/lib/getEtablissement";

/**
 * POST /api/stock/sync-ventes
 * Calculates stock consumption from ventes_lignes for a date range,
 * using popina_products links (ingredient_id or dose_map).
 *
 * Body: { date_from: string, date_to: string }
 *
 * Flow:
 * 1. ventes_lignes (description) → match popina_products (name)
 * 2. popina_products → ingredient_id (direct) or dose_map (with dose)
 * 3. Create negative stock_movements (type: "vente")
 *
 * Idempotent: deletes existing "vente" movements for the same date range before inserting.
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
    .select("id, name, ingredient_id, linked_type")
    .eq("active", true);

  // Build name → product map (case-insensitive)
  const productByName = new Map<string, { id: string; ingredient_id: string | null }>();
  for (const p of products ?? []) {
    const key = (p.name ?? "").trim().toLowerCase();
    if (key) productByName.set(key, { id: p.id, ingredient_id: p.ingredient_id });
  }

  // 4. Load dose_map
  const { data: doseMaps } = await supabaseAdmin
    .from("popina_dose_map")
    .select("popina_product_id, ingredient_id, dose, dose_unit");

  // Build product_id → dose entries
  const dosesByProduct = new Map<string, { ingredient_id: string; dose: number; dose_unit: string }[]>();
  for (const d of doseMaps ?? []) {
    const arr = dosesByProduct.get(d.popina_product_id) ?? [];
    arr.push({ ingredient_id: d.ingredient_id, dose: Number(d.dose), dose_unit: d.dose_unit });
    dosesByProduct.set(d.popina_product_id, arr);
  }

  // 5. Calculate consumption per ingredient
  const consumption = new Map<string, { qty: number; unit: string | null }>();

  for (const [name, salesQty] of salesByName) {
    const product = productByName.get(name);
    if (!product) continue;

    // Check dose_map first
    const doses = dosesByProduct.get(product.id);
    if (doses && doses.length > 0) {
      // Use dose_map: each sale × dose → consumption
      for (const d of doses) {
        const key = d.ingredient_id;
        const existing = consumption.get(key) ?? { qty: 0, unit: d.dose_unit };
        existing.qty += salesQty * d.dose;
        consumption.set(key, existing);
      }
    } else if (product.ingredient_id) {
      // Direct link: 1 sale = 1 unit of ingredient
      const key = product.ingredient_id;
      const existing = consumption.get(key) ?? { qty: 0, unit: null };
      existing.qty += salesQty;
      consumption.set(key, existing);
    }
  }

  // 6. Delete existing vente movements for this period (idempotent)
  await supabaseAdmin
    .from("stock_movements")
    .delete()
    .eq("etablissement_id", etabId)
    .eq("type", "vente")
    .eq("reference_type", "ventes_sync")
    .gte("created_at", `${date_from}T00:00:00`)
    .lte("created_at", `${date_to}T23:59:59`);

  // 7. Insert new movements (negative quantities)
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
    matched_products: [...salesByName.keys()].filter((n) => productByName.has(n)).length,
    unmatched_products: [...salesByName.keys()].filter((n) => !productByName.has(n)).length,
    ingredients_impacted: inserted,
  });
}
