import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ── Normalize product name for matching ── */
function normalize(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* ── Types ── */
type VenteLigne = {
  date_service: string;
  description: string;
  categorie: string;
  quantite: number;
  ttc: number;
  ht: number;
  annule: boolean;
  type_ligne: string;
};

type RecipeCost = {
  name: string;
  cost: number;
  type: "pizza" | "kitchen" | "cocktail" | "ingredient";
  recipeCategory: string;
};

type ProductRow = {
  name: string;
  categorie: string;
  qty: number;
  ca_ttc: number;
  ca_ht: number;
  prix_revient: number | null;
  cout_total: number | null;
  marge_brute: number | null;
  marge_pct: number | null;
  food_cost_pct: number | null;
  matched: boolean;
};

/* ── GET /api/ventes/marges?etablissement_id=X&from=YYYY-MM-DD&to=YYYY-MM-DD ── */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const etabId = searchParams.get("etablissement_id");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (!etabId || !from || !to) {
    return NextResponse.json(
      { error: "etablissement_id, from, to requis" },
      { status: 400 },
    );
  }

  /* ── 1. Fetch ventes_lignes (paginated) ── */
  const PAGE = 1000;
  const allVentes: VenteLigne[] = [];
  let offset = 0;
  let hasMore = true;
  while (hasMore) {
    const { data, error } = await supabaseAdmin
      .from("ventes_lignes")
      .select(
        "date_service,description,categorie,quantite,ttc,ht,annule,type_ligne",
      )
      .eq("etablissement_id", etabId)
      .gte("date_service", from)
      .lte("date_service", to)
      .order("date_service", { ascending: true })
      .range(offset, offset + PAGE - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    allVentes.push(...((data ?? []) as VenteLigne[]));
    hasMore = (data?.length ?? 0) === PAGE;
    offset += PAGE;
  }

  /* ── 2. Fetch recipe costs (kitchen incl. pizza, cocktails) ── */
  const { data: kitchenData } = await supabaseAdmin
    .from("kitchen_recipes")
    .select("id,name,category,total_cost,cost_per_portion,cost_per_kg")
    .eq("is_draft", false)
    .eq("etablissement_id", etabId);

  const recipeCosts = new Map<string, RecipeCost>();

  for (const r of kitchenData ?? []) {
    const isPizza = r.category === "pizza";
    const isCocktail = r.category === "cocktail";
    const cost = isPizza
      ? (r.total_cost ?? 0)
      : (r.cost_per_portion ?? r.total_cost ?? r.cost_per_kg ?? 0);
    if (cost > 0) {
      recipeCosts.set(normalize(r.name), {
        name: r.name,
        cost,
        type: isPizza ? "pizza" : isCocktail ? "cocktail" : "kitchen",
        recipeCategory: isPizza ? "Pizze" : isCocktail ? "Cocktails" : (r.category || "Cuisine"),
      });
    }
  }

  /* ── 2b. Ingredients with popina_name → fallback matching ── */
  const { data: popinaIngredients } = await supabaseAdmin
    .from("ingredients")
    .select("id, popina_name, popina_dose_cl, piece_volume_ml, cost_per_unit, cost_per_kg, name")
    .not("popina_name", "is", null)
    .eq("is_active", true);

  // Also fetch supplier offers for these ingredients to get prices
  const popinaIds = (popinaIngredients ?? []).map(i => i.id);
  const { data: popinaOffers } = popinaIds.length > 0
    ? await supabaseAdmin.from("supplier_offers").select("ingredient_id, unit_price, pack_price, pack_count, pack_each_qty, price_kind").eq("is_active", true).in("ingredient_id", popinaIds)
    : { data: [] };
  const offerPriceMap = new Map<string, number>();
  for (const o of popinaOffers ?? []) {
    if (offerPriceMap.has(o.ingredient_id)) continue;
    if (o.unit_price && o.unit_price > 0) { offerPriceMap.set(o.ingredient_id, o.unit_price); continue; }
    if (o.pack_price && o.pack_count) {
      const perUnit = o.pack_price / (o.pack_count * (o.pack_each_qty ?? 1));
      if (perUnit > 0) offerPriceMap.set(o.ingredient_id, perUnit);
    }
  }

  for (const ing of popinaIngredients ?? []) {
    if (!ing.popina_name) continue;
    let unitCost = ing.cost_per_unit ?? ing.cost_per_kg ?? offerPriceMap.get(ing.id) ?? 0;
    if (unitCost <= 0) continue;

    // If dose is configured, compute cost per dose: (dose_cl × 10 / volume_ml) × unit_price
    const doseCl = Number(ing.popina_dose_cl) || 0;
    const volumeMl = Number(ing.piece_volume_ml) || 0;
    if (doseCl > 0 && volumeMl > 0) {
      unitCost = (doseCl * 10 / volumeMl) * unitCost;
    }

    const key = normalize(ing.popina_name);
    if (!recipeCosts.has(key)) {
      recipeCosts.set(key, {
        name: ing.popina_name,
        cost: Math.round(unitCost * 100) / 100,
        type: "ingredient",
        recipeCategory: "Ingredients",
      });
    }
  }

  /* ── 2c. Popina product links → recipe/ingredient mapping ── */
  const { data: popinaProducts } = await supabaseAdmin
    .from("popina_products")
    .select("id, name, linked_type, kitchen_recipe_id, ingredient_id")
    .not("linked_type", "is", null);

  if (popinaProducts && popinaProducts.length > 0) {
    // Batch: get all linked kitchen_recipes by ID
    const krIds = popinaProducts.filter(p => p.kitchen_recipe_id).map(p => p.kitchen_recipe_id!);
    const { data: linkedKR } = krIds.length > 0
      ? await supabaseAdmin.from("kitchen_recipes").select("id, name, category, total_cost, cost_per_portion, cost_per_kg").in("id", krIds)
      : { data: [] };
    const krMap = new Map((linkedKR ?? []).map(r => [r.id, r]));

    // Batch: get all linked ingredients by ID
    const ingIds = [...new Set(popinaProducts.filter(p => p.ingredient_id).map(p => p.ingredient_id!))];
    const { data: linkedIngs } = ingIds.length > 0
      ? await supabaseAdmin.from("ingredients").select("id, name, cost_per_unit, cost_per_kg, piece_volume_ml").in("id", ingIds)
      : { data: [] };
    const ingMap = new Map((linkedIngs ?? []).map(i => [i.id, i]));

    // Also load offers for these linked ingredients (they may not have popina_name)
    const missingOfferIds = ingIds.filter(id => !offerPriceMap.has(id));
    if (missingOfferIds.length > 0) {
      const { data: extraOffers } = await supabaseAdmin
        .from("supplier_offers")
        .select("ingredient_id, unit_price, pack_price, pack_count, pack_each_qty, price_kind")
        .eq("is_active", true)
        .in("ingredient_id", missingOfferIds);
      for (const o of extraOffers ?? []) {
        if (offerPriceMap.has(o.ingredient_id)) continue;
        if (o.unit_price && o.unit_price > 0) { offerPriceMap.set(o.ingredient_id, o.unit_price); continue; }
        if (o.pack_price && o.pack_count) {
          const perUnit = o.pack_price / (o.pack_count * (o.pack_each_qty ?? 1));
          if (perUnit > 0) offerPriceMap.set(o.ingredient_id, perUnit);
        }
      }
    }

    // Batch: get all dose mappings for these popina products
    const ppIds = popinaProducts.map(p => p.id);
    const { data: allDoses } = ppIds.length > 0
      ? await supabaseAdmin.from("popina_dose_map").select("popina_product_id, ingredient_id, dose, dose_unit").in("popina_product_id", ppIds)
      : { data: [] };
    const doseMap = new Map((allDoses ?? []).map(d => [d.popina_product_id, d]));

    for (const pp of popinaProducts) {
      if (!pp.name) continue;
      const key = normalize(pp.name);
      if (recipeCosts.has(key)) continue;

      if (pp.kitchen_recipe_id) {
        const kr = krMap.get(pp.kitchen_recipe_id);
        if (kr) {
          const isPizza = kr.category === "pizza";
          const cost = isPizza
            ? (kr.total_cost ?? 0)
            : (kr.cost_per_portion ?? kr.total_cost ?? kr.cost_per_kg ?? 0);
          if (cost > 0) {
            recipeCosts.set(key, {
              name: pp.name,
              cost,
              type: isPizza ? "pizza" : "kitchen",
              recipeCategory: kr.category || "Cuisine",
            });
          }
        }
      } else if (pp.ingredient_id) {
        const ing = ingMap.get(pp.ingredient_id);
        if (ing) {
          let unitCost = ing.cost_per_unit ?? ing.cost_per_kg ?? offerPriceMap.get(ing.id) ?? 0;
          const dose = doseMap.get(pp.id);
          if (dose) {
            const volumeMl = Number(ing.piece_volume_ml) || 0;
            if (dose.dose_unit === "cl" && volumeMl > 0) {
              unitCost = (dose.dose * 10 / volumeMl) * unitCost;
            } else {
              unitCost = dose.dose * unitCost;
            }
          }
          if (unitCost > 0) {
            recipeCosts.set(key, {
              name: pp.name,
              cost: Math.round(unitCost * 100) / 100,
              type: "ingredient",
              recipeCategory: "Ingredients",
            });
          }
        }
      }
    }
  }

  /* ── 3. Filter valid product lines & aggregate by product ── */
  const validRows = allVentes.filter(
    (r) => r.type_ligne === "Produit" && !r.annule && Number(r.ttc) > 0,
  );

  const prodMap = new Map<
    string,
    { qty: number; ca_ttc: number; ca_ht: number; categorie: string }
  >();
  for (const r of validRows) {
    if (!r.description) continue;
    const key = r.description;
    const prev = prodMap.get(key);
    if (prev) {
      prev.qty += Number(r.quantite) || 1;
      prev.ca_ttc += Number(r.ttc);
      prev.ca_ht += Number(r.ht);
    } else {
      prodMap.set(key, {
        qty: Number(r.quantite) || 1,
        ca_ttc: Number(r.ttc),
        ca_ht: Number(r.ht),
        categorie: r.categorie || "Autre",
      });
    }
  }

  /* ── 4. Match & compute margins ── */
  let totalCaTTC = 0;
  let totalCaHT = 0;
  let totalCOGS = 0;
  let totalQty = 0;
  let matchedCount = 0;

  const products: ProductRow[] = [];

  for (const [name, sales] of prodMap) {
    const ca_ttc = Math.round(sales.ca_ttc * 100) / 100;
    const ca_ht = Math.round(sales.ca_ht * 100) / 100;
    totalCaTTC += ca_ttc;
    totalCaHT += ca_ht;
    totalQty += sales.qty;

    const recipe = recipeCosts.get(normalize(name));

    if (recipe) {
      matchedCount++;
      const prix_revient = Math.round(recipe.cost * 100) / 100;
      const cout_total = Math.round(recipe.cost * sales.qty * 100) / 100;
      totalCOGS += cout_total;
      const marge_brute = Math.round((ca_ht - cout_total) * 100) / 100;
      const marge_pct =
        ca_ht > 0 ? Math.round((marge_brute / ca_ht) * 1000) / 10 : 0;
      const food_cost_pct =
        ca_ht > 0 ? Math.round((cout_total / ca_ht) * 1000) / 10 : 0;

      products.push({
        name,
        categorie: sales.categorie,
        qty: sales.qty,
        ca_ttc,
        ca_ht,
        prix_revient,
        cout_total,
        marge_brute,
        marge_pct,
        food_cost_pct,
        matched: true,
      });
    } else {
      products.push({
        name,
        categorie: sales.categorie,
        qty: sales.qty,
        ca_ttc,
        ca_ht,
        prix_revient: null,
        cout_total: null,
        marge_brute: null,
        marge_pct: null,
        food_cost_pct: null,
        matched: false,
      });
    }
  }

  // Sort by CA TTC descending
  products.sort((a, b) => b.ca_ttc - a.ca_ttc);

  /* ── 5. Category aggregation for charts ── */
  const catMap: Record<
    string,
    { ca_ht: number; cogs: number; ca_ttc: number }
  > = {};
  for (const p of products) {
    const cat = p.categorie || "Autre";
    if (!catMap[cat]) catMap[cat] = { ca_ht: 0, cogs: 0, ca_ttc: 0 };
    catMap[cat].ca_ht += p.ca_ht;
    catMap[cat].ca_ttc += p.ca_ttc;
    if (p.cout_total) catMap[cat].cogs += p.cout_total;
  }
  const categories = Object.entries(catMap)
    .map(([cat, v]) => ({
      cat,
      ca_ht: Math.round(v.ca_ht * 100) / 100,
      ca_ttc: Math.round(v.ca_ttc * 100) / 100,
      cogs: Math.round(v.cogs * 100) / 100,
      marge: Math.round((v.ca_ht - v.cogs) * 100) / 100,
      food_cost_pct:
        v.ca_ht > 0 ? Math.round((v.cogs / v.ca_ht) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.ca_ttc - a.ca_ttc);

  /* ── 6. KPIs ── */
  totalCaTTC = Math.round(totalCaTTC * 100) / 100;
  totalCaHT = Math.round(totalCaHT * 100) / 100;
  totalCOGS = Math.round(totalCOGS * 100) / 100;
  const margeBrute = Math.round((totalCaHT - totalCOGS) * 100) / 100;
  const foodCostPct =
    totalCaHT > 0 ? Math.round((totalCOGS / totalCaHT) * 1000) / 10 : 0;

  return NextResponse.json({
    kpis: {
      ca_ttc: totalCaTTC,
      ca_ht: totalCaHT,
      cogs: totalCOGS,
      marge_brute: margeBrute,
      food_cost_pct: foodCostPct,
      nb_produits: prodMap.size,
      nb_matched: matchedCount,
      total_qty: totalQty,
    },
    products,
    categories,
    recipeCount: recipeCosts.size,
  });
}
