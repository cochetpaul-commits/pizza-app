import { NextResponse } from "next/server";
import { POPINA_BASE, LOCATION_ID, getParisDate } from "@/lib/popinaClient";
import type { PopinaReport } from "@/lib/popinaClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const apiKey = process.env.POPINA_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "POPINA_API_KEY manquant" }, { status: 500 });
  }

  const today = getParisDate(0);
  const url = `${POPINA_BASE}/reports?locationId=${LOCATION_ID}&from=${today}&to=${today}`;
  console.log("[ca-jour] Requête →", url);

  let reports: PopinaReport[] = [];
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    const text = await res.text();
    console.log("[ca-jour] Status:", res.status);
    console.log("[ca-jour] Body brut:", text.slice(0, 1000));
    if (res.ok) {
      const data = JSON.parse(text);
      reports = Array.isArray(data) ? data : [data];
    }
  } catch (e) {
    console.error("[ca-jour] Erreur fetch:", e);
  }

  console.log("[ca-jour] reports.length:", reports.length);
  if (reports[0]) console.log("[ca-jour] reports[0] keys:", Object.keys(reports[0]));

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
      name: p.name ?? "Inconnu",
      quantity: p.quantity ?? 0,
      totalSales: Math.round((p.totalSales ?? 0) / 100 * 100) / 100,
    })),
  });
}
