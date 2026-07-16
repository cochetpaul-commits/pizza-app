import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const sb = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

/** PATCH — met à jour description_courte et wine_pairing d'une recette */
export async function PATCH(req: NextRequest) {
  const { id, type, description_courte, wine_pairing } = await req.json();

  if (!id || !type) {
    return NextResponse.json({ error: "id et type requis" }, { status: 400 });
  }

  const table =
    type === "pizza" ? "pizza_recipes"
    : type === "cuisine" ? "kitchen_recipes"
    : type === "cocktail" ? "cocktails"
    : null;

  if (!table) {
    return NextResponse.json({ error: "type invalide" }, { status: 400 });
  }

  const supabase = sb();

  const update: Record<string, unknown> = {};
  if (description_courte !== undefined) update.description_courte = description_courte || null;
  if (wine_pairing !== undefined && table !== "cocktails") update.wine_pairing = wine_pairing || null;

  const { error } = await supabase.from(table).update(update).eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
