import { NextRequest, NextResponse } from "next/server";
import { etabAccessDenied } from "@/lib/getEtablissement";
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
type ProduitAgg = { description: string; categorie: string; qty: number; ca_ttc: number; ca_ht: number };

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
  /** Relié (recette/ingrédient) mais sans coût calculable : fiche incomplète ou ingrédient sans prix */
  linked_no_cost?: string | null;
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
  const denied = await etabAccessDenied(req, etabId);
  if (denied) return denied;


  /* ── 1+2. Ventes agrégées par produit (RPC SQL) + coûts recettes, en parallèle ── */
  async function fetchVentes(): Promise<ProduitAgg[]> {
    const { data, error } = await supabaseAdmin.rpc("ventes_par_produit", { p_etab: etabId, p_from: from, p_to: to });
    if (error) throw new Error(error.message);
    return (data ?? []) as ProduitAgg[];
  }

  // Convention kitchen_recipes.establishments : slugs bello_mio / piccola, NULL = visible partout.
  const { data: etabRow } = await supabaseAdmin.from("etablissements").select("slug").eq("id", etabId).maybeSingle();
  const etabSlug = (etabRow?.slug as string | undefined) ?? null;
  const recipeFilter = [
    `etablissement_id.eq.${etabId}`,
    "establishments.is.null",
    ...(etabSlug ? [`establishments.cs.{"${etabSlug}"}`] : []),
  ].join(",");

  const [allVentes, { data: kitchenData }] = await Promise.all([
    fetchVentes(),
    supabaseAdmin
      .from("kitchen_recipes")
      .select("id,name,category,total_cost,cost_per_portion,cost_per_kg")
      .eq("is_draft", false)
      .or(recipeFilter),
  ]);

  const recipeCosts = new Map<string, RecipeCost>();
  // Produits reliés à une fiche/un ingrédient sans coût → signalés à part (pas « non relié »)
  const linkedNoCost = new Map<string, string>();

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
    } else {
      linkedNoCost.set(normalize(r.name), `fiche « ${r.name} » sans coût`);
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
          } else {
            linkedNoCost.set(key, `fiche « ${kr.name} » sans coût`);
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
          } else {
            linkedNoCost.set(key, `ingrédient « ${ing.name} » sans prix`);
          }
        }
      } else {
        // Lien orphelin (recette/ingrédient supprimé puis recréé) : la cible a disparu
        linkedNoCost.set(key, "lien Popina orphelin — à relier dans Catalogue Popina");
      }
    }
  }

  /* ── 3. Produits vendus (déjà agrégés côté base) ── */
  const prodMap = new Map<string, { qty: number; ca_ttc: number; ca_ht: number; categorie: string }>();
  for (const r of allVentes) {
    prodMap.set(r.description, { qty: Number(r.qty) || 0, ca_ttc: Number(r.ca_ttc) || 0, ca_ht: Number(r.ca_ht) || 0, categorie: r.categorie || "Autre" });
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
        linked_no_cost: linkedNoCost.get(normalize(name)) ?? null,
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
