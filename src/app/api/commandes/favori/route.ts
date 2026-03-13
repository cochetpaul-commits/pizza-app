import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getEtablissement, EtabError } from "@/lib/getEtablissement";

/**
 * PATCH /api/commandes/favori
 * Toggle favori_commande on an ingredient.
 * Body: { ingredient_id: string, favori: boolean }
 */
export async function PATCH(req: NextRequest) {
  let etabId: string;
  try {
    ({ etabId } = await getEtablissement(req));
  } catch (e) {
    if (e instanceof EtabError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const { ingredient_id, favori } = await req.json();

  if (!ingredient_id) {
    return NextResponse.json({ error: "ingredient_id requis" }, { status: 400 });
  }
  if (typeof favori !== "boolean") {
    return NextResponse.json({ error: "favori (boolean) requis" }, { status: 400 });
  }

  // Verify ingredient belongs to this etablissement
  const { data: ing } = await supabaseAdmin
    .from("ingredients")
    .select("id")
    .eq("id", ingredient_id)
    .eq("etablissement_id", etabId)
    .maybeSingle();

  if (!ing) {
    return NextResponse.json({ error: "Ingrédient introuvable pour cet établissement" }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin
    .from("ingredients")
    .update({ favori_commande: favori })
    .eq("id", ingredient_id)
    .eq("etablissement_id", etabId)
    .select("id, name, favori_commande")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ingredient: data });
}
