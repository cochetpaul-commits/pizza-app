import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  fetchReports, getParisDate,
  dateToISOWeek, isoWeekToMonday, fmtDateUTC,
} from "@/lib/popinaClient";
import { getEtablissement, EtabError } from "@/lib/getEtablissement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/pilotage/costs?week=YYYY-WW
 *
 * Returns cost metrics by crossing Popina sales with Supabase recipe costs.
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
    .replace(/[\u0300-\u036f]/g, "")
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
  const apiKey = process.env.POPINA_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "POPINA_API_KEY manquant" }, { status: 500 });

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

  // ── Fetch Popina sales + Supabase recipes in parallel ──
  const [reports, pizzaRes, kitchenRes, cocktailRes] = await Promise.all([
    fetchReports(apiKey, weekDates[0], fetchTo),
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

  // ── Aggregate Popina product sales for active dates ──
  function toParisDate(iso: string): string {
    return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date(iso));
  }

  const prodSales = new Map<string, { quantity: number; totalSales: number; category: string }>();

  for (const r of reports) {
    if (!r.startedAt) continue;
    const date = toParisDate(r.startedAt);
    if (!activeDates.includes(date)) continue;

    for (const p of r.reportProducts ?? []) {
      const name = p.productName ?? "Inconnu";
      const prev = prodSales.get(name);
      if (prev) {
        prev.quantity += p.productQuantity ?? 0;
        prev.totalSales += p.productSales ?? 0;
      } else {
        prodSales.set(name, {
          quantity: p.productQuantity ?? 0,
          totalSales: p.productSales ?? 0,
          category: p.productCategory ?? "",
        });
      }
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
  const prevReports = await fetchReports(apiKey, prevWeekDates[0], prevFetchTo);

  let prevTotalCA = 0;
  let prevTotalCOGS = 0;
  let prevMatchedCA = 0;

  for (const r of prevReports) {
    if (!r.startedAt) continue;
    const date = toParisDate(r.startedAt);
    if (!prevActiveDates.includes(date)) continue;

    for (const p of r.reportProducts ?? []) {
      const ca = Math.round((p.productSales ?? 0) / 100 * 100) / 100;
      prevTotalCA += ca;

      const recipe = recipeCosts.get(normalize(p.productName ?? ""));
      if (recipe) {
        const cost = Math.round(recipe.cost * (p.productQuantity ?? 0) * 100) / 100;
        prevTotalCOGS += cost;
        prevMatchedCA += ca;
      }
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
