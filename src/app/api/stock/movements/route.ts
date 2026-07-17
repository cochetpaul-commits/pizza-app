import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getEtablissement, EtabError } from "@/lib/getEtablissement";

/**
 * GET /api/stock/movements?ingredient_id=xxx&limit=50
 * Returns recent stock movements for an ingredient.
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
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 50), 200);

  let q = supabaseAdmin
    .from("stock_movements")
    .select("id, ingredient_id, type, quantity, unit, reference_type, reference_id, note, created_at")
    .eq("etablissement_id", etabId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (ingredientId) q = q.eq("ingredient_id", ingredientId);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data ?? []);
}

/**
 * POST /api/stock/movements
 * Create a manual stock adjustment.
 * Body: { ingredient_id, quantity, unit, note }
 */
export async function POST(req: NextRequest) {
  let etabId: string;
  try {
    ({ etabId } = await getEtablissement(req));
  } catch (e) {
    if (e instanceof EtabError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const { ingredient_id, quantity, unit, note } = await req.json();
  if (!ingredient_id || quantity == null) {
    return NextResponse.json({ error: "ingredient_id et quantity requis" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("stock_movements")
    .insert({
      etablissement_id: etabId,
      ingredient_id,
      type: "ajustement",
      quantity,
      unit,
      reference_type: "manual",
      note: note ?? null,
    });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
