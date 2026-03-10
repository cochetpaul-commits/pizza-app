import { NextResponse } from "next/server";
import { fetchReports, getParisDate, LOCATION_ID } from "@/lib/popinaClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const apiKey = process.env.POPINA_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "POPINA_API_KEY manquant" }, { status: 500 });
  }

  const today = getParisDate(0);
  const reports = await fetchReports(apiKey, today, today);

  // Popina peut renvoyer 0 rapport si la caisse n'a pas encore tourné
  const r = reports[0] ?? { totalSales: 0, guestsNumber: 0, reportProducts: [] };

  const totalSalesEur = (r.totalSales ?? 0) / 100;
  const guestsNumber = r.guestsNumber ?? 0;
  const ticketMoyen = guestsNumber > 0 ? Math.round((totalSalesEur / guestsNumber) * 100) / 100 : 0;

  return NextResponse.json({
    date: today,
    locationId: LOCATION_ID,
    totalSales: Math.round(totalSalesEur * 100) / 100,
    guestsNumber,
    ticketMoyen,
    reportProducts: (r.reportProducts ?? []).map((p) => ({
      name: p.productName ?? "Inconnu",
      quantity: p.productQuantity ?? 0,
      totalSales: Math.round((p.productSales ?? 0) / 100 * 100) / 100,
    })),
  });
}
