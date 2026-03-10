import { NextResponse } from "next/server";
import { fetchReports, getParisDate } from "@/lib/popinaClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY_LABELS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

export async function GET() {
  const apiKey = process.env.POPINA_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "POPINA_API_KEY manquant" }, { status: 500 });
  }

  // Un appel par jour des 7 derniers jours, en parallèle
  const dates = Array.from({ length: 7 }, (_, i) => getParisDate(i - 6)); // [J-6 … J]

  const allReports = await Promise.all(
    dates.map((d) => fetchReports(apiKey, d, d))
  );

  const days = dates.map((dateStr, i) => {
    const reports = allReports[i];
    const r = reports[0] ?? { totalSales: 0, guestsNumber: 0 };
    const totalSalesEur = (r.totalSales ?? 0) / 100;
    const dow = new Date(dateStr + "T12:00:00").getDay();
    return {
      date: dateStr,
      label: DAY_LABELS[dow],
      totalSales: Math.round(totalSalesEur * 100) / 100,
      guestsNumber: r.guestsNumber ?? 0,
    };
  });

  const totalWeek = days.reduce((s, d) => s + d.totalSales, 0);

  return NextResponse.json({
    days,
    totalSales: Math.round(totalWeek * 100) / 100,
  });
}
