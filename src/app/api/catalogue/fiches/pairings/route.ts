import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const sb = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

const DRINK_CATEGORIES = ["vins", "spiritueux", "biere", "soft", "cafeteria", "liqueurs", "sirops"];

/** GET — liste des boissons disponibles pour accords */
export async function GET(req: NextRequest) {
  const supabase = sb();
  const q = req.nextUrl.searchParams.get("q")?.toLowerCase() ?? "";

  let query = supabase
    .from("ingredients")
    .select("id, name, category")
    .in("category", DRINK_CATEGORIES)
    .order("name");

  if (q) query = query.ilike("name", `%${q}%`);

  const { data, error } = await query.limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

/** POST — ajouter un accord */
export async function POST(req: NextRequest) {
  const { recipe_id, recipe_type, ingredient_id } = await req.json();
  if (!recipe_id || !recipe_type || !ingredient_id) {
    return NextResponse.json({ error: "Champs requis" }, { status: 400 });
  }

  const supabase = sb();
  const { error } = await supabase
    .from("recipe_pairings")
    .upsert({ recipe_id, recipe_type, ingredient_id }, { onConflict: "recipe_id,recipe_type,ingredient_id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** DELETE — supprimer un accord */
export async function DELETE(req: NextRequest) {
  const { recipe_id, recipe_type, ingredient_id } = await req.json();
  if (!recipe_id || !recipe_type || !ingredient_id) {
    return NextResponse.json({ error: "Champs requis" }, { status: 400 });
  }

  const supabase = sb();
  const { error } = await supabase
    .from("recipe_pairings")
    .delete()
    .eq("recipe_id", recipe_id)
    .eq("recipe_type", recipe_type)
    .eq("ingredient_id", ingredient_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
