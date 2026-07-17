import { NextRequest, NextResponse } from "next/server";
import { fetchReports, reportsForParisDay, getParisDate } from "@/lib/popinaClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/popina-live?day=YYYY-MM-DD
 * Returns live sales summary from Popina API for a given day (default: today).
 *
 * Response: {
 *   day, totalCA, couverts, nbProduits,
 *   categories: [{ name, ca, qty }],
 *   topProducts: [{ name, ca, qty, category }]
 * }
 */
export async function GET(req: NextRequest) {
  const apiKey = process.env.POPINA_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "POPINA_API_KEY manquant" }, { status: 500 });

  const day = req.nextUrl.searchParams.get("day") ?? getParisDate();

  try {
    const from = day;
    const to = day;
    // Fetch reports (widen by 1 day each side for timezone safety)
    const fromWide = shiftDay(from, -1);
    const toWide = shiftDay(to, 1);
    const allReports = await fetchReports(apiKey, fromWide, toWide);
    const reports = reportsForParisDay(allReports, day);

    if (reports.length === 0) {
      return NextResponse.json({
        day,
        totalCA: 0,
        couverts: 0,
        nbProduits: 0,
        categories: [],
        topProducts: [],
      });
    }

    // Aggregate across all reports for the day
    let totalCA = 0;
    let couverts = 0;
    const catMap = new Map<string, { ca: number; qty: number }>();
    const prodMap = new Map<string, { ca: number; qty: number; category: string }>();

    for (const report of reports) {
      totalCA += report.totalSales;
      couverts += report.guestsNumber;

      for (const p of report.reportProducts ?? []) {
        // Category aggregation
        const cat = (p as unknown as Record<string, string>).category ?? "AUTRE";
        const catEntry = catMap.get(cat) ?? { ca: 0, qty: 0 };
        catEntry.ca += p.productSales;
        catEntry.qty += p.productQuantity;
        catMap.set(cat, catEntry);

        // Product aggregation
        const prodEntry = prodMap.get(p.productName) ?? { ca: 0, qty: 0, category: cat };
        prodEntry.ca += p.productSales;
        prodEntry.qty += p.productQuantity;
        prodMap.set(p.productName, prodEntry);
      }
    }

    // Sort categories by CA desc
    const categories = [...catMap.entries()]
      .map(([name, { ca, qty }]) => ({ name, ca: ca / 100, qty }))
      .sort((a, b) => b.ca - a.ca);

    // Top 20 products by CA
    const topProducts = [...prodMap.entries()]
      .map(([name, { ca, qty, category }]) => ({ name, ca: ca / 100, qty, category }))
      .sort((a, b) => b.ca - a.ca)
      .slice(0, 20);

    return NextResponse.json({
      day,
      totalCA: totalCA / 100,
      couverts,
      nbProduits: prodMap.size,
      categories,
      topProducts,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function shiftDay(day: string, delta: number): string {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}
