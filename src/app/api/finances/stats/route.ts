import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getParisDate, dateToISOWeek, isoWeekToMonday, fmtDateUTC,
} from "@/lib/dateHelpers";
import { getEtablissement, EtabError } from "@/lib/getEtablissement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/finances/stats?mode=week&week=YYYY-WW
 * GET /api/finances/stats?mode=month&month=YYYY-MM
 *
 * Returns comprehensive financial data:
 * - P&L summary
 * - Per-product profitability
 * - Per-category profitability
 * - Weekly food cost trend (last 8 weeks for monthly, last 4 for weekly)
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
  cost: number;
  sellPrice: number | null;
  type: "pizza" | "kitchen" | "cocktail";
  category: string;
};

/** Get all dates in a month as YYYY-MM-DD strings */
function getMonthDates(monthStr: string): string[] {
  const [y, m] = monthStr.split("-").map(Number);
  const dates: string[] = [];
  const daysInMonth = new Date(y, m, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    dates.push(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  return dates;
}

/** Get the week label for a date */
function getWeekLabel(dateStr: string): string {
  const weekStr = dateToISOWeek(dateStr);
  return `S${weekStr.split("-")[1]}`;
}

async function loadRecipeCosts(etabId: string): Promise<Map<string, RecipeCost>> {
  const [pizzaRes, kitchenRes, cocktailRes] = await Promise.all([
    supabaseAdmin.from("pizza_recipes")
      .select("name,total_cost,sell_price")
      .eq("is_draft", false)
      .eq("etablissement_id", etabId),
    supabaseAdmin.from("kitchen_recipes")
      .select("name,category,total_cost,cost_per_portion,cost_per_kg,sell_price")
      .eq("is_draft", false)
      .eq("etablissement_id", etabId),
    supabaseAdmin.from("cocktails")
      .select("name,total_cost,sell_price")
      .eq("is_draft", false)
      .eq("etablissement_id", etabId),
  ]);

  const recipeCosts = new Map<string, RecipeCost>();

  for (const r of pizzaRes.data ?? []) {
    if (r.total_cost && r.total_cost > 0) {
      recipeCosts.set(normalize(r.name), {
        name: r.name, cost: r.total_cost, sellPrice: r.sell_price ?? null,
        type: "pizza", category: "Pizze",
      });
    }
  }
  for (const r of kitchenRes.data ?? []) {
    const cost = r.cost_per_portion ?? r.total_cost ?? r.cost_per_kg ?? 0;
    if (cost > 0) {
      recipeCosts.set(normalize(r.name), {
        name: r.name, cost, sellPrice: r.sell_price ?? null,
        type: "kitchen", category: r.category || "Cucina",
      });
    }
  }
  for (const r of cocktailRes.data ?? []) {
    if (r.total_cost && r.total_cost > 0) {
      recipeCosts.set(normalize(r.name), {
        name: r.name, cost: r.total_cost, sellPrice: r.sell_price ?? null,
        type: "cocktail", category: "Cocktails",
      });
    }
  }

  return recipeCosts;
}

function getCatLabel(category: string): string {
  const lower = category.toLowerCase();
  if (lower.includes("pizz")) return "PIZZE";
  if (lower.includes("cucin") || lower.includes("cuisine") || lower.includes("plat")) return "CUCINA";
  if (lower.includes("dessert") || lower.includes("dolci")) return "DESSERTS";
  if (lower.includes("cocktail")) return "COCKTAILS";
  if (lower.includes("boisson") || lower.includes("vin") || lower.includes("bière") || lower.includes("soft") || lower.includes("drink")) return "BOISSONS";
  return category.toUpperCase();
}

export async function GET(request: NextRequest) {
  let etabId: string;
  try {
    ({ etabId } = await getEtablissement(request));
  } catch (e) {
    if (e instanceof EtabError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const todayParis = getParisDate(0);
  const mode = request.nextUrl.searchParams.get("mode") || "week";

  // ── Determine date range ──
  let activeDates: string[];
  let periodLabel: string;
  let trendWeeks: number;

  if (mode === "month") {
    const monthParam = request.nextUrl.searchParams.get("month")
      || todayParis.slice(0, 7); // YYYY-MM
    const allDates = getMonthDates(monthParam);
    activeDates = allDates.filter((d) => d <= todayParis);
    periodLabel = new Date(monthParam + "-15").toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
    trendWeeks = 8;
  } else {
    const currentWeek = dateToISOWeek(todayParis);
    const selectedWeek = request.nextUrl.searchParams.get("week") || currentWeek;
    const isCurrentWeek = selectedWeek === currentWeek;
    const monday = isoWeekToMonday(selectedWeek);
    const weekDates = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setUTCDate(monday.getUTCDate() + i);
      return fmtDateUTC(d);
    });
    activeDates = isCurrentWeek ? weekDates.filter((d) => d <= todayParis) : weekDates;
    periodLabel = `Semaine ${selectedWeek.split("-")[1]}`;
    trendWeeks = 4;
  }

  if (activeDates.length === 0) {
    return NextResponse.json({ error: "Aucune date active" }, { status: 400 });
  }

  const fetchFrom = activeDates[0];
  const fetchTo = activeDates[activeDates.length - 1];

  // ── Also fetch trend data (previous weeks) ──
  const trendFrom = new Date(fetchFrom + "T12:00:00Z");
  trendFrom.setUTCDate(trendFrom.getUTCDate() - trendWeeks * 7);
  const trendFromStr = fmtDateUTC(trendFrom);

  // ── Parallel fetch ──
  // Fetch sales from ventes_lignes (replaces Popina API)
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
      .gte("date_service", trendFromStr)
      .lte("date_service", fetchTo)
      .range(vOff, vOff + PAGE - 1);
    allVentes.push(...(vd ?? []));
    vMore = (vd?.length ?? 0) === PAGE;
    vOff += PAGE;
  }

  const recipeCosts = await loadRecipeCosts(etabId);

  // ── Group sales by date ──
  const byDate = new Map<string, Map<string, { quantity: number; totalSales: number; category: string }>>();

  for (const v of allVentes) {
    const date = v.date_service;
    if (!date || !v.description) continue;
    if (!byDate.has(date)) byDate.set(date, new Map());
    const dayMap = byDate.get(date)!;
    const name = v.description;
    const prev = dayMap.get(name);
    const qty = Number(v.quantite) || 1;
    const sales = Math.round((Number(v.ttc) || 0) * 100); // centimes for compatibility
    if (prev) {
      prev.quantity += qty;
      prev.totalSales += sales;
    } else {
      dayMap.set(name, { quantity: qty, totalSales: sales, category: v.categorie || "" });
    }
  }

  // ── Aggregate for active period ──
  const prodTotals = new Map<string, { quantity: number; totalSales: number; category: string }>();
  for (const date of activeDates) {
    const dayProds = byDate.get(date);
    if (!dayProds) continue;
    for (const [name, data] of dayProds) {
      const prev = prodTotals.get(name);
      if (prev) {
        prev.quantity += data.quantity;
        prev.totalSales += data.totalSales;
      } else {
        prodTotals.set(name, { ...data });
      }
    }
  }

  // ── Compute per-product profitability ──
  let totalCA = 0;
  let totalCOGS = 0;
  let matchedCA = 0;
  let matchedCount = 0;

  type ProductProfit = {
    name: string;
    category: string;
    recipeCategory: string;
    ca: number;
    quantity: number;
    unitCost: number | null;
    totalCost: number | null;
    margin: number | null;
    foodCostPct: number | null;
    matched: boolean;
  };

  const products: ProductProfit[] = [];

  for (const [name, sales] of prodTotals) {
    const ca = Math.round(sales.totalSales / 100 * 100) / 100;
    totalCA += ca;

    const recipe = recipeCosts.get(normalize(name));
    if (recipe) {
      const totalCost = Math.round(recipe.cost * sales.quantity * 100) / 100;
      totalCOGS += totalCost;
      matchedCA += ca;
      matchedCount++;

      products.push({
        name, category: sales.category,
        recipeCategory: recipe.category,
        ca, quantity: sales.quantity,
        unitCost: recipe.cost,
        totalCost,
        margin: Math.round((ca - totalCost) * 100) / 100,
        foodCostPct: ca > 0 ? Math.round((totalCost / ca) * 1000) / 10 : null,
        matched: true,
      });
    } else {
      products.push({
        name, category: sales.category,
        recipeCategory: getCatLabel(sales.category),
        ca, quantity: sales.quantity,
        unitCost: null, totalCost: null, margin: null, foodCostPct: null,
        matched: false,
      });
    }
  }

  products.sort((a, b) => b.ca - a.ca);

  // ── Per-category profitability ──
  const catMap = new Map<string, { ca: number; cogs: number; matched: number; total: number }>();
  for (const p of products) {
    const cat = getCatLabel(p.category || p.recipeCategory);
    const prev = catMap.get(cat) ?? { ca: 0, cogs: 0, matched: 0, total: 0 };
    prev.ca += p.ca;
    if (p.matched && p.totalCost !== null) {
      prev.cogs += p.totalCost;
      prev.matched++;
    }
    prev.total++;
    catMap.set(cat, prev);
  }

  const categories = Array.from(catMap.entries())
    .map(([name, data]) => ({
      name,
      ca: Math.round(data.ca * 100) / 100,
      cogs: Math.round(data.cogs * 100) / 100,
      margin: Math.round((data.ca - data.cogs) * 100) / 100,
      foodCostPct: data.ca > 0 && data.cogs > 0 ? Math.round((data.cogs / data.ca) * 1000) / 10 : null,
      matchRate: data.total > 0 ? Math.round((data.matched / data.total) * 100) : 0,
    }))
    .sort((a, b) => b.ca - a.ca);

  // ── Weekly food cost trend ──
  const weeklyTrend: Array<{ week: string; ca: number; cogs: number; foodCostPct: number | null }> = [];

  // Group all dates into ISO weeks
  const allDatesSet = new Set<string>();
  for (const date of byDate.keys()) allDatesSet.add(date);
  const allDates = Array.from(allDatesSet).sort();

  const weekMap = new Map<string, { ca: number; cogs: number; matchedCA: number }>();
  for (const date of allDates) {
    const weekLabel = getWeekLabel(date);
    const dayProds = byDate.get(date);
    if (!dayProds) continue;

    if (!weekMap.has(weekLabel)) weekMap.set(weekLabel, { ca: 0, cogs: 0, matchedCA: 0 });
    const wk = weekMap.get(weekLabel)!;

    for (const [name, data] of dayProds) {
      const ca = Math.round(data.totalSales / 100 * 100) / 100;
      wk.ca += ca;
      const recipe = recipeCosts.get(normalize(name));
      if (recipe) {
        wk.cogs += Math.round(recipe.cost * data.quantity * 100) / 100;
        wk.matchedCA += ca;
      }
    }
  }

  for (const [week, data] of Array.from(weekMap.entries()).sort(([a], [b]) => a.localeCompare(b))) {
    weeklyTrend.push({
      week,
      ca: Math.round(data.ca * 100) / 100,
      cogs: Math.round(data.cogs * 100) / 100,
      foodCostPct: data.matchedCA > 0 ? Math.round((data.cogs / data.matchedCA) * 1000) / 10 : null,
    });
  }

  // ── P&L summary ──
  const foodCostPct = matchedCA > 0 ? Math.round((totalCOGS / matchedCA) * 1000) / 10 : null;
  const margeBrute = Math.round((totalCA - totalCOGS) * 100) / 100;

  return NextResponse.json({
    mode,
    periodLabel,
    pnl: {
      totalCA: Math.round(totalCA * 100) / 100,
      totalCOGS: Math.round(totalCOGS * 100) / 100,
      margeBrute,
      foodCostPct,
      matchRate: prodTotals.size > 0 ? Math.round((matchedCount / prodTotals.size) * 100) : 0,
      matchedProducts: matchedCount,
      totalProducts: prodTotals.size,
    },
    categories,
    products,
    weeklyTrend,
  });
}
