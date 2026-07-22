import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getEtablissement, EtabError } from "@/lib/getEtablissement";

/**
 * GET /api/stock
 * Returns theoretical stock per ingredient for the current etablissement.
 *
 * Stock théorique = dernier inventaire + réceptions - ventes (depuis le dernier inventaire)
 *
 * Query params:
 * - ingredient_id (optional): filter to a single ingredient
 */
export async function GET(req: NextRequest) {
  let etabId: string;
  try {
    ({ etabId } = await getEtablissement(req));
  } catch (e) {
    if (e instanceof EtabError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const ingredientId = req.nextUrl.searchParams.get("ingredient_id");

  // 1. Get the latest closed inventory for this etablissement
  const { data: lastInv } = await supabaseAdmin
    .from("inventaires")
    .select("id, date, cloture_at")
    .eq("etablissement_id", etabId)
    .eq("statut", "cloture")
    .order("date", { ascending: false })
    .limit(1)
    .single();

  const invDate = lastInv?.cloture_at ?? null;
  const invId = lastInv?.id ?? null;

  // 2. Get inventory lines (starting quantities)
  let invLines: { ingredient_id: string; quantite: number; unite: string | null }[] = [];
  if (invId) {
    let q = supabaseAdmin
      .from("inventaire_lignes")
      .select("ingredient_id, quantite, unite")
      .eq("inventaire_id", invId);
    if (ingredientId) q = q.eq("ingredient_id", ingredientId);
    const { data } = await q;
    invLines = (data ?? []).map((l) => ({
      ingredient_id: l.ingredient_id,
      quantite: Number(l.quantite),
      unite: l.unite,
    }));
  }

  // 3. Get all stock movements since the inventory (or all if no inventory)
  let movQ = supabaseAdmin
    .from("stock_movements")
    .select("ingredient_id, type, quantity, unit")
    .eq("etablissement_id", etabId);
  if (invDate) movQ = movQ.gte("created_at", invDate);
  if (ingredientId) movQ = movQ.eq("ingredient_id", ingredientId);
  const { data: movements } = await movQ;

  // 4. Build stock map: ingredient_id → { stock, unit, receptions, ventes }
  const stockMap = new Map<string, { stock: number; unit: string | null; receptions: number; ventes: number }>();

  // Start from inventory
  for (const l of invLines) {
    stockMap.set(l.ingredient_id, {
      stock: l.quantite,
      unit: l.unite,
      receptions: 0,
      ventes: 0,
    });
  }

  // Apply movements
  for (const m of movements ?? []) {
    const entry = stockMap.get(m.ingredient_id) ?? { stock: 0, unit: m.unit, receptions: 0, ventes: 0 };
    const qty = Number(m.quantity);
    entry.stock += qty;
    if (m.type === "reception") entry.receptions += qty;
    else if (m.type === "vente") entry.ventes += Math.abs(qty);
    else entry.stock += 0; // adjustments already counted
    stockMap.set(m.ingredient_id, entry);
  }

  // 5. Also include all ingredients linked via popina_products (even without movements)
  const { data: popinaLinked } = await supabaseAdmin
    .from("popina_products")
    .select("ingredient_id")
    .eq("active", true)
    .not("ingredient_id", "is", null);

  for (const p of popinaLinked ?? []) {
    if (p.ingredient_id && !stockMap.has(p.ingredient_id)) {
      stockMap.set(p.ingredient_id, { stock: 0, unit: null, receptions: 0, ventes: 0 });
    }
  }

  // Also include ingredients from recipes linked via popina_products
  const { data: popinaRecipeLinked } = await supabaseAdmin
    .from("popina_products")
    .select("kitchen_recipe_id")
    .eq("active", true)
    .not("kitchen_recipe_id", "is", null);

  const recipeIds = [...new Set((popinaRecipeLinked ?? []).map(p => p.kitchen_recipe_id!))];
  if (recipeIds.length > 0) {
    const { data: recipeLines } = await supabaseAdmin
      .from("kitchen_recipe_lines")
      .select("ingredient_id")
      .in("recipe_id", recipeIds)
      .not("ingredient_id", "is", null);
    for (const l of recipeLines ?? []) {
      if (l.ingredient_id && !stockMap.has(l.ingredient_id)) {
        stockMap.set(l.ingredient_id, { stock: 0, unit: null, receptions: 0, ventes: 0 });
      }
    }
  }

  // 6. Get ingredient details
  const ids = [...stockMap.keys()];
  if (ids.length === 0) {
    return NextResponse.json({ inventory_date: lastInv?.date ?? null, items: [] });
  }

  const { data: ingredients } = await supabaseAdmin
    .from("ingredients")
    .select("id, name, category, stock_min, stock_objectif, purchase_unit_label, default_unit")
    .in("id", ids);

  const ingMap = new Map((ingredients ?? []).map((i) => [i.id, i]));

  const items = ids.map((id) => {
    const s = stockMap.get(id)!;
    const ing = ingMap.get(id);
    // Use purchase_unit_label (bouteille, paquet) as display unit, fallback to movement unit or default_unit
    const displayUnit = ing?.purchase_unit_label || s.unit || ing?.default_unit || "pcs";
    return {
      ingredient_id: id,
      name: ing?.name ?? "?",
      category: ing?.category ?? null,
      unit: displayUnit,
      stock: s.stock,
      receptions: s.receptions,
      ventes: s.ventes,
      stock_min: ing?.stock_min ? Number(ing.stock_min) : null,
      stock_objectif: ing?.stock_objectif ? Number(ing.stock_objectif) : null,
      alerte: ing?.stock_min ? s.stock <= Number(ing.stock_min) : false,
    };
  }).sort((a, b) => a.name.localeCompare(b.name, "fr"));

  return NextResponse.json({
    inventory_date: lastInv?.date ?? null,
    items,
  });
}
