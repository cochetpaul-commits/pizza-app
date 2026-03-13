import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * POST /api/commandes/ligne
 * Ajoute ou met à jour une ligne de commande.
 * Body: { session_id, ingredient_id, quantite, unite?, prix_unitaire_ht?, nom_libre? }
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { session_id, ingredient_id, quantite, unite, prix_unitaire_ht, nom_libre } = body;

  if (!session_id || (!ingredient_id && !nom_libre)) {
    return NextResponse.json({ error: "session_id et ingredient_id ou nom_libre requis" }, { status: 400 });
  }

  const totalLigne = prix_unitaire_ht && quantite
    ? Number((prix_unitaire_ht * quantite).toFixed(2))
    : null;

  // Si ingredient_id fourni, chercher une ligne existante pour cet ingrédient
  if (ingredient_id) {
    const { data: existing } = await supabaseAdmin
      .from("commande_lignes")
      .select("id")
      .eq("session_id", session_id)
      .eq("ingredient_id", ingredient_id)
      .maybeSingle();

    if (existing) {
      // Si quantité = 0, supprimer la ligne
      if (!quantite || quantite <= 0) {
        await supabaseAdmin
          .from("commande_lignes")
          .delete()
          .eq("id", existing.id);
        return NextResponse.json({ ok: true, deleted: true });
      }

      // Mise à jour
      const { data: ligne, error } = await supabaseAdmin
        .from("commande_lignes")
        .update({ quantite, unite, prix_unitaire_ht, total_ligne_ht: totalLigne })
        .eq("id", existing.id)
        .select("*, ingredients(name, category, default_unit)")
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, ligne });
    }
  }

  // Nouvelle ligne — quantité > 0 requise
  if (!quantite || quantite <= 0) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const insertData: Record<string, unknown> = {
    session_id,
    quantite,
    unite,
    prix_unitaire_ht,
    total_ligne_ht: totalLigne,
  };

  if (ingredient_id) {
    insertData.ingredient_id = ingredient_id;
  }

  const { data: ligne, error } = await supabaseAdmin
    .from("commande_lignes")
    .insert(insertData)
    .select("*, ingredients(name, category, default_unit)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, ligne });
}

/**
 * DELETE /api/commandes/ligne?id=xxx
 * Supprime une ligne de commande.
 */
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });

  const { error } = await supabaseAdmin
    .from("commande_lignes")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
