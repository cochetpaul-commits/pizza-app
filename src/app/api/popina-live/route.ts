import { NextRequest, NextResponse } from "next/server";
import { fetchReports, reportsForParisDay, getParisDate, toParisDay, POPINA_BASE, LOCATION_ID } from "@/lib/popinaClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/popina-live?day=YYYY-MM-DD
 * Live sales: uses /v1/orders for today (real-time), /v1/reports for past days.
 */
export async function GET(req: NextRequest) {
  // Optional widget token auth
  const widgetToken = process.env.LIVE_WIDGET_KEY;
  if (widgetToken) {
    const token = req.nextUrl.searchParams.get("token") ?? req.headers.get("x-widget-token");
    const referer = req.headers.get("referer") ?? "";
    const isInternal = referer.includes(req.nextUrl.host);
    if (!isInternal && token !== widgetToken) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const apiKey = process.env.POPINA_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "POPINA_API_KEY manquant" }, { status: 500 });

  const day = req.nextUrl.searchParams.get("day") ?? getParisDate();
  const today = getParisDate();
  const isToday = day === today;

  try {
    if (isToday) {
      // LIVE mode: fetch orders directly
      return NextResponse.json(await fetchLiveOrders(apiKey, day));
    } else {
      // Historical mode: use reports
      return NextResponse.json(await fetchFromReports(apiKey, day));
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** Fetch today's orders directly from /v1/orders (paginated) and aggregate */
async function fetchLiveOrders(apiKey: string, day: string) {
  let totalCA = 0;
  let couverts = 0;
  const catMap = new Map<string, { ca: number; qty: number }>();
  const prodMap = new Map<string, { ca: number; qty: number; category: string }>();

  // Paginate through orders (most recent first)
  let pageIndex = 0;
  const pageSize = 100;
  let hasMore = true;

  while (hasMore) {
    const url = `${POPINA_BASE}/orders?locationId=${LOCATION_ID}&from=${day}&to=${day}&index=${pageIndex}&size=${pageSize}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    if (!res.ok) break;
    const json = await res.json();
    const orders = json.data ?? json ?? [];
    if (!Array.isArray(orders) || orders.length === 0) break;

    for (const order of orders) {
      // Filter: only orders opened today (Paris time), not cancelled
      const orderDay = toParisDay(order.openedAt);
      if (orderDay !== day) continue;
      if (order.isCanceled) continue;

      totalCA += order.total ?? 0;
      couverts += order.guests ?? 0;

      for (const item of order.items ?? []) {
        if (item.isCanceled) continue;
        const cat = item.category ?? "AUTRE";
        const qty = item.quantity ?? 1;
        const sales = item.total ?? 0;

        const catEntry = catMap.get(cat) ?? { ca: 0, qty: 0 };
        catEntry.ca += sales;
        catEntry.qty += qty;
        catMap.set(cat, catEntry);

        const prodEntry = prodMap.get(item.description) ?? { ca: 0, qty: 0, category: cat };
        prodEntry.ca += sales;
        prodEntry.qty += qty;
        prodMap.set(item.description, prodEntry);
      }
    }

    // Check pagination
    const totalCount = json.meta?.totalCount ?? orders.length;
    pageIndex++;
    hasMore = pageIndex * pageSize < totalCount && orders.length === pageSize;
    // Safety: max 20 pages (2000 orders)
    if (pageIndex >= 20) break;
  }

  return {
    day,
    live: true,
    totalCA: totalCA / 100,
    couverts,
    nbProduits: prodMap.size,
    categories: [...catMap.entries()]
      .map(([name, { ca, qty }]) => ({ name, ca: ca / 100, qty }))
      .sort((a, b) => b.ca - a.ca),
    topProducts: [...prodMap.entries()]
      .map(([name, { ca, qty, category }]) => ({ name, ca: ca / 100, qty, category }))
      .sort((a, b) => b.ca - a.ca)
      .slice(0, 20),
  };
}

/** Fetch from finalized reports (for past days) */
async function fetchFromReports(apiKey: string, day: string) {
  const fromWide = shiftDay(day, -1);
  const toWide = shiftDay(day, 1);
  const allReports = await fetchReports(apiKey, fromWide, toWide);
  const reports = reportsForParisDay(allReports, day);

  if (reports.length === 0) {
    return { day, live: false, totalCA: 0, couverts: 0, nbProduits: 0, categories: [], topProducts: [] };
  }

  let totalCA = 0;
  let couverts = 0;
  const catMap = new Map<string, { ca: number; qty: number }>();
  const prodMap = new Map<string, { ca: number; qty: number; category: string }>();

  for (const report of reports) {
    totalCA += report.totalSales;
    couverts += report.guestsNumber;
    for (const p of report.reportProducts ?? []) {
      const cat = (p as unknown as Record<string, string>).category ?? "AUTRE";
      const catEntry = catMap.get(cat) ?? { ca: 0, qty: 0 };
      catEntry.ca += p.productSales;
      catEntry.qty += p.productQuantity;
      catMap.set(cat, catEntry);

      const prodEntry = prodMap.get(p.productName) ?? { ca: 0, qty: 0, category: cat };
      prodEntry.ca += p.productSales;
      prodEntry.qty += p.productQuantity;
      prodMap.set(p.productName, prodEntry);
    }
  }

  return {
    day,
    live: false,
    totalCA: totalCA / 100,
    couverts,
    nbProduits: prodMap.size,
    categories: [...catMap.entries()]
      .map(([name, { ca, qty }]) => ({ name, ca: ca / 100, qty }))
      .sort((a, b) => b.ca - a.ca),
    topProducts: [...prodMap.entries()]
      .map(([name, { ca, qty, category }]) => ({ name, ca: ca / 100, qty, category }))
      .sort((a, b) => b.ca - a.ca)
      .slice(0, 20),
  };
}

function shiftDay(day: string, delta: number): string {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}
