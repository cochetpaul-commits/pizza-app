import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const sb = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

type FicheCatalogue = {
  id: string;
  type: "pizza" | "cuisine" | "cocktail";
  name: string;
  category: string;
  description_courte: string | null;
  wine_pairing: string | null;
  photo_url: string | null;
  price_ttc: number | null;
  allergens: string[];
  ingredients: { name: string; qty: number | null; unit: string | null }[];
  sub_recipes: { name: string; ingredients: string[] }[];
};

/** GET — fiches catalogue pour l'équipe */
export async function GET() {
  const supabase = sb();

  // Load all data in parallel
  const [
    { data: pizzas },
    { data: pizzaLines },
    { data: kitchens },
    { data: kitchenLines },
    { data: cocktailsData },
    { data: cocktailLines },
    { data: allIngredients },
    { data: popinaProducts },
  ] = await Promise.all([
    supabase.from("pizza_recipes").select("id, name, photo_url, description_courte, wine_pairing").eq("is_active", true),
    supabase.from("pizza_ingredients").select("recipe_id, ingredient_id, qty, unit"),
    supabase.from("kitchen_recipes").select("id, name, photo_url, category, description_courte, wine_pairing, fiche_type, is_active, output_ingredient_id"),
    supabase.from("kitchen_recipe_lines").select("recipe_id, ingredient_id, qty, unit"),
    supabase.from("cocktails").select("id, name, image_url, description_courte"),
    supabase.from("cocktail_ingredients").select("cocktail_id, ingredient_id, qty, unit"),
    supabase.from("ingredients").select("id, name, allergens, category"),
    supabase.from("popina_products").select("id, name, price_ttc, pizza_recipe_id, kitchen_recipe_id, cocktail_id").eq("active", true),
  ]);

  // Ingredient lookup
  const ingMap = new Map<string, { name: string; allergens: string[]; category: string | null }>();
  for (const i of allIngredients ?? []) {
    let allergens: string[] = [];
    try {
      allergens = typeof i.allergens === "string" ? JSON.parse(i.allergens) : (i.allergens ?? []);
    } catch { /* ignore */ }
    ingMap.set(i.id, { name: i.name, allergens, category: i.category });
  }

  // Kitchen recipes lookup (for sub-recipes: preparation/sauce used as ingredients)
  type Line = { recipe_id: string; ingredient_id: string; qty: number | null; unit: string | null };
  const kitchenMap = new Map<string, { name: string; category: string; lines: Line[] }>();
  for (const kr of kitchens ?? []) {
    const lines = (kitchenLines ?? []).filter((l) => l.recipe_id === kr.id);
    kitchenMap.set(kr.id, { name: kr.name, category: kr.category, lines });
    // Map output_ingredient_id to recipe for sub-recipe resolution
    if (kr.output_ingredient_id) {
      kitchenMap.set("out:" + kr.output_ingredient_id, { name: kr.name, category: kr.category, lines });
    }
  }

  // Popina price lookup
  const popinaPrice = new Map<string, number>();
  for (const pp of popinaProducts ?? []) {
    if (pp.pizza_recipe_id) popinaPrice.set("pizza:" + pp.pizza_recipe_id, pp.price_ttc);
    if (pp.kitchen_recipe_id) popinaPrice.set("kitchen:" + pp.kitchen_recipe_id, pp.price_ttc);
    if (pp.cocktail_id) popinaPrice.set("cocktail:" + pp.cocktail_id, pp.price_ttc);
  }

  /** Collect allergens recursively from recipe lines */
  function collectAllergens(lines: { ingredient_id: string }[], visited = new Set<string>()): string[] {
    const allergens = new Set<string>();
    for (const line of lines) {
      if (visited.has(line.ingredient_id)) continue;
      visited.add(line.ingredient_id);

      const ing = ingMap.get(line.ingredient_id);
      if (ing) {
        for (const a of ing.allergens) allergens.add(a);
      }
      // Check if this ingredient is the output of a sub-recipe
      const subRecipe = kitchenMap.get("out:" + line.ingredient_id);
      if (subRecipe) {
        for (const a of collectAllergens(subRecipe.lines, visited)) allergens.add(a);
      }
    }
    return [...allergens].sort();
  }

  /** Get sub-recipes (preparations/sauces) used in a recipe */
  function getSubRecipes(lines: { ingredient_id: string }[]): { name: string; ingredients: string[] }[] {
    const subs: { name: string; ingredients: string[] }[] = [];
    for (const line of lines) {
      const subRecipe = kitchenMap.get("out:" + line.ingredient_id);
      if (subRecipe && (subRecipe.category === "preparation" || subRecipe.category === "sauce")) {
        const subIngNames = subRecipe.lines.map((l) => ingMap.get(l.ingredient_id)?.name ?? "?");
        subs.push({ name: subRecipe.name, ingredients: subIngNames });
      }
    }
    return subs;
  }

  const fiches: FicheCatalogue[] = [];

  // Pizzas
  for (const p of pizzas ?? []) {
    const lines = (pizzaLines ?? []).filter((l) => l.recipe_id === p.id);
    fiches.push({
      id: p.id, type: "pizza", name: p.name, category: "pizza",
      description_courte: p.description_courte, wine_pairing: p.wine_pairing,
      photo_url: p.photo_url, price_ttc: popinaPrice.get("pizza:" + p.id) ?? null,
      allergens: collectAllergens(lines),
      ingredients: lines.map((l) => ({ name: ingMap.get(l.ingredient_id)?.name ?? "?", qty: l.qty, unit: l.unit })),
      sub_recipes: [],
    });
  }

  // Kitchen recipes (only plats vendus, pas les préparations internes)
  const sellCategories = ["entree", "plat_cuisine", "dessert", "accompagnement"];
  for (const kr of kitchens ?? []) {
    if (!kr.is_active || !sellCategories.includes(kr.category)) continue;
    const lines = (kitchenLines ?? []).filter((l) => l.recipe_id === kr.id);
    fiches.push({
      id: kr.id, type: "cuisine", name: kr.name, category: kr.category,
      description_courte: kr.description_courte, wine_pairing: kr.wine_pairing,
      photo_url: kr.photo_url, price_ttc: popinaPrice.get("kitchen:" + kr.id) ?? null,
      allergens: collectAllergens(lines),
      ingredients: lines.map((l) => ({ name: ingMap.get(l.ingredient_id)?.name ?? "?", qty: l.qty, unit: l.unit })),
      sub_recipes: getSubRecipes(lines),
    });
  }

  // Cocktails
  for (const c of cocktailsData ?? []) {
    const lines = (cocktailLines ?? []).filter((l) => l.cocktail_id === c.id);
    fiches.push({
      id: c.id, type: "cocktail", name: c.name, category: "cocktail",
      description_courte: c.description_courte, wine_pairing: null,
      photo_url: c.image_url, price_ttc: popinaPrice.get("cocktail:" + c.id) ?? null,
      allergens: collectAllergens(lines),
      ingredients: lines.map((l) => ({ name: ingMap.get(l.ingredient_id)?.name ?? "?", qty: l.qty, unit: l.unit })),
      sub_recipes: [],
    });
  }

  // Sort: pizzas first, then by category, then name
  const catOrder: Record<string, number> = { pizza: 0, entree: 1, plat_cuisine: 2, dessert: 3, accompagnement: 4, cocktail: 5 };
  fiches.sort((a, b) => (catOrder[a.category] ?? 9) - (catOrder[b.category] ?? 9) || a.name.localeCompare(b.name));

  return NextResponse.json(fiches);
}
