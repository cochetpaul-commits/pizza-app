import { NextRequest, NextResponse } from "next/server";
import {
  fetchReports, fetchOrders, getParisDate,
  dateToISOWeek, isoWeekToMonday, fmtDateUTC,
  type PopinaOrder,
} from "@/lib/popinaClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY_LABELS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
const DAY_LABELS_FULL = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const SALLE_PLACES = ["salle"];
const PERGOLAS_PLACES = ["pergolas"];
const TERRASSE_PLACES = ["terrasse"];
const COUVERTS_CATEGORIES = ["pizze", "cucina"];

function toParisDate(iso: string): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date(iso));
}

function parsePopinaDateTime(raw: string): { date: string; hour: number } | null {
  const m = raw.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const [, dd, mm, yyyy, hh] = m;
  return { date: `${yyyy}-${mm}-${dd}`, hour: parseInt(hh, 10) };
}

const c2e = (c: number) => Math.round(c / 100 * 100) / 100;

type ZoneData = { salle: number; pergolas: number; terrasse: number; emporter: number };
type ServiceZoneData = {
  journee: ZoneData & { total: number; totalHT: number; pax: number; ticketMoyen: number; ticketEmporter: number; ratioPiattiPizza: number };
  midi: ZoneData & { total: number; pax: number; ticketMoyen: number };
  soir: ZoneData & { total: number; pax: number; ticketMoyen: number };
};

function classifyOrder(o: PopinaOrder): { zone: "salle" | "pergolas" | "terrasse" | "emporter"; service: "midi" | "soir" | "other"; ca: number; pax: number } {
  const ca = o.totalSales ?? 0;

  // Couverts: count pizze/cucina items
  let pax = 0;
  for (const item of o.orderItems ?? []) {
    const cat = (item.productCategory ?? "").toLowerCase();
    if (COUVERTS_CATEGORIES.some(c => cat.includes(c))) {
      pax += item.productQuantity ?? 0;
    }
  }

  // Zone
  const place = (o.orderPlace ?? "").toLowerCase();
  let zone: "salle" | "pergolas" | "terrasse" | "emporter" = "salle";
  if (PERGOLAS_PLACES.some(s => place.includes(s))) zone = "pergolas";
  else if (TERRASSE_PLACES.some(s => place.includes(s))) zone = "terrasse";
  else if (/emporter/i.test(place)) zone = "emporter";
  else if (SALLE_PLACES.some(s => place.includes(s))) zone = "salle";

  // Service (Midi/Soir)
  const timeRef = o.closedAt || o.openedAt;
  let service: "midi" | "soir" | "other" = "other";
  if (timeRef) {
    const parsed = parsePopinaDateTime(timeRef);
    if (parsed) {
      if (parsed.hour >= 11 && parsed.hour < 16) service = "midi";
      else if (parsed.hour >= 18 || parsed.hour <= 2) service = "soir";
    }
  }

  return { zone, service, ca, pax };
}

function processOrders(orders: PopinaOrder[]): ServiceZoneData {
  const data: ServiceZoneData = {
    journee: { salle: 0, pergolas: 0, terrasse: 0, emporter: 0, total: 0, totalHT: 0, pax: 0, ticketMoyen: 0, ticketEmporter: 0, ratioPiattiPizza: 0 },
    midi: { salle: 0, pergolas: 0, terrasse: 0, emporter: 0, total: 0, pax: 0, ticketMoyen: 0 },
    soir: { salle: 0, pergolas: 0, terrasse: 0, emporter: 0, total: 0, pax: 0, ticketMoyen: 0 },
  };

  let piattiCa = 0;
  let pizzaCa = 0;
  let paxEmporter = 0;
  let caEmporter = 0;

  for (const o of orders) {
    const { zone, service, ca, pax } = classifyOrder(o);

    // Journée totals
    data.journee[zone] += ca;
    data.journee.total += ca;
    data.journee.pax += pax;

    if (zone === "emporter") {
      paxEmporter += pax;
      caEmporter += ca;
    }

    // Service breakdown
    if (service === "midi") {
      data.midi[zone] += ca;
      data.midi.total += ca;
      data.midi.pax += pax;
    } else if (service === "soir") {
      data.soir[zone] += ca;
      data.soir.total += ca;
      data.soir.pax += pax;
    }

    // Piatti/Pizza ratio
    for (const item of o.orderItems ?? []) {
      const cat = (item.productCategory ?? "").toLowerCase();
      const itemCa = item.productSales ?? 0;
      if (cat.includes("pizze")) pizzaCa += itemCa;
      else if (cat.includes("cucina") || cat.includes("piatti")) piattiCa += itemCa;
    }
  }

  // Convert centimes to euros
  for (const key of ["salle", "pergolas", "terrasse", "emporter"] as const) {
    data.journee[key] = c2e(data.journee[key]);
    data.midi[key] = c2e(data.midi[key]);
    data.soir[key] = c2e(data.soir[key]);
  }
  data.journee.total = c2e(data.journee.total);
  data.journee.totalHT = c2e(Math.round(data.journee.total * 100 / 1.1)); // TVA 10% approx
  data.midi.total = c2e(data.midi.total);
  data.soir.total = c2e(data.soir.total);

  // Tickets
  const paxSurPlace = data.journee.pax - paxEmporter;
  data.journee.ticketMoyen = paxSurPlace > 0 ? c2e(Math.round((data.journee.total - c2e(caEmporter)) / paxSurPlace * 100)) : 0;
  data.journee.ticketEmporter = paxEmporter > 0 ? c2e(Math.round(c2e(caEmporter) / paxEmporter * 100)) : 0;
  data.midi.ticketMoyen = data.midi.pax > 0 ? c2e(Math.round(data.midi.total / data.midi.pax * 100)) : 0;
  data.soir.ticketMoyen = data.soir.pax > 0 ? c2e(Math.round(data.soir.total / data.soir.pax * 100)) : 0;

  // Ratio piatti/pizza
  const totalPP = piattiCa + pizzaCa;
  data.journee.ratioPiattiPizza = totalPP > 0 ? Math.round((piattiCa / totalPP) * 100) : 0;

  return data;
}

