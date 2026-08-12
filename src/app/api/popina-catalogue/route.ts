import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const sb = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

/** Normalize: remove accents, lowercase */
function norm(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** Levenshtein distance (capped for perf) */
function levenshtein(a: string, b: string, maxDist = 3): number {
  if (Math.abs(a.length - b.length) > maxDist) return maxDist + 1;
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) => {
    const row = new Array(n + 1).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    let rowMin = dp[i][0];
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      if (dp[i][j] < rowMin) rowMin = dp[i][j];
    }
    if (rowMin > maxDist) return maxDist + 1;
  }
  return dp[m][n];
}

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

/** PATCH — met a jour le lien d'un produit Popina */
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

/** POST — search recipes/ingredients with fuzzy matching + supplier name */
export async function POST(req: NextRequest) {
  const { type, q } = await req.json();
  const supabase = sb();

  const isIngredient = type === "ingredient";
  const table = isIngredient ? "ingredients" : "kitchen_recipes";

  // Split query into words (min 2 chars)
  const words = (q as string).split(/\s+/).filter((w: string) => w.length >= 2);
  if (words.length === 0) return NextResponse.json([]);

  // Fetch a broader set — use OR ilike for each word to catch partial matches
  const orFilters = words.map(w => `name.ilike.%${w}%`).join(",");
  const { data, error } = await supabase
    .from(table)
    .select("id, name")
    .or(orFilters)
    .limit(200)
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const allItems: { id: string; name: string; supplier_id?: string }[] =
    (data ?? []).map(r => ({ id: r.id, name: r.name }));

  // Fetch supplier_id for ingredients separately
  if (isIngredient && allItems.length > 0) {
    const ids = allItems.map(i => i.id);
    const { data: ingData } = await supabase.from("ingredients").select("id, supplier_id").in("id", ids);
    const sidMap = new Map((ingData ?? []).map(r => [r.id, r.supplier_id as string | null]));
    for (const item of allItems) item.supplier_id = sidMap.get(item.id) ?? undefined;
  }

  // If query is a single short word (3-6 chars), also do fuzzy search on all items
  if (words.length === 1 && words[0].length >= 3 && allItems.length < 5) {
    const { data: allData } = await supabase.from(table).select("id, name").limit(500).order("name");
    const existingIds = new Set(allItems.map(i => i.id));
    const qNorm = norm(words[0]);

    for (const item of (allData ?? []) as { id: string; name: string; supplier_id?: string }[]) {
      if (existingIds.has(item.id)) continue;
      // Check each word in the item name for fuzzy match
      const itemWords = norm(item.name).split(/\s+/);
      const fuzzyMatch = itemWords.some(iw => {
        if (iw.length < 3) return false;
        // Exact substring match
        if (iw.includes(qNorm) || qNorm.includes(iw)) return true;
        // Levenshtein for words >= 4 chars
        if (qNorm.length >= 4 && iw.length >= 4) {
          const maxDist = qNorm.length <= 5 ? 1 : 2;
          return levenshtein(qNorm, iw, maxDist) <= maxDist;
        }
        return false;
      });
      if (fuzzyMatch) allItems.push(item);
    }
  }

  // Score results: exact word match > substring > fuzzy
  const qWords = words.map(w => norm(w));
  const scored = allItems.map(item => {
    const itemNorm = norm(item.name);
    const itemWords = itemNorm.split(/\s+/);
    let score = 0;

    for (const qw of qWords) {
      // Exact word match
      if (itemWords.some(iw => iw === qw)) { score += 10; continue; }
      // Substring match
      if (itemNorm.includes(qw)) { score += 5; continue; }
      // Fuzzy match (words >= 4 chars)
      if (qw.length >= 4) {
        const bestDist = Math.min(...itemWords.filter(iw => iw.length >= 3).map(iw => levenshtein(qw, iw, 2)));
        if (bestDist <= 2) { score += 3 - bestDist; continue; }
      }
    }
    return { ...item, score };
  })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, 30);

  // Fetch supplier names for ingredients
  if (isIngredient) {
    const supplierIds = [...new Set(scored.map(s => s.supplier_id).filter(Boolean))] as string[];
    const supplierNames: Record<string, string> = {};
    if (supplierIds.length) {
      const { data: sups } = await supabase.from("suppliers").select("id, name").in("id", supplierIds);
      for (const s of (sups ?? []) as { id: string; name: string }[]) {
        supplierNames[s.id] = s.name;
      }
    }
    return NextResponse.json(scored.map(({ score: _, supplier_id, ...rest }) => ({
      ...rest,
      supplier: supplier_id ? supplierNames[supplier_id] ?? null : null,
    })));
  }

  return NextResponse.json(scored.map(({ score: _, supplier_id: _s, ...rest }) => rest));
}
