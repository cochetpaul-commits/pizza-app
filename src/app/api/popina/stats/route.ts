import { NextResponse } from "next/server";
import { fetchReports, getParisDate } from "@/lib/popinaClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY_LABELS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

function toParisDate(iso: string): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date(iso));
}

type DayStats = {
  totalSales: number;   // centimes
  guestsNumber: number;
  products: Array<{ name: string; quantity: number; totalSales: number }>; // centimes
};

export async function GET() {
  const apiKey = process.env.POPINA_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "POPINA_API_KEY manquant" }, { status: 500 });

  // Un seul appel pour 30 jours
  const reports = await fetchReports(apiKey, getParisDate(-29), getParisDate(0));

  // ── Grouper par date Paris ───────────────────────────────────────────────
  const byDate = new Map<string, DayStats>();
  for (const r of reports) {
    if (!r.startedAt) continue;
    const key = toParisDate(r.startedAt);
    const existing = byDate.get(key);
    if (existing) {
      existing.totalSales += r.totalSales ?? 0;
      existing.guestsNumber += r.guestsNumber ?? 0;
      for (const p of r.reportProducts ?? []) {
        const prev = existing.products.find((x) => x.name === p.productName);
        if (prev) { prev.quantity += p.productQuantity ?? 0; prev.totalSales += p.productSales ?? 0; }
        else existing.products.push({ name: p.productName ?? "?", quantity: p.productQuantity ?? 0, totalSales: p.productSales ?? 0 });
      }
    } else {
      byDate.set(key, {
        totalSales: r.totalSales ?? 0,
        guestsNumber: r.guestsNumber ?? 0,
        products: (r.reportProducts ?? []).map((p) => ({
          name: p.productName ?? "?",
          quantity: p.productQuantity ?? 0,
          totalSales: p.productSales ?? 0,
        })),
      });
    }
  }

  // ── 7 derniers jours (pour graphe + KPIs) ───────────────────────────────
  const dates7 = Array.from({ length: 7 }, (_, i) => getParisDate(i - 6));
  const days = dates7.map((dateStr) => {
    const d = byDate.get(dateStr) ?? { totalSales: 0, guestsNumber: 0, products: [] };
    const dow = new Date(dateStr + "T12:00:00").getDay();
    const totalSales = Math.round(d.totalSales / 100 * 100) / 100;
    const ticketMoyen = d.guestsNumber > 0 ? Math.round((totalSales / d.guestsNumber) * 100) / 100 : 0;
    return { date: dateStr, label: DAY_LABELS[dow], totalSales, guestsNumber: d.guestsNumber, ticketMoyen };
  });

  const totalSalesSem = days.reduce((s, d) => s + d.totalSales, 0);
  const guestsSem = days.reduce((s, d) => s + d.guestsNumber, 0);
  const ticketMoyenSem = guestsSem > 0 ? Math.round((totalSalesSem / guestsSem) * 100) / 100 : 0;
  const bestDay = days.reduce((b, d) => d.totalSales > b.totalSales ? d : b, days[0] ?? { label: "—", totalSales: 0 });

  // ── Semaine précédente (J-13 à J-7) ─────────────────────────────────────
  const datesPrev = Array.from({ length: 7 }, (_, i) => getParisDate(i - 13));
  const daysPrevRaw = datesPrev.map((d) => byDate.get(d) ?? { totalSales: 0, guestsNumber: 0, products: [] });
  const totalSalesPrec = Math.round(daysPrevRaw.reduce((s, d) => s + d.totalSales, 0) / 100 * 100) / 100;
  const guestsPrec = daysPrevRaw.reduce((s, d) => s + d.guestsNumber, 0);
  const ticketMoyenPrec = guestsPrec > 0 ? Math.round((totalSalesPrec / guestsPrec) * 100) / 100 : 0;

  // ── Top produits semaine (centimes) ─────────────────────────────────────
  const prodMap = new Map<string, { quantity: number; totalSales: number }>();
  for (const dateStr of dates7) {
    for (const p of byDate.get(dateStr)?.products ?? []) {
      const prev = prodMap.get(p.name);
      if (prev) { prev.quantity += p.quantity; prev.totalSales += p.totalSales; }
      else prodMap.set(p.name, { quantity: p.quantity, totalSales: p.totalSales });
    }
  }

  // Top produits semaine précédente (centimes) pour comparaison
  const prodMapPrec = new Map<string, number>();
  for (const dateStr of datesPrev) {
    for (const p of byDate.get(dateStr)?.products ?? []) {
      prodMapPrec.set(p.name, (prodMapPrec.get(p.name) ?? 0) + p.totalSales);
    }
  }
  const top5PrecNames = new Set(
    Array.from(prodMapPrec.entries()).sort(([, a], [, b]) => b - a).slice(0, 5).map(([n]) => n)
  );

  const topSemaine = Array.from(prodMap.entries())
    .sort(([, a], [, b]) => b.totalSales - a.totalSales)
    .slice(0, 5)
    .map(([name, v]) => {
      const prec = prodMapPrec.get(name) ?? 0;
      const pctChange = prec > 0 ? Math.round(((v.totalSales - prec) / prec) * 100) : null;
      return {
        name,
        quantity: v.quantity,
        totalSales: Math.round(v.totalSales / 100 * 100) / 100,
        isNew: !top5PrecNames.has(name),
        pctChange,
      };
    });

  // ── Insights ─────────────────────────────────────────────────────────────
  // 1. Meilleur jour de semaine (30j, moyenne CA)
  const avgByDow = Array.from({ length: 7 }, () => ({ total: 0, count: 0 }));
  for (const [dateStr, d] of byDate) {
    if (d.totalSales === 0) continue;
    const dow = new Date(dateStr + "T12:00:00").getDay();
    avgByDow[dow].total += d.totalSales;
    avgByDow[dow].count += 1;
  }
  const avgByDowEur = avgByDow.map((x) => x.count > 0 ? (x.total / x.count) / 100 : 0);
  const bestDowIdx = avgByDowEur.indexOf(Math.max(...avgByDowEur));
  const meilleurJour = avgByDow[bestDowIdx].count >= 2
    ? { label: DAY_LABELS[bestDowIdx], avgCA: Math.round(avgByDowEur[bestDowIdx] * 100) / 100 }
    : null;

  // 2. Produit en plus forte hausse
  const prodEnHausse = topSemaine
    .filter((p) => p.pctChange !== null && p.pctChange > 0)
    .sort((a, b) => (b.pctChange ?? 0) - (a.pctChange ?? 0))[0] ?? null;

  // 3. CA aujourd'hui vs moyenne du même jour de semaine
  const todayStr = getParisDate(0);
  const todayData = byDate.get(todayStr);
  const todayDow = new Date(todayStr + "T12:00:00").getDay();
  let caVsMoyenne: { label: string; pct: number } | null = null;
  if (todayData && todayData.totalSales > 0 && avgByDow[todayDow].count >= 3) {
    const sumExToday = avgByDow[todayDow].total - todayData.totalSales;
    const countExToday = avgByDow[todayDow].count - 1;
    const avgCentimes = sumExToday / countExToday;
    const pct = Math.round(((todayData.totalSales - avgCentimes) / avgCentimes) * 100);
    caVsMoyenne = { label: DAY_LABELS[todayDow], pct };
  }

  return NextResponse.json({
    semaine: { totalSales: totalSalesSem, guestsNumber: guestsSem, ticketMoyen: ticketMoyenSem, bestDay, days },
    semainePrec: { totalSales: totalSalesPrec, guestsNumber: guestsPrec, ticketMoyen: ticketMoyenPrec },
    topSemaine,
    insights: { meilleurJour, produitEnHausse: prodEnHausse ? { name: prodEnHausse.name, pctChange: prodEnHausse.pctChange! } : null, caVsMoyenne },
  });
}
