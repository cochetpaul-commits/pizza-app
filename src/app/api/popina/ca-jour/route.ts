import { NextRequest, NextResponse } from "next/server";
import { fetchReports, fetchOrders, getParisDate, LOCATION_ID } from "@/lib/popinaClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SALLE_PLACES = ["salle", "pergolas", "terrasse"];
const COUVERTS_CATEGORIES = ["pizze", "cucina"];

/** Parse "DD/MM/YYYY HH:MM" → { date: "YYYY-MM-DD", hour: number } */
function parsePopinaDateTime(raw: string): { date: string; hour: number } | null {
  const m = raw.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const [, dd, mm, yyyy, hh] = m;
  return { date: `${yyyy}-${mm}-${dd}`, hour: parseInt(hh, 10) };
}

/** Convert ISO timestamp to Paris date "YYYY-MM-DD" */
function toParisDate(iso: string): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date(iso));
}

export async function GET(request: NextRequest) {
  const apiKey = process.env.POPINA_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "POPINA_API_KEY manquant" }, { status: 500 });
  }

  const dateParam = request.nextUrl.searchParams.get("date");
  const date = dateParam || getParisDate(0);

  console.log(`[ca-jour] date demandée: ${date}`);

  // Fetch reports (totaux, produits, catégories) + orders (midi/soir, surPlace/aEmporter)
  const [allReports, allOrders] = await Promise.all([
    fetchReports(apiKey, date, date),
    fetchOrders(apiKey, date),
  ]);

  // ── Filtrer strictement par date ──
  const reports = allReports.filter((r) => {
    if (!r.startedAt) return false;
    return toParisDate(r.startedAt) === date;
  });

  const orders = allOrders.filter((o) => {
    const timeRef = o.closedAt || o.openedAt;
    if (!timeRef) return false;
    // Try DD/MM/YYYY format first
    const parsed = parsePopinaDateTime(timeRef);
    if (parsed) return parsed.date === date;
    // Fallback: try ISO format
    try { return toParisDate(timeRef) === date; } catch { return false; }
  });

  console.log(`[ca-jour] reports bruts: ${allReports.length}, filtrés: ${reports.length}`);
  console.log(`[ca-jour] orders bruts: ${allOrders.length}, filtrés: ${orders.length}`);

  // ── Totaux depuis reports ──
  let totalSalesCentimes = 0;
  let totalGuests = 0;
  const prodMap = new Map<string, { quantity: number; totalSales: number }>();
  const catMap = new Map<string, number>();

  for (const r of reports) {
    totalSalesCentimes += r.totalSales ?? 0;
    totalGuests += r.guestsNumber ?? 0;

    for (const p of r.reportProducts ?? []) {
      const name = p.productName ?? "Inconnu";
      const prev = prodMap.get(name);
      if (prev) {
        prev.quantity += p.productQuantity ?? 0;
        prev.totalSales += p.productSales ?? 0;
      } else {
        prodMap.set(name, { quantity: p.productQuantity ?? 0, totalSales: p.productSales ?? 0 });
      }
      const cat = p.productCategory;
      if (cat) catMap.set(cat, (catMap.get(cat) ?? 0) + (p.productSales ?? 0));
    }
  }

  // ── Midi / Soir + Sur place / À emporter depuis orders ──
  const midi = { ca: 0, couverts: 0 };
  const soir = { ca: 0, couverts: 0 };
  const surPlace = { ca: 0, couverts: 0 };
  const aEmporter = { ca: 0, couverts: 0 };

  for (const o of orders) {
    const sales = o.totalSales ?? 0;

    // Couverts estimés : somme des quantités d'items PIZZE/CUCINA
    let couverts = 0;
    for (const item of o.orderItems ?? []) {
      const cat = (item.productCategory ?? "").toLowerCase();
      if (COUVERTS_CATEGORIES.some((c) => cat.includes(c))) {
        couverts += item.productQuantity ?? 0;
      }
    }

    // Classification horaire par closedAt (ou openedAt en fallback)
    const timeRef = o.closedAt || o.openedAt;
    if (timeRef) {
      // Parse DD/MM/YYYY HH:MM format
      const parsed = parsePopinaDateTime(timeRef);
      const h = parsed ? parsed.hour : NaN;

      if (!isNaN(h)) {
        if (h >= 12 && h < 15) {
          midi.ca += sales;
          midi.couverts += couverts;
        } else if (h >= 19 || h === 0) {
          soir.ca += sales;
          soir.couverts += couverts;
        }
      }
    }

    // Sur place / À emporter par orderPlace
    const place = (o.orderPlace ?? "").toLowerCase();
    if (place && SALLE_PLACES.some((s) => place.includes(s))) {
      surPlace.ca += sales;
      surPlace.couverts += couverts;
    } else if (/emporter/i.test(place)) {
      aEmporter.ca += sales;
      aEmporter.couverts += couverts;
    }
  }

  const c2e = (c: number) => Math.round(c / 100 * 100) / 100;
  const totalSalesEur = c2e(totalSalesCentimes);
  const ticketMoyen = totalGuests > 0 ? Math.round((totalSalesEur / totalGuests) * 100) / 100 : 0;

  const topProducts = Array.from(prodMap.entries())
    .sort(([, a], [, b]) => b.totalSales - a.totalSales)
    .slice(0, 5)
    .map(([name, v]) => ({ name, quantity: v.quantity, totalSales: c2e(v.totalSales) }));

  const categories = Array.from(catMap.entries())
    .sort(([, a], [, b]) => b - a)
    .map(([name, centimes]) => ({
      name,
      ca: c2e(centimes),
      pct: totalSalesCentimes > 0 ? Math.round((centimes / totalSalesCentimes) * 100) : 0,
    }));

  return NextResponse.json({
    date,
    locationId: LOCATION_ID,
    totalSales: totalSalesEur,
    guestsNumber: totalGuests,
    ticketMoyen,
    midi: { ca: c2e(midi.ca), couverts: midi.couverts },
    soir: { ca: c2e(soir.ca), couverts: soir.couverts },
    surPlace: { ca: c2e(surPlace.ca), couverts: surPlace.couverts },
    aEmporter: { ca: c2e(aEmporter.ca), couverts: aEmporter.couverts },
    topProducts,
    categories,
  });
}
