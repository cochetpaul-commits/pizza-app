import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const sb = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

/** PATCH — met à jour description_courte et wine_pairing d'une recette */
export async function PATCH(req: NextRequest) {
  const { id, type, description_courte, wine_pairing, in_catalogue } = await req.json();

  if (!id || !type) {
    return NextResponse.json({ error: "id et type requis" }, { status: 400 });
  }

  const table =
    type === "pizza" ? "kitchen_recipes"
    : type === "cuisine" ? "kitchen_recipes"
    : type === "cocktail" ? "kitchen_recipes"
    : null;

  if (!table) {
    return NextResponse.json({ error: "type invalide" }, { status: 400 });
  }

  const supabase = sb();

  const update: Record<string, unknown> = {};
  if (description_courte !== undefined) update.description_courte = description_courte || null;
  if (wine_pairing !== undefined) update.wine_pairing = wine_pairing || null;
  if (in_catalogue !== undefined) {
    update.in_catalogue = in_catalogue;
    // Sync statut for kitchen_recipes (includes pizzas)
    if (table === "kitchen_recipes") {
      update.statut = in_catalogue ? "publiee" : "validee";
    }
  }

  const { error } = await supabase.from(table).update(update).eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
