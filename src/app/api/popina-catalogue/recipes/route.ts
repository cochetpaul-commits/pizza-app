import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const sb = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

type RecipeItem = {
  id: string;
  name: string;
  type: "pizza" | "kitchen" | "cocktail" | "ingredient";
  category?: string;
  popina_product_id?: string | null;
  popina_product_name?: string | null;
  popina_price?: number | null;
};

/** GET — liste toutes les recettes et ingrédients avec leur statut de lien Popina */
export async function GET() {
  const supabase = sb();

  const [pizzas, kitchens, cocktails, ingredients, popinaProducts] = await Promise.all([
    supabase.from("pizza_recipes").select("id, name").order("name").then((r) => r.data ?? []),
    supabase.from("kitchen_recipes").select("id, name").order("name").then((r) => r.data ?? []),
    supabase.from("cocktails").select("id, name").order("name").then((r) => r.data ?? []),
    supabase.from("ingredients").select("id, name, category").order("name").then((r) => r.data ?? []),
    supabase.from("popina_products").select("id, name, price_ttc, pizza_recipe_id, kitchen_recipe_id, cocktail_id, ingredient_id, linked_type").then((r) => r.data ?? []),
  ]);

  // Build reverse lookup: recipe/ingredient ID → popina product
  const linkMap: Record<string, { id: string; name: string; price: number }> = {};
  for (const pp of popinaProducts) {
    const linkedId = pp.pizza_recipe_id ?? pp.kitchen_recipe_id ?? pp.cocktail_id ?? pp.ingredient_id;
    if (linkedId) {
      linkMap[linkedId] = { id: pp.id, name: pp.name, price: pp.price_ttc };
    }
  }

  const items: RecipeItem[] = [];

  for (const p of pizzas) {
    const link = linkMap[p.id];
    items.push({
      id: p.id, name: p.name, type: "pizza",
      popina_product_id: link?.id ?? null,
      popina_product_name: link?.name ?? null,
      popina_price: link?.price ?? null,
    });
  }

  for (const k of kitchens) {
    const link = linkMap[k.id];
    items.push({
      id: k.id, name: k.name, type: "kitchen",
      popina_product_id: link?.id ?? null,
      popina_product_name: link?.name ?? null,
      popina_price: link?.price ?? null,
    });
  }

  for (const c of cocktails) {
    const link = linkMap[c.id];
    items.push({
      id: c.id, name: c.name, type: "cocktail",
      popina_product_id: link?.id ?? null,
      popina_product_name: link?.name ?? null,
      popina_price: link?.price ?? null,
    });
  }

  for (const i of ingredients) {
    const link = linkMap[i.id];
    items.push({
      id: i.id, name: i.name, type: "ingredient",
      category: i.category ?? undefined,
      popina_product_id: link?.id ?? null,
      popina_product_name: link?.name ?? null,
      popina_price: link?.price ?? null,
    });
  }

  return NextResponse.json(items);
}
