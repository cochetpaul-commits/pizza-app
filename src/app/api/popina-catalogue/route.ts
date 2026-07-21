import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const sb = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

/** GET — liste tous les produits Popina avec leurs liens */
export async function GET() {
  const supabase = sb();

  const { data, error } = await supabase
    .from("popina_products")
    .select("*")
    .eq("active", true)
    .order("category")
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fetch recipe/ingredient names for linked products
  const kitchenIds = data.filter((p) => p.kitchen_recipe_id).map((p) => p.kitchen_recipe_id);
  const ingredientIds = data.filter((p) => p.ingredient_id).map((p) => p.ingredient_id);

  const [kitchens, ingredients] = await Promise.all([
    kitchenIds.length ? supabase.from("kitchen_recipes").select("id, name").in("id", kitchenIds).then((r) => r.data ?? []) : [],
    ingredientIds.length ? supabase.from("ingredients").select("id, name").in("id", ingredientIds).then((r) => r.data ?? []) : [],
  ]);

  const nameMap: Record<string, string> = {};
  for (const r of [...kitchens, ...ingredients]) {
    nameMap[r.id] = r.name;
  }

  const enriched = data.map((p) => ({
    ...p,
    linked_name:
      nameMap[p.kitchen_recipe_id] ??
      nameMap[p.ingredient_id] ??
      null,
  }));

  return NextResponse.json(enriched);
}

/** PATCH — met à jour le lien d'un produit Popina */
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { popina_product_id, linked_type, linked_id } = body;

  if (!popina_product_id) {
    return NextResponse.json({ error: "popina_product_id requis" }, { status: 400 });
  }

  const supabase = sb();

  // Reset all links
  const update: Record<string, unknown> = {
    kitchen_recipe_id: null,
    ingredient_id: null,
    linked_type: linked_type || null,
    updated_at: new Date().toISOString(),
  };

  // Set the correct link (pizza, kitchen, and cocktail all go to kitchen_recipe_id)
  if (linked_type && linked_id) {
    if (linked_type === "pizza") update.kitchen_recipe_id = linked_id;
    else if (linked_type === "kitchen") update.kitchen_recipe_id = linked_id;
    else if (linked_type === "cocktail") update.kitchen_recipe_id = linked_id;
    else if (linked_type === "ingredient") update.ingredient_id = linked_id;
  } else {
    update.linked_type = null;
  }

  const { error } = await supabase
    .from("popina_products")
    .update(update)
    .eq("id", popina_product_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

/** GET /api/popina-catalogue/search?type=pizza&q=marg — cherche des recettes/ingrédients */
export async function POST(req: NextRequest) {
  const { type, q } = await req.json();
  const supabase = sb();

  const table =
    type === "pizza" ? "kitchen_recipes"
    : type === "kitchen" ? "kitchen_recipes"
    : type === "cocktail" ? "kitchen_recipes"
    : "ingredients";

  const { data, error } = await supabase
    .from(table)
    .select("id, name")
    .ilike("name", `%${q}%`)
    .limit(20)
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
