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

  // 5. Get ingredient names
  const ids = [...stockMap.keys()];
  if (ids.length === 0) {
    return NextResponse.json({ inventory_date: lastInv?.date ?? null, items: [] });
  }

  const { data: ingredients } = await supabaseAdmin
    .from("ingredients")
    .select("id, name, category, stock_min, stock_objectif")
    .in("id", ids);

  const ingMap = new Map((ingredients ?? []).map((i) => [i.id, i]));

  const items = ids.map((id) => {
    const s = stockMap.get(id)!;
    const ing = ingMap.get(id);
    return {
      ingredient_id: id,
      name: ing?.name ?? "?",
      category: ing?.category ?? null,
      unit: s.unit,
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