export async function GET(request: NextRequest) {
  const apiKey = process.env.POPINA_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "POPINA_API_KEY manquant" }, { status: 500 });

  const todayParis = getParisDate(0);
  const currentWeek = dateToISOWeek(todayParis);
  const selectedWeek = request.nextUrl.searchParams.get("week") || currentWeek;
  const isCurrentWeek = selectedWeek === currentWeek;

  const monday = isoWeekToMonday(selectedWeek);
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    return fmtDateUTC(d);
  });

  const activeDates = isCurrentWeek
    ? weekDates.filter(d => d <= todayParis)
    : weekDates;

  // Previous week
  const prevMonday = new Date(monday);
  prevMonday.setUTCDate(monday.getUTCDate() - 7);
  const prevDates = activeDates.map((_, i) => {
    const d = new Date(prevMonday);
    d.setUTCDate(prevMonday.getUTCDate() + i);
    return fmtDateUTC(d);
  });

  // Fetch reports for both weeks
  const prevMondayStr = fmtDateUTC(prevMonday);
  const fetchTo = weekDates[6] > todayParis ? todayParis : weekDates[6];
  const [reports, ...ordersPerDay] = await Promise.all([
    fetchReports(apiKey, prevMondayStr, fetchTo),
    ...activeDates.map(date => fetchOrders(apiKey, date)),
  ]);

  // Group reports by Paris date
  const byDate = new Map<string, { totalSales: number; guestsNumber: number; products: Array<{ name: string; quantity: number; totalSales: number; category: string }> }>();
  for (const r of reports) {
    if (!r.startedAt) continue;
    const key = toParisDate(r.startedAt);
    const existing = byDate.get(key);
    if (existing) {
      existing.totalSales += r.totalSales ?? 0;
      existing.guestsNumber += r.guestsNumber ?? 0;
      for (const p of r.reportProducts ?? []) {
        const prev = existing.products.find(x => x.name === p.productName);
        if (prev) { prev.quantity += p.productQuantity ?? 0; prev.totalSales += p.productSales ?? 0; }
        else existing.products.push({ name: p.productName ?? "?", quantity: p.productQuantity ?? 0, totalSales: p.productSales ?? 0, category: p.productCategory ?? "" });
      }
    } else {
      byDate.set(key, {
        totalSales: r.totalSales ?? 0,
        guestsNumber: r.guestsNumber ?? 0,
        products: (r.reportProducts ?? []).map(p => ({
          name: p.productName ?? "?", quantity: p.productQuantity ?? 0,
          totalSales: p.productSales ?? 0, category: p.productCategory ?? "",
        })),
      });
    }
  }

  // ── Weekly KPIs ──
  let caSemaine = 0;
  let paxSemaine = 0;
  for (const d of activeDates) {
    const data = byDate.get(d);
    if (data) { caSemaine += data.totalSales; paxSemaine += data.guestsNumber; }
  }
  caSemaine = c2e(caSemaine);
  const ticketMoyenSemaine = paxSemaine > 0 ? c2e(Math.round(caSemaine / paxSemaine * 100)) : 0;

  let caSemainePrec = 0;
  let paxSemainePrec = 0;
  for (const d of prevDates) {
    const data = byDate.get(d);
    if (data) { caSemainePrec += data.totalSales; paxSemainePrec += data.guestsNumber; }
  }
  caSemainePrec = c2e(caSemainePrec);
  const ticketMoyenPrec = paxSemainePrec > 0 ? c2e(Math.round(caSemainePrec / paxSemainePrec * 100)) : 0;

  const variationCA = caSemainePrec > 0 ? Math.round(((caSemaine - caSemainePrec) / caSemainePrec) * 100) : 0;
  const variationPax = paxSemainePrec > 0 ? Math.round(((paxSemaine - paxSemainePrec) / paxSemainePrec) * 100) : 0;
  const variationTicket = ticketMoyenPrec > 0 ? Math.round(((ticketMoyenSemaine - ticketMoyenPrec) / ticketMoyenPrec) * 100) : 0;

  // Best day
  let bestDay = { label: "—", ca: 0 };
  for (const d of activeDates) {
    const data = byDate.get(d);
    if (data) {
      const ca = c2e(data.totalSales);
      if (ca > bestDay.ca) {
        const dow = new Date(d + "T12:00:00").getDay();
        bestDay = { label: DAY_LABELS[dow], ca };
      }
    }
  }

  // ── Zone totals from orders ──
  const zoneTotals = { salle: 0, pergolas: 0, terrasse: 0, emporter: 0 };
  let totalPaxEmporter = 0;
  let totalCaEmporter = 0;
  let totalPaxSurPlace = 0;
  let totalCaSurPlace = 0;

  for (const dayOrders of ordersPerDay) {
    for (const o of dayOrders) {
      const { zone, ca, pax } = classifyOrder(o);
      zoneTotals[zone] += ca;
      if (zone === "emporter") { totalPaxEmporter += pax; totalCaEmporter += ca; }
      else { totalPaxSurPlace += pax; totalCaSurPlace += ca; }
    }
  }
  const zoneTotalsEur = {
    salle: c2e(zoneTotals.salle),
    pergolas: c2e(zoneTotals.pergolas),
    terrasse: c2e(zoneTotals.terrasse),
    emporter: c2e(zoneTotals.emporter),
  };
  const totalZone = zoneTotalsEur.salle + zoneTotalsEur.pergolas + zoneTotalsEur.terrasse + zoneTotalsEur.emporter;
  const zonePcts = {
    salle: totalZone > 0 ? Math.round(zoneTotalsEur.salle / totalZone * 1000) / 10 : 0,
    pergolas: totalZone > 0 ? Math.round(zoneTotalsEur.pergolas / totalZone * 1000) / 10 : 0,
    terrasse: totalZone > 0 ? Math.round(zoneTotalsEur.terrasse / totalZone * 1000) / 10 : 0,
    emporter: totalZone > 0 ? Math.round(zoneTotalsEur.emporter / totalZone * 1000) / 10 : 0,
  };

  const ticketSurPlace = totalPaxSurPlace > 0 ? c2e(Math.round(c2e(totalCaSurPlace) / totalPaxSurPlace * 100)) : 0;
  const ticketEmporter = totalPaxEmporter > 0 ? c2e(Math.round(c2e(totalCaEmporter) / totalPaxEmporter * 100)) : 0;

  // ── Daily detail (bar chart + table) ──
  const dailyDetails = weekDates.map((dateStr) => {
    const reportData = byDate.get(dateStr);
    const dow = new Date(dateStr + "T12:00:00").getDay();
    const ca = reportData ? c2e(reportData.totalSales) : 0;
    const pax = reportData?.guestsNumber ?? 0;
    const ticketMoyen = pax > 0 ? c2e(Math.round(ca / pax * 100)) : 0;

    // Zone/service breakdown from orders (only for active days)
    const activeIdx = activeDates.indexOf(dateStr);
    const dayOrders = activeIdx >= 0 ? ordersPerDay[activeIdx] : [];
    const serviceData = processOrders(dayOrders);

    // Top 5 products for this day
    const dayProducts = (reportData?.products ?? [])
      .sort((a, b) => b.totalSales - a.totalSales)
      .slice(0, 5)
      .map(p => ({ name: p.name, quantity: p.quantity, totalSales: c2e(p.totalSales) }));

    return {
      date: dateStr,
      label: DAY_LABELS[dow],
      labelFull: DAY_LABELS_FULL[dow],
      ca,
      pax,
      ticketMoyen,
      services: serviceData,
      topProducts: dayProducts,
      isActive: activeDates.includes(dateStr),
    };
  });

  // ── Top products by category ──
  const catProdMap = new Map<string, Map<string, { quantity: number; totalSales: number }>>();
  for (const dateStr of activeDates) {
    for (const p of byDate.get(dateStr)?.products ?? []) {
      const cat = p.category || "Autre";
      if (!catProdMap.has(cat)) catProdMap.set(cat, new Map());
      const m = catProdMap.get(cat)!;
      const prev = m.get(p.name);
      if (prev) { prev.quantity += p.quantity; prev.totalSales += p.totalSales; }
      else m.set(p.name, { quantity: p.quantity, totalSales: p.totalSales });
    }
  }

  // Previous week product totals per category for variation
  const prevCatProdMap = new Map<string, Map<string, number>>();
  for (const dateStr of prevDates) {
    for (const p of byDate.get(dateStr)?.products ?? []) {
      const cat = p.category || "Autre";
      if (!prevCatProdMap.has(cat)) prevCatProdMap.set(cat, new Map());
      const m = prevCatProdMap.get(cat)!;
      m.set(p.name, (m.get(p.name) ?? 0) + p.totalSales);
    }
  }

  const topByCategory: Array<{
    category: string;
    products: Array<{ name: string; quantity: number; totalSales: number; pctChange: number | null }>;
  }> = [];

  for (const [cat, prods] of catProdMap) {
    const prevProds = prevCatProdMap.get(cat);
    const sorted = Array.from(prods.entries())
      .sort(([, a], [, b]) => b.totalSales - a.totalSales)
      .slice(0, 5)
      .map(([name, v]) => {
        const prevSales = prevProds?.get(name) ?? 0;
        const pctChange = prevSales > 0 ? Math.round(((v.totalSales - prevSales) / prevSales) * 100) : null;
        return { name, quantity: v.quantity, totalSales: c2e(v.totalSales), pctChange };
      });
    topByCategory.push({ category: cat, products: sorted });
  }
  topByCategory.sort((a, b) => {
    const aTotal = a.products.reduce((s, p) => s + p.totalSales, 0);
    const bTotal = b.products.reduce((s, p) => s + p.totalSales, 0);
    return bTotal - aTotal;
  });

  // ── Top 5 overall ──
  const prodMap = new Map<string, { quantity: number; totalSales: number }>();
  for (const dateStr of activeDates) {
    for (const p of byDate.get(dateStr)?.products ?? []) {
      const prev = prodMap.get(p.name);
      if (prev) { prev.quantity += p.quantity; prev.totalSales += p.totalSales; }
      else prodMap.set(p.name, { quantity: p.quantity, totalSales: p.totalSales });
    }
  }
  const prevProdMap = new Map<string, number>();
  for (const dateStr of prevDates) {
    for (const p of byDate.get(dateStr)?.products ?? []) {
      prevProdMap.set(p.name, (prevProdMap.get(p.name) ?? 0) + p.totalSales);
    }
  }
  const top5PrevNames = new Set(
    Array.from(prevProdMap.entries()).sort(([, a], [, b]) => b - a).slice(0, 5).map(([n]) => n)
  );

  const topSemaine = Array.from(prodMap.entries())
    .sort(([, a], [, b]) => b.totalSales - a.totalSales)
    .slice(0, 5)
    .map(([name, v]) => {
      const prevSales = prevProdMap.get(name) ?? 0;
      const pctChange = prevSales > 0 ? Math.round(((v.totalSales - prevSales) / prevSales) * 100) : null;
      return { name, quantity: v.quantity, totalSales: c2e(v.totalSales), isNew: !top5PrevNames.has(name), pctChange };
    });

  // Week label
  const mondayStr = weekDates[0];
  const sundayStr = weekDates[6];
  const mondayDate = new Date(mondayStr + "T12:00:00");
  const sundayDate = new Date(sundayStr + "T12:00:00");
  const weekLabel = `Semaine du ${mondayDate.getDate()} au ${sundayDate.getDate()} ${sundayDate.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}`;

  return NextResponse.json({
    week: selectedWeek,
    weekLabel,
    isCurrentWeek,
    activeDays: activeDates.length,
    today: todayParis,

    // KPIs
    kpis: {
      caSemaine,
      caHT: c2e(Math.round(caSemaine * 100 / 1.1)),
      paxSemaine,
      ticketMoyenSurPlace: ticketSurPlace,
      ticketMoyenEmporter: ticketEmporter,
      bestDay,
      variationCA,
      variationPax,
      variationTicket,
      caSemainePrec,
      paxSemainePrec,
      ticketMoyenPrec,
    },

    // Zones
    zones: zoneTotalsEur,
    zonePcts,

    // Daily (for chart + table)
    days: dailyDetails,

    // Top products
    topSemaine,
    topByCategory,
  });
}
