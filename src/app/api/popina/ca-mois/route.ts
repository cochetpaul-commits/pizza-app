import { NextRequest, NextResponse } from "next/server";
import { fetchReports, getParisDate } from "@/lib/popinaClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toParisDate(iso: string): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date(iso));
}

export async function GET(request: NextRequest) {
  const apiKey = process.env.POPINA_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "POPINA_API_KEY manquant" }, { status: 500 });
  }

  // Get month parameter (YYYY-MM) or default to current
  const monthParam = request.nextUrl.searchParams.get("month");
  const now = new Date();
  const year = monthParam ? parseInt(monthParam.split("-")[0]) : now.getFullYear();
  const month = monthParam ? parseInt(monthParam.split("-")[1]) - 1 : now.getMonth();

  const firstDay = new Date(year, month, 1).toISOString().slice(0, 10);
  const lastDay = new Date(year, month + 1, 0).toISOString().slice(0, 10);
  const today = getParisDate(0);

  // Previous month
  const prevFirstDay = new Date(year, month - 1, 1).toISOString().slice(0, 10);
  const prevLastDay = new Date(year, month, 0).toISOString().slice(0, 10);

  const locationParam = request.nextUrl.searchParams.get("locationId") || undefined;

  // Fetch current month + previous month reports
  const [currentReports, prevReports] = await Promise.all([
    fetchReports(apiKey, firstDay, lastDay > today ? today : lastDay, locationParam),
    fetchReports(apiKey, prevFirstDay, prevLastDay, locationParam),
  ]);

  // Aggregate by day
  const dailyMap = new Map<string, { ca: number; couverts: number }>();
  for (const r of currentReports) {
    const dateKey = r.startedAt ? toParisDate(r.startedAt) : null;
    if (!dateKey || dateKey < firstDay || dateKey > lastDay) continue;
    const prev = dailyMap.get(dateKey) ?? { ca: 0, couverts: 0 };
    prev.ca += (r.totalSales ?? 0) / 100;
    prev.couverts += r.guestsNumber ?? 0;
    dailyMap.set(dateKey, prev);
  }

  // Current month totals
  let caMois = 0;
  let couvertsMois = 0;
  const days: { date: string; ca: number; couverts: number }[] = [];
  for (const [date, data] of dailyMap) {
    caMois += data.ca;
    couvertsMois += data.couverts;
    days.push({ date, ca: Math.round(data.ca * 100) / 100, couverts: data.couverts });
  }
  days.sort((a, b) => a.date.localeCompare(b.date));

  // Previous month totals
  let caPrevMois = 0;
  let couvertsPrevMois = 0;
  for (const r of prevReports) {
    caPrevMois += (r.totalSales ?? 0) / 100;
    couvertsPrevMois += r.guestsNumber ?? 0;
  }

  const variation = caPrevMois > 0 ? ((caMois - caPrevMois) / caPrevMois) * 100 : 0;

  return NextResponse.json({
    month: `${year}-${String(month + 1).padStart(2, "0")}`,
    caMois: Math.round(caMois * 100) / 100,
    couvertsMois,
    ticketMoyen: couvertsMois > 0 ? Math.round((caMois / couvertsMois) * 100) / 100 : 0,
    caPrevMois: Math.round(caPrevMois * 100) / 100,
    couvertsPrevMois,
    variation: Math.round(variation * 10) / 10,
    days,
    nbJours: days.length,
    moyJournaliere: days.length > 0 ? Math.round((caMois / days.length) * 100) / 100 : 0,
  });
}
