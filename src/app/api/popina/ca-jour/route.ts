import { NextRequest, NextResponse } from "next/server";
import { fetchReports, getParisDate, LOCATION_ID } from "@/lib/popinaClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SALLE_ROOMS = ["salle", "pergolas", "terrasse"];

function getParisHour(iso: string): number {
  const str = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hour12: false,
    timeZone: "Europe/Paris",
  }).format(new Date(iso));
  return parseInt(str, 10);
}

export async function GET(request: NextRequest) {
  const apiKey = process.env.POPINA_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "POPINA_API_KEY manquant" }, { status: 500 });
  }

  const dateParam = request.nextUrl.searchParams.get("date");
  const date = dateParam || getParisDate(0);
  const reports = await fetchReports(apiKey, date, date);

  let totalSalesCentimes = 0;
  let totalGuests = 0;
  const midi = { ca: 0, couverts: 0 };
  const soir = { ca: 0, couverts: 0 };
  const surPlace = { ca: 0, couverts: 0 };
  const aEmporter = { ca: 0, couverts: 0 };
  const prodMap = new Map<string, { quantity: number; totalSales: number }>();
  const catMap = new Map<string, number>();

  for (const r of reports) {
    const sales = r.totalSales ?? 0;
    const guests = r.guestsNumber ?? 0;
    totalSalesCentimes += sales;
    totalGuests += guests;

    // ── Midi / Soir ──
    if (r.startedAt) {
      const h = getParisHour(r.startedAt);
      if (h >= 10 && h <= 14) { midi.ca += sales; midi.couverts += guests; }
      else if (h >= 18 || h === 0) { soir.ca += sales; soir.couverts += guests; }
    }

    // ── Sur place / À emporter ──
    const room = (r as Record<string, unknown>).roomName as string | undefined;
    if (room) {
      const lower = room.toLowerCase();
      if (SALLE_ROOMS.some((s) => lower.includes(s))) {
        surPlace.ca += sales;
        surPlace.couverts += guests;
      } else if (lower.includes("emporter")) {
        aEmporter.ca += sales;
        aEmporter.couverts += guests;
      }
    }

    // ── Produits + catégories ──
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
