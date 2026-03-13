import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * PATCH /api/commandes/favori
 * Toggle favori_commande on an ingredient.
 * Body: { ingredient_id: string, favori: boolean }
 */
export async function PATCH(req: NextRequest) {
  const { ingredient_id, favori } = await req.json();

  if (!ingredient_id) {
    return NextResponse.json({ error: "ingredient_id requis" }, { status: 400 });
  }
  if (typeof favori !== "boolean") {
    return NextResponse.json({ error: "favori (boolean) requis" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("ingredients")
    .update({ favori_commande: favori })
    .eq("id", ingredient_id)
    .select("id, name, favori_commande")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ingredient: data });
}
