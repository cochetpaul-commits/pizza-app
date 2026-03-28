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
  type: "pizza" | "kitchen" | "cocktail";
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

  /* ── 2. Fetch recipe costs (pizza, kitchen, cocktails) ── */
  const [pizzaRes, kitchenRes, cocktailRes] = await Promise.all([
    supabaseAdmin
      .from("pizza_recipes")
      .select("name,total_cost")
      .eq("is_draft", false)
      .eq("etablissement_id", etabId),
    supabaseAdmin
      .from("kitchen_recipes")
      .select("name,category,total_cost,cost_per_portion,cost_per_kg")
      .eq("is_draft", false)
      .eq("etablissement_id", etabId),
    supabaseAdmin
      .from("cocktails")
      .select("name,total_cost")
      .eq("is_draft", false)
      .eq("etablissement_id", etabId),
  ]);

  const recipeCosts = new Map<string, RecipeCost>();

  for (const r of pizzaRes.data ?? []) {
    if (r.total_cost && r.total_cost > 0) {
      recipeCosts.set(normalize(r.name), {
        name: r.name,
        cost: r.total_cost,
        type: "pizza",
        recipeCategory: "Pizze",
      });
    }
  }
  for (const r of kitchenRes.data ?? []) {
    const cost = r.cost_per_portion ?? r.total_cost ?? r.cost_per_kg ?? 0;
    if (cost > 0) {
      recipeCosts.set(normalize(r.name), {
        name: r.name,
        cost,
        type: "kitchen",
        recipeCategory: r.category || "Cuisine",
      });
    }
  }
  for (const r of cocktailRes.data ?? []) {
    if (r.total_cost && r.total_cost > 0) {
      recipeCosts.set(normalize(r.name), {
        name: r.name,
        cost: r.total_cost,
        type: "cocktail",
        recipeCategory: "Cocktails",
      });
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
