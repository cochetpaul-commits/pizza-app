import { NextRequest, NextResponse } from "next/server";
import {
  fetchReports, getParisDate,
  dateToISOWeek, isoWeekToMonday, fmtDateUTC,
} from "@/lib/popinaClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY_LABELS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

function toParisDate(iso: string): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date(iso));
}

type DayStats = {
  totalSales: number;   // centimes
  guestsNumber: number;
  products: Array<{ name: string; quantity: number; totalSales: number; category: string }>;
};

export async function GET(request: NextRequest) {
  const apiKey = process.env.POPINA_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "POPINA_API_KEY manquant" }, { status: 500 });

  // ── Week parameter ───────────────────────────────────────────────────────
  const todayParis = getParisDate(0);
  const currentWeek = dateToISOWeek(todayParis);
  const selectedWeek = request.nextUrl.searchParams.get("week") || currentWeek;
  const isCurrentWeek = selectedWeek === currentWeek;

  // Monday of selected week
  const monday = isoWeekToMonday(selectedWeek);
  // 7 date strings Mon→Sun
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    return fmtDateUTC(d);
  });

  // Active dates: current week → only up to today; past week → full Mon–Sun
  const activeDates = isCurrentWeek
    ? weekDates.filter((d) => d <= todayParis)
    : weekDates;

  // Previous week: same equivalent days
  const prevMonday = new Date(monday);
  prevMonday.setUTCDate(monday.getUTCDate() - 7);
  const prevDates = activeDates.map((_, i) => {
    const d = new Date(prevMonday);
    d.setUTCDate(prevMonday.getUTCDate() + i);
    return fmtDateUTC(d);
  });

  // ── Fetch reports (cover selected + prev week + 30 days for insights) ──
  const prevMondayStr = fmtDateUTC(prevMonday);
  const thirtyDaysAgo = getParisDate(-29);
  const fetchFrom = prevMondayStr < thirtyDaysAgo ? prevMondayStr : thirtyDaysAgo;
  const fetchTo = weekDates[6] > todayParis ? todayParis : weekDates[6];
  const reports = await fetchReports(apiKey, fetchFrom, fetchTo);

  // ── Group by Paris date ────────────────────────────────────────────────
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
        else existing.products.push({ name: p.productName ?? "?", quantity: p.productQuantity ?? 0, totalSales: p.productSales ?? 0, category: p.productCategory ?? "" });
      }
    } else {
      byDate.set(key, {
        totalSales: r.totalSales ?? 0,
        guestsNumber: r.guestsNumber ?? 0,
        products: (r.reportProducts ?? []).map((p) => ({
          name: p.productName ?? "?",
          quantity: p.productQuantity ?? 0,
          totalSales: p.productSales ?? 0,
          category: p.productCategory ?? "",
        })),
      });
    }
  }

  // ── Graph: 7 days of selected week (Mon→Sun) ──────────────────────────
  const days = weekDates.map((dateStr) => {
    const d = byDate.get(dateStr) ?? { totalSales: 0, guestsNumber: 0, products: [] };
    const dow = new Date(dateStr + "T12:00:00").getDay();
    const totalSales = Math.round(d.totalSales / 100 * 100) / 100;
    const ticketMoyen = d.guestsNumber > 0 ? Math.round((totalSales / d.guestsNumber) * 100) / 100 : 0;
    return { date: dateStr, label: DAY_LABELS[dow], totalSales, guestsNumber: d.guestsNumber, ticketMoyen };
  });

  // ── KPIs: active dates only (fair comparison) ─────────────────────────
  const activeDays = days.filter((d) => activeDates.includes(d.date));
  const totalSalesSem = activeDays.reduce((s, d) => s + d.totalSales, 0);
  const guestsSem = activeDays.reduce((s, d) => s + d.guestsNumber, 0);
  const ticketMoyenSem = guestsSem > 0 ? Math.round((totalSalesSem / guestsSem) * 100) / 100 : 0;
  const bestDay = activeDays.reduce(
    (b, d) => d.totalSales > b.totalSales ? d : b,
    activeDays[0] ?? { label: "—", totalSales: 0 },
  );

  // ── Previous week: equivalent days ────────────────────────────────────
  const prevDaysRaw = prevDates.map((d) => byDate.get(d) ?? { totalSales: 0, guestsNumber: 0, products: [] });
  const totalSalesPrec = Math.round(prevDaysRaw.reduce((s, d) => s + d.totalSales, 0) / 100 * 100) / 100;
  const guestsPrec = prevDaysRaw.reduce((s, d) => s + d.guestsNumber, 0);
  const ticketMoyenPrec = guestsPrec > 0 ? Math.round((totalSalesPrec / guestsPrec) * 100) / 100 : 0;

  // ── Top products: active dates ────────────────────────────────────────
  const prodMap = new Map<string, { quantity: number; totalSales: number }>();
  for (const dateStr of activeDates) {
    for (const p of byDate.get(dateStr)?.products ?? []) {
      const prev = prodMap.get(p.name);
      if (prev) { prev.quantity += p.quantity; prev.totalSales += p.totalSales; }
      else prodMap.set(p.name, { quantity: p.quantity, totalSales: p.totalSales });
    }
  }

  const prodMapPrec = new Map<string, number>();
  for (const dateStr of prevDates) {
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

  // ── Categories: active dates ──────────────────────────────────────────
  const catMap = new Map<string, number>();
  for (const dateStr of activeDates) {
    for (const p of byDate.get(dateStr)?.products ?? []) {
      if (p.category) catMap.set(p.category, (catMap.get(p.category) ?? 0) + p.totalSales);
    }
  }
  const totalSalesCentimesSem = Math.round(totalSalesSem * 100);
  // Top product per category (by quantity)
  const catTopProduct = new Map<string, { name: string; quantity: number }>();
  for (const dateStr of activeDates) {
    for (const p of byDate.get(dateStr)?.products ?? []) {
      if (!p.category) continue;
      const prev = catTopProduct.get(p.category);
      if (!prev) {
        catTopProduct.set(p.category, { name: p.name, quantity: p.quantity });
      } else {
        // Accumulate quantities per product per category
        if (p.name === prev.name) {
          prev.quantity += p.quantity;
        } else if (p.quantity > prev.quantity) {
          catTopProduct.set(p.category, { name: p.name, quantity: p.quantity });
        }
      }
    }
  }

  // More accurate: build full product-per-category map
  const catProdMap = new Map<string, Map<string, number>>();
  for (const dateStr of activeDates) {
    for (const p of byDate.get(dateStr)?.products ?? []) {
      if (!p.category) continue;
      if (!catProdMap.has(p.category)) catProdMap.set(p.category, new Map());
      const m = catProdMap.get(p.category)!;
      m.set(p.name, (m.get(p.name) ?? 0) + p.quantity);
    }
  }
  const catTopProductFinal = new Map<string, string>();
  for (const [cat, prods] of catProdMap) {
    let best = "";
    let bestQty = 0;
    for (const [name, qty] of prods) {
      if (qty > bestQty) { best = name; bestQty = qty; }
    }
    if (best) catTopProductFinal.set(cat, best);
  }

  const categories = Array.from(catMap.entries())
    .sort(([, a], [, b]) => b - a)
    .map(([name, centimes]) => ({
      name,
      ca: Math.round(centimes / 100 * 100) / 100,
      pct: totalSalesCentimesSem > 0 ? Math.round((centimes / totalSalesCentimesSem) * 100) : 0,
      topProduct: catTopProductFinal.get(name) ?? null,
    }));

  // ── Insights (only for current week, using 30-day data) ───────────────
  let insights: {
    meilleurJour: { label: string; avgCA: number } | null;
    produitEnHausse: { name: string; pctChange: number } | null;
    caVsMoyenne: { label: string; pct: number } | null;
  } = { meilleurJour: null, produitEnHausse: null, caVsMoyenne: null };

  if (isCurrentWeek) {
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

    const prodEnHausse = topSemaine
      .filter((p) => p.pctChange !== null && p.pctChange > 0)
      .sort((a, b) => (b.pctChange ?? 0) - (a.pctChange ?? 0))[0] ?? null;

    const todayData = byDate.get(todayParis);
    const todayDow = new Date(todayParis + "T12:00:00").getDay();
    let caVsMoyenne: { label: string; pct: number } | null = null;
    if (todayData && todayData.totalSales > 0 && avgByDow[todayDow].count >= 3) {
      const sumExToday = avgByDow[todayDow].total - todayData.totalSales;
      const countExToday = avgByDow[todayDow].count - 1;
      const avgCentimes = sumExToday / countExToday;
      const pct = Math.round(((todayData.totalSales - avgCentimes) / avgCentimes) * 100);
      caVsMoyenne = { label: DAY_LABELS[todayDow], pct };
    }

    insights = {
      meilleurJour,
      produitEnHausse: prodEnHausse ? { name: prodEnHausse.name, pctChange: prodEnHausse.pctChange! } : null,
      caVsMoyenne,
    };
  }

  return NextResponse.json({
    week: selectedWeek,
    isCurrentWeek,
    activeDays: activeDates.length,
    semaine: { totalSales: totalSalesSem, guestsNumber: guestsSem, ticketMoyen: ticketMoyenSem, bestDay, days },
    semainePrec: { totalSales: totalSalesPrec, guestsNumber: guestsPrec, ticketMoyen: ticketMoyenPrec },
    topSemaine,
    categories,
    insights,
  });
}
