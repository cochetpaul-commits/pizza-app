import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getParisDate, dateToISOWeek, isoWeekToMonday, fmtDateUTC,
} from "@/lib/dateHelpers";
import { getEtablissement, EtabError } from "@/lib/getEtablissement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/pilotage/costs?week=YYYY-WW
 *
 * Returns cost metrics by crossing sales data with Supabase recipe costs.
 * - foodCostPct: global food cost %
 * - margeBrute: CA - COGS
 * - totalCOGS: total estimated cost of goods sold
 * - totalCA: total revenue
 * - matchRate: % of products matched to a recipe
 * - products: per-product cost breakdown
 */

function normalize(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type RecipeCost = {
  name: string;
  cost: number;        // € per unit
  sellPrice: number | null;
  type: "pizza" | "kitchen" | "cocktail";
};

export async function GET(request: NextRequest) {
  let etabId: string;
  try {
    ({ etabId } = await getEtablissement(request));
  } catch (e) {
    if (e instanceof EtabError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  // ── Week parameter ──
  const todayParis = getParisDate(0);
  const currentWeek = dateToISOWeek(todayParis);
  const selectedWeek = request.nextUrl.searchParams.get("week") || currentWeek;
  const isCurrentWeek = selectedWeek === currentWeek;

  const monday = isoWeekToMonday(selectedWeek);
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    return fmtDateUTC(d);
  });

  const activeDates = isCurrentWeek
    ? weekDates.filter((d) => d <= todayParis)
    : weekDates;

  const fetchTo = weekDates[6] > todayParis ? todayParis : weekDates[6];

  // ── Fetch sales from ventes_lignes + Supabase recipes in parallel ──
  const [pizzaRes, kitchenRes, cocktailRes] = await Promise.all([
    supabaseAdmin.from("pizza_recipes")
      .select("name,total_cost,sell_price")
      .eq("is_draft", false)
      .eq("etablissement_id", etabId),
    supabaseAdmin.from("kitchen_recipes")
      .select("name,total_cost,cost_per_portion,cost_per_kg,sell_price")
      .eq("is_draft", false)
      .eq("etablissement_id", etabId),
    supabaseAdmin.from("cocktails")
      .select("name,total_cost,sell_price")
      .eq("is_draft", false)
      .eq("etablissement_id", etabId),
  ]);

  // ── Build recipe cost map (normalized name → cost) ──
  const recipeCosts = new Map<string, RecipeCost>();

  for (const r of pizzaRes.data ?? []) {
    if (r.total_cost && r.total_cost > 0) {
      recipeCosts.set(normalize(r.name), {
        name: r.name,
        cost: r.total_cost,
        sellPrice: r.sell_price ?? null,
        type: "pizza",
      });
    }
  }

  for (const r of kitchenRes.data ?? []) {
    const cost = r.cost_per_portion ?? r.total_cost ?? r.cost_per_kg ?? 0;
    if (cost > 0) {
      recipeCosts.set(normalize(r.name), {
        name: r.name,
        cost,
        sellPrice: r.sell_price ?? null,
        type: "kitchen",
      });
    }
  }

  for (const r of cocktailRes.data ?? []) {
    if (r.total_cost && r.total_cost > 0) {
      recipeCosts.set(normalize(r.name), {
        name: r.name,
        cost: r.total_cost,
        sellPrice: r.sell_price ?? null,
        type: "cocktail",
      });
    }
  }

  // ── Fetch sales from ventes_lignes ──
  const PAGE = 1000;
  const allVentes: { date_service: string; description: string; categorie: string; quantite: number; ttc: number }[] = [];
  let vOff = 0;
  let vMore = true;
  while (vMore) {
    const { data: vd } = await supabaseAdmin
      .from("ventes_lignes")
      .select("date_service,description,categorie,quantite,ttc")
      .eq("etablissement_id", etabId)
      .eq("type_ligne", "Produit")
      .gte("date_service", weekDates[0])
      .lte("date_service", fetchTo)
      .range(vOff, vOff + PAGE - 1);
    allVentes.push(...(vd ?? []));
    vMore = (vd?.length ?? 0) === PAGE;
    vOff += PAGE;
  }

  const prodSales = new Map<string, { quantity: number; totalSales: number; category: string }>();
  for (const v of allVentes) {
    if (!v.description || !activeDates.includes(v.date_service)) continue;
    const name = v.description;
    const qty = Number(v.quantite) || 1;
    const sales = Math.round((Number(v.ttc) || 0) * 100);
    const prev = prodSales.get(name);
    if (prev) {
      prev.quantity += qty;
      prev.totalSales += sales;
    } else {
      prodSales.set(name, { quantity: qty, totalSales: sales, category: v.categorie || "" });
    }
  }

  // ── Match products to recipes and compute costs ──
  let totalCA = 0;
  let totalCOGS = 0;
  let matchedCA = 0;
  let matchedCount = 0;
  const products: Array<{
    name: string;
    category: string;
    ca: number;
    quantity: number;
    unitCost: number | null;
    totalCost: number | null;
    foodCostPct: number | null;
    matched: boolean;
  }> = [];

  for (const [name, sales] of prodSales) {
    const ca = Math.round(sales.totalSales / 100 * 100) / 100; // centimes → euros
    totalCA += ca;

    const normalizedName = normalize(name);
    const recipe = recipeCosts.get(normalizedName);

    if (recipe) {
      const unitCost = recipe.cost;
      const totalCost = Math.round(unitCost * sales.quantity * 100) / 100;
      totalCOGS += totalCost;
      matchedCA += ca;
      matchedCount++;

      products.push({
        name,
        category: sales.category,
        ca,
        quantity: sales.quantity,
        unitCost,
        totalCost,
        foodCostPct: ca > 0 ? Math.round((totalCost / ca) * 1000) / 10 : null,
        matched: true,
      });
    } else {
      products.push({
        name,
        category: sales.category,
        ca,
        quantity: sales.quantity,
        unitCost: null,
        totalCost: null,
        foodCostPct: null,
        matched: false,
      });
    }
  }

  // Sort by CA descending
  products.sort((a, b) => b.ca - a.ca);

  const foodCostPct = matchedCA > 0 ? Math.round((totalCOGS / matchedCA) * 1000) / 10 : null;
  const margeBrute = Math.round((totalCA - totalCOGS) * 100) / 100;

  // ── Previous week for comparison ──
  const prevMonday = new Date(monday);
  prevMonday.setUTCDate(monday.getUTCDate() - 7);
  const prevWeekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(prevMonday);
    d.setUTCDate(prevMonday.getUTCDate() + i);
    return fmtDateUTC(d);
  });
  const prevActiveDates = isCurrentWeek
    ? prevWeekDates.slice(0, activeDates.length)
    : prevWeekDates;

  const prevFetchTo = prevWeekDates[6] > todayParis ? todayParis : prevWeekDates[6];

  // Fetch prev week from ventes_lignes
  const prevVentes: typeof allVentes = [];
  let pvOff = 0;
  let pvMore = true;
  while (pvMore) {
    const { data: pvd } = await supabaseAdmin
      .from("ventes_lignes")
      .select("date_service,description,categorie,quantite,ttc")
      .eq("etablissement_id", etabId)
      .eq("type_ligne", "Produit")
      .gte("date_service", prevWeekDates[0])
      .lte("date_service", prevFetchTo)
      .range(pvOff, pvOff + PAGE - 1);
    prevVentes.push(...(pvd ?? []));
    pvMore = (pvd?.length ?? 0) === PAGE;
    pvOff += PAGE;
  }

  let prevTotalCA = 0;
  let prevTotalCOGS = 0;
  let prevMatchedCA = 0;

  for (const v of prevVentes) {
    if (!v.description || !prevActiveDates.includes(v.date_service)) continue;
    const ca = Number(v.ttc) || 0;
    prevTotalCA += ca;
    const recipe = recipeCosts.get(normalize(v.description));
    if (recipe) {
      const cost = Math.round(recipe.cost * (Number(v.quantite) || 1) * 100) / 100;
      prevTotalCOGS += cost;
      prevMatchedCA += ca;
    }
  }

  const prevFoodCostPct = prevMatchedCA > 0 ? Math.round((prevTotalCOGS / prevMatchedCA) * 1000) / 10 : null;
  const prevMargeBrute = Math.round((prevTotalCA - prevTotalCOGS) * 100) / 100;

  return NextResponse.json({
    week: selectedWeek,
    totalCA,
    totalCOGS: Math.round(totalCOGS * 100) / 100,
    foodCostPct,
    margeBrute,
    matchRate: prodSales.size > 0 ? Math.round((matchedCount / prodSales.size) * 100) : 0,
    matchedProducts: matchedCount,
    totalProducts: prodSales.size,
    prev: {
      totalCA: prevTotalCA,
      totalCOGS: Math.round(prevTotalCOGS * 100) / 100,
      foodCostPct: prevFoodCostPct,
      margeBrute: prevMargeBrute,
    },
    products,
  });
}
