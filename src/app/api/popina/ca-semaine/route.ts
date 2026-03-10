import { NextResponse } from "next/server";
import { fetchReports, getParisDate } from "@/lib/popinaClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY_LABELS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

/** Convertit un timestamp ISO en date Paris YYYY-MM-DD */
function toParisDate(iso: string): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date(iso));
}

export async function GET() {
  const apiKey = process.env.POPINA_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "POPINA_API_KEY manquant" }, { status: 500 });
  }

  // Un seul appel pour les 7 derniers jours
  const from = getParisDate(-6);
  const to = getParisDate(0);
  const reports = await fetchReports(apiKey, from, to);

  // Indexer les reports par date Paris (startedAt → YYYY-MM-DD)
  const byDate = new Map<string, { totalSales: number; guestsNumber: number }>();
  for (const r of reports) {
    const dateKey = r.startedAt ? toParisDate(r.startedAt) : null;
    if (!dateKey) continue;
    const prev = byDate.get(dateKey);
    if (prev) {
      prev.totalSales += r.totalSales ?? 0;
      prev.guestsNumber += r.guestsNumber ?? 0;
    } else {
      byDate.set(dateKey, {
        totalSales: r.totalSales ?? 0,
        guestsNumber: r.guestsNumber ?? 0,
      });
    }
  }

  // Construire le tableau des 7 jours (J-6 → J), 0€ si pas de report
  const dates = Array.from({ length: 7 }, (_, i) => getParisDate(i - 6));
  const days = dates.map((dateStr) => {
    const r = byDate.get(dateStr) ?? { totalSales: 0, guestsNumber: 0 };
    const dow = new Date(dateStr + "T12:00:00").getDay();
    return {
      date: dateStr,
      label: DAY_LABELS[dow],
      totalSales: Math.round((r.totalSales / 100) * 100) / 100,
      guestsNumber: r.guestsNumber,
    };
  });

  const totalWeek = days.reduce((s, d) => s + d.totalSales, 0);

  return NextResponse.json({
    days,
    totalSales: Math.round(totalWeek * 100) / 100,
  });
}
