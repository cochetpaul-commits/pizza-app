import { NextRequest, NextResponse } from "next/server";
import {
  fetchReports, fetchOrders, getParisDate,
  dateToISOWeek, isoWeekToMonday, fmtDateUTC,
  type PopinaReport, type PopinaOrder,
} from "@/lib/popinaClient";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY_LABELS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
const DAY_LABELS_FULL = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
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

const c2e = (centimes: number) => Math.round(centimes / 100 * 100) / 100;

/* ── Product category inference ──────────────────────── */

const PIZZA_KEYWORDS = [
  "margherita", "regina", "diavola", "calzone", "focaccia", "napoli", "bufala",
  "4 fromage", "quatre fromage", "formaggi", "capricciosa", "parma",
  "crudo", "tartufata", "bergamino", "pepperoni",
  "al tartufata", "al bergamino", "al crudo",
];
const ANTIPASTI_KEYWORDS = [
  "burrata", "bruschett", "carpaccio", "vitello tonnato", "polpo", "tartare",
  "salade", "insalata", "articho", "bresaola", "mozzarella",
];
const DOLCI_KEYWORDS = [
  "tiramisu", "panna cotta", "profiterole", "cannoli", "fondant",
  "affogato", "semifreddo", "gelato", "sorbet", "mousse", "cheesecake",
];
const PIATTI_KEYWORDS = [
  "ossobuco", "saltimbocca", "risotto", "linguine", "spaghetti", "penne",
  "tagliata", "gnocchi", "ravioli", "lasagne", "vongole", "carbonara",
  "bolognese", "amatriciana", "cacio", "pepe", "anatra", "agnello",
  "scaloppine", "piccata", "marsala", "milanese",
];
const BOISSON_KEYWORDS = [
  "vin ", "verre", "bouteille", "chianti", "barolo", "prosecco", "amarone",
  "spritz", "negroni", "americano", "bellini", "rossini", "cocktail",
  "biere", "birra", "coca", "eau ", "cafe", "limonade", "jus ",
  "digestif", "limoncello", "grappa", "amaro",
];

function inferCategory(name: string, popinaCategory?: string): string {
  if (popinaCategory && popinaCategory.trim()) return popinaCategory;
  const n = name.toLowerCase();
  // Check more specific categories first
  if (DOLCI_KEYWORDS.some(k => n.includes(k))) return "Dolci";
  if (PIATTI_KEYWORDS.some(k => n.includes(k))) return "Piatti";
  if (ANTIPASTI_KEYWORDS.some(k => n.includes(k))) return "Antipasti";
  if (BOISSON_KEYWORDS.some(k => n.includes(k))) return "Boissons";
  if (PIZZA_KEYWORDS.some(k => n.includes(k))) return "Pizze";
  return "Autre";
}

/* ── Order-based zone/service classification ─────────── */

function classifyOrder(o: PopinaOrder) {
  const ca = o.totalSales ?? 0;
  let pax = 0;
  for (const item of o.orderItems ?? []) {
    const cat = (item.productCategory ?? "").toLowerCase();
    if (COUVERTS_CATEGORIES.some(c => cat.includes(c))) pax += item.productQuantity ?? 0;
  }

  // Zone from orderPlace
  const place = (o.orderPlace ?? "").toLowerCase();
  let zone: "salle" | "pergolas" | "terrasse" | "emporter" = "salle";
  if (place.includes("pergola")) zone = "pergolas";
  else if (place.includes("terrasse")) zone = "terrasse";
  else if (/emporter|livraison|take/i.test(place)) zone = "emporter";

  // Service from time
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

type ZoneService = {
  journee: { salle: number; pergolas: number; terrasse: number; emporter: number; total: number; totalHT: number; pax: number; ticketMoyen: number; ticketEmporter: number; ratioPiattiPizza: number };
  midi: { salle: number; pergolas: number; terrasse: number; emporter: number; total: number; pax: number; ticketMoyen: number };
  soir: { salle: number; pergolas: number; terrasse: number; emporter: number; total: number; pax: number; ticketMoyen: number };
};

function buildZoneService(orders: PopinaOrder[], reportCa: number, reportPax: number): ZoneService {
  const zs: ZoneService = {
    journee: { salle: 0, pergolas: 0, terrasse: 0, emporter: 0, total: 0, totalHT: 0, pax: 0, ticketMoyen: 0, ticketEmporter: 0, ratioPiattiPizza: 0 },
    midi: { salle: 0, pergolas: 0, terrasse: 0, emporter: 0, total: 0, pax: 0, ticketMoyen: 0 },
    soir: { salle: 0, pergolas: 0, terrasse: 0, emporter: 0, total: 0, pax: 0, ticketMoyen: 0 },
  };

  if (orders.length === 0) {
    // No orders: use report totals, put everything in "salle"
    zs.journee.salle = reportCa;
    zs.journee.total = reportCa;
    zs.journee.totalHT = Math.round(reportCa * 100 / 1.1) / 100;
    zs.journee.pax = reportPax;
    zs.journee.ticketMoyen = reportPax > 0 ? Math.round(reportCa / reportPax * 100) / 100 : 0;
    return zs;
  }

  // Process orders for zone/service
  let piattiCa = 0, pizzaCa = 0;
  let caEmporter = 0, paxEmporter = 0;

  for (const o of orders) {
    const { zone, service, ca, pax } = classifyOrder(o);
    const caEur = c2e(ca);

    zs.journee[zone] += caEur;
    zs.journee.total += caEur;
    zs.journee.pax += pax;

    if (zone === "emporter") { caEmporter += caEur; paxEmporter += pax; }

    if (service === "midi") {
      zs.midi[zone] += caEur;
      zs.midi.total += caEur;
      zs.midi.pax += pax;
    } else if (service === "soir") {
      zs.soir[zone] += caEur;
      zs.soir.total += caEur;
      zs.soir.pax += pax;
    }

    for (const item of o.orderItems ?? []) {
      const cat = (item.productCategory ?? "").toLowerCase();
      const itemCa = item.productSales ?? 0;
      if (cat.includes("pizze")) pizzaCa += itemCa;
      else if (cat.includes("cucina") || cat.includes("piatti")) piattiCa += itemCa;
    }
  }

  // Round all zone values
  for (const key of ["salle", "pergolas", "terrasse", "emporter"] as const) {
    zs.journee[key] = Math.round(zs.journee[key] * 100) / 100;
    zs.midi[key] = Math.round(zs.midi[key] * 100) / 100;
    zs.soir[key] = Math.round(zs.soir[key] * 100) / 100;
  }
  zs.journee.total = Math.round(zs.journee.total * 100) / 100;
  zs.journee.totalHT = Math.round(zs.journee.total * 100 / 1.1) / 100;
  zs.midi.total = Math.round(zs.midi.total * 100) / 100;
  zs.soir.total = Math.round(zs.soir.total * 100) / 100;

  // Tickets
  const paxSP = zs.journee.pax - paxEmporter;
  const caSP = zs.journee.total - caEmporter;
  zs.journee.ticketMoyen = paxSP > 0 ? Math.round(caSP / paxSP * 100) / 100 : 0;
  zs.journee.ticketEmporter = paxEmporter > 0 ? Math.round(caEmporter / paxEmporter * 100) / 100 : 0;
  zs.midi.ticketMoyen = zs.midi.pax > 0 ? Math.round(zs.midi.total / zs.midi.pax * 100) / 100 : 0;
  zs.soir.ticketMoyen = zs.soir.pax > 0 ? Math.round(zs.soir.total / zs.soir.pax * 100) / 100 : 0;

  // Ratio piatti/pizza
  const totalPP = piattiCa + pizzaCa;
  zs.journee.ratioPiattiPizza = totalPP > 0 ? Math.round((piattiCa / totalPP) * 100) : 0;

  return zs;
}

/* ── Weather helper ──────────────────────────────────── */

async function fetchWeekWeather(dates: string[]): Promise<Map<string, { midi: { temp: number; condition: string; icon: string }; soir: { temp: number; condition: string; icon: string } }>> {
  const result = new Map<string, { midi: { temp: number; condition: string; icon: string }; soir: { temp: number; condition: string; icon: string } }>();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) return result;

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { data: cached } = await supabase.from("daily_weather").select("*").in("date", dates);
    if (cached) {
      for (const row of cached) {
        result.set(row.date, {
          midi: { temp: row.temp_midi ?? 0, condition: row.condition_midi ?? "", icon: row.icon_midi ?? "" },
          soir: { temp: row.temp_soir ?? 0, condition: row.condition_soir ?? "", icon: row.icon_soir ?? "" },
        });
      }
    }
  } catch { /* table might not exist yet */ }

  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) return result;
  const missingDates = dates.filter(d => !result.has(d));
  if (missingDates.length === 0) return result;

  try {
    const res = await fetch(`https://api.openweathermap.org/data/2.5/forecast?lat=48.8566&lon=2.3522&appid=${apiKey}&units=metric&lang=fr`, { cache: "no-store" });
    if (!res.ok) return result;
    const forecast = await res.json();
    const toUpsert: Array<{ date: string; temp_midi: number; condition_midi: string; icon_midi: string; temp_soir: number; condition_soir: string; icon_soir: string }> = [];

    for (const dateStr of missingDates) {
      const midiTarget = new Date(`${dateStr}T12:00:00`).getTime();
      const soirTarget = new Date(`${dateStr}T20:00:00`).getTime();
      let bestMidi: { temp: number; condition: string; icon: string } | null = null;
      let bestSoir: { temp: number; condition: string; icon: string } | null = null;
      let bestMidiDiff = Infinity, bestSoirDiff = Infinity;

      for (const entry of forecast.list ?? []) {
        const t = entry.dt * 1000;
        const temp = Math.round(entry.main?.temp ?? 0);
        const condition = entry.weather?.[0]?.description ?? "";
        const icon = entry.weather?.[0]?.icon ?? "";
        const midiDiff = Math.abs(t - midiTarget);
        if (midiDiff < bestMidiDiff) { bestMidiDiff = midiDiff; bestMidi = { temp, condition, icon }; }
        const soirDiff = Math.abs(t - soirTarget);
        if (soirDiff < bestSoirDiff) { bestSoirDiff = soirDiff; bestSoir = { temp, condition, icon }; }
      }

      if (bestMidi && bestMidiDiff < 6 * 3600000 && bestSoir && bestSoirDiff < 6 * 3600000) {
        result.set(dateStr, { midi: bestMidi, soir: bestSoir });
        toUpsert.push({ date: dateStr, temp_midi: bestMidi.temp, condition_midi: bestMidi.condition, icon_midi: bestMidi.icon, temp_soir: bestSoir.temp, condition_soir: bestSoir.condition, icon_soir: bestSoir.icon });
      }
    }

    if (toUpsert.length > 0) {
      try { await supabase.from("daily_weather").upsert(toUpsert, { onConflict: "date" }); } catch { /* ignore */ }
    }
  } catch { /* silencieux */ }

  return result;
}

/* ── Main handler ────────────────────────────────────── */

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

  const activeDates = isCurrentWeek ? weekDates.filter(d => d <= todayParis) : weekDates;

  const prevMonday = new Date(monday);
  prevMonday.setUTCDate(monday.getUTCDate() - 7);
  const prevDates = activeDates.map((_, i) => {
    const d = new Date(prevMonday);
    d.setUTCDate(prevMonday.getUTCDate() + i);
    return fmtDateUTC(d);
  });

  // Connectivity check
  const prevMondayStr = fmtDateUTC(prevMonday);
  const fetchTo = weekDates[6] > todayParis ? todayParis : weekDates[6];
  let apiError: string | null = null;

  // Fetch reports + orders for active days + weather in parallel
  const [reports, weatherMap, ...ordersPerDay] = await Promise.all([
    fetchReports(apiKey, prevMondayStr, fetchTo),
    fetchWeekWeather(weekDates),
    ...activeDates.map(date => fetchOrders(apiKey, date)),
  ]);

  // Check if API returned data
  if (reports.length === 0) {
    try {
      const testRes = await fetch(`https://api.popina.com/v1/reports?locationId=d7442cfe-0305-4885-be9c-4853b9a3a2c2&from=${todayParis}&to=${todayParis}`, {
        headers: { Authorization: `Bearer ${apiKey}` }, cache: "no-store",
      });
      if (!testRes.ok) {
        const body = await testRes.text().catch(() => "");
        apiError = body.includes("P2025") || body.includes("not found")
          ? "Cle API Popina invalide ou revoquee"
          : `Popina API erreur ${testRes.status}`;
      }
    } catch { apiError = "Impossible de joindre l'API Popina"; }
  }

  // Group reports by Paris date
  const reportsByDate = new Map<string, PopinaReport[]>();
  const prodByDate = new Map<string, Map<string, { quantity: number; totalSales: number; category: string }>>();

  for (const r of reports) {
    if (!r.startedAt) continue;
    const dateKey = toParisDate(r.startedAt);
    if (!reportsByDate.has(dateKey)) reportsByDate.set(dateKey, []);
    reportsByDate.get(dateKey)!.push(r);

    if (!prodByDate.has(dateKey)) prodByDate.set(dateKey, new Map());
    const prodMap = prodByDate.get(dateKey)!;
    for (const p of r.reportProducts ?? []) {
      const name = p.productName ?? "?";
      const category = inferCategory(name, p.productCategory);
      const prev = prodMap.get(name);
      if (prev) { prev.quantity += p.productQuantity ?? 0; prev.totalSales += p.productSales ?? 0; }
      else prodMap.set(name, { quantity: p.productQuantity ?? 0, totalSales: p.productSales ?? 0, category });
    }
  }

  // ── Weekly KPIs ──
  let caSemaineCentimes = 0, paxSemaine = 0;
  for (const d of activeDates) {
    for (const r of reportsByDate.get(d) ?? []) { caSemaineCentimes += r.totalSales ?? 0; paxSemaine += r.guestsNumber ?? 0; }
  }
  const caSemaine = c2e(caSemaineCentimes);
  const ticketMoyenSemaine = paxSemaine > 0 ? Math.round(caSemaine / paxSemaine * 100) / 100 : 0;

  let caSemainePrecCentimes = 0, paxSemainePrec = 0;
  for (const d of prevDates) {
    for (const r of reportsByDate.get(d) ?? []) { caSemainePrecCentimes += r.totalSales ?? 0; paxSemainePrec += r.guestsNumber ?? 0; }
  }
  const caSemainePrec = c2e(caSemainePrecCentimes);
  const ticketMoyenPrec = paxSemainePrec > 0 ? Math.round(caSemainePrec / paxSemainePrec * 100) / 100 : 0;

  const variationCA = caSemainePrec > 0 ? Math.round(((caSemaine - caSemainePrec) / caSemainePrec) * 100) : 0;
  const variationPax = paxSemainePrec > 0 ? Math.round(((paxSemaine - paxSemainePrec) / paxSemainePrec) * 100) : 0;
  const variationTicket = ticketMoyenPrec > 0 ? Math.round(((ticketMoyenSemaine - ticketMoyenPrec) / ticketMoyenPrec) * 100) : 0;

  // Best day
  let bestDay = { label: "\u2014", ca: 0 };
  for (const d of activeDates) {
    const ca = c2e((reportsByDate.get(d) ?? []).reduce((s, r) => s + (r.totalSales ?? 0), 0));
    if (ca > bestDay.ca) { bestDay = { label: DAY_LABELS[new Date(d + "T12:00:00").getDay()], ca }; }
  }

  // ── Zone totals from orders ──
  const zoneTotals = { salle: 0, pergolas: 0, terrasse: 0, emporter: 0 };
  let totalPaxSP = 0, totalCaSP = 0, totalPaxEmp = 0, totalCaEmp = 0;
  let hasAnyOrders = false;

  for (const dayOrders of ordersPerDay) {
    if (dayOrders.length > 0) hasAnyOrders = true;
    for (const o of dayOrders) {
      const { zone, ca, pax } = classifyOrder(o);
      const caEur = c2e(ca);
      zoneTotals[zone] += caEur;
      if (zone === "emporter") { totalPaxEmp += pax; totalCaEmp += caEur; }
      else { totalPaxSP += pax; totalCaSP += caEur; }
    }
  }

  // If no orders at all, put report totals in salle
  if (!hasAnyOrders && caSemaine > 0) {
    zoneTotals.salle = caSemaine;
    totalPaxSP = paxSemaine;
    totalCaSP = caSemaine;
  }

  // Round zone totals
  for (const key of ["salle", "pergolas", "terrasse", "emporter"] as const) {
    zoneTotals[key] = Math.round(zoneTotals[key] * 100) / 100;
  }
  const totalZone = zoneTotals.salle + zoneTotals.pergolas + zoneTotals.terrasse + zoneTotals.emporter;
  const zonePcts = {
    salle: totalZone > 0 ? Math.round(zoneTotals.salle / totalZone * 1000) / 10 : 0,
    pergolas: totalZone > 0 ? Math.round(zoneTotals.pergolas / totalZone * 1000) / 10 : 0,
    terrasse: totalZone > 0 ? Math.round(zoneTotals.terrasse / totalZone * 1000) / 10 : 0,
    emporter: totalZone > 0 ? Math.round(zoneTotals.emporter / totalZone * 1000) / 10 : 0,
  };

  // Tickets (no double conversion!)
  const ticketSurPlace = totalPaxSP > 0 ? Math.round(totalCaSP / totalPaxSP * 100) / 100 : 0;
  const ticketEmporter = totalPaxEmp > 0 ? Math.round(totalCaEmp / totalPaxEmp * 100) / 100 : 0;

  // ── Daily detail ──
  const dailyDetails = weekDates.map((dateStr) => {
    const dayReports = reportsByDate.get(dateStr) ?? [];
    const dow = new Date(dateStr + "T12:00:00").getDay();
    const totalCentimes = dayReports.reduce((s, r) => s + (r.totalSales ?? 0), 0);
    const ca = c2e(totalCentimes);
    const pax = dayReports.reduce((s, r) => s + (r.guestsNumber ?? 0), 0);
    const ticketMoyen = pax > 0 ? Math.round(ca / pax * 100) / 100 : 0;

    // Orders for this day (zone/service breakdown)
    const activeIdx = activeDates.indexOf(dateStr);
    const dayOrders = activeIdx >= 0 ? ordersPerDay[activeIdx] : [];
    const services = buildZoneService(dayOrders, ca, pax);

    // Top 5 products
    const dayProds = prodByDate.get(dateStr);
    const topProducts = dayProds
      ? Array.from(dayProds.entries()).sort(([, a], [, b]) => b.totalSales - a.totalSales).slice(0, 5)
        .map(([name, v]) => ({ name, quantity: v.quantity, totalSales: c2e(v.totalSales) }))
      : [];

    const weather = weatherMap.get(dateStr) ?? null;

    return { date: dateStr, label: DAY_LABELS[dow], labelFull: DAY_LABELS_FULL[dow], ca, pax, ticketMoyen, services, topProducts, weather, isActive: activeDates.includes(dateStr) };
  });

  // ── Top products by category ──
  const catProdMap = new Map<string, Map<string, { quantity: number; totalSales: number }>>();
  const prevProdMapAll = new Map<string, number>();

  for (const dateStr of activeDates) {
    const dayProds = prodByDate.get(dateStr);
    if (!dayProds) continue;
    for (const [name, v] of dayProds) {
      const cat = v.category || "Autre";
      if (!catProdMap.has(cat)) catProdMap.set(cat, new Map());
      const m = catProdMap.get(cat)!;
      const prev = m.get(name);
      if (prev) { prev.quantity += v.quantity; prev.totalSales += v.totalSales; }
      else m.set(name, { quantity: v.quantity, totalSales: v.totalSales });
    }
  }

  for (const dateStr of prevDates) {
    const dayProds = prodByDate.get(dateStr);
    if (!dayProds) continue;
    for (const [name, v] of dayProds) prevProdMapAll.set(name, (prevProdMapAll.get(name) ?? 0) + v.totalSales);
  }

  const topByCategory: Array<{ category: string; products: Array<{ name: string; quantity: number; totalSales: number; pctChange: number | null }> }> = [];
  for (const [cat, prods] of catProdMap) {
    const sorted = Array.from(prods.entries()).sort(([, a], [, b]) => b.totalSales - a.totalSales).slice(0, 5)
      .map(([name, v]) => {
        const prevSales = prevProdMapAll.get(name) ?? 0;
        const pctChange = prevSales > 0 ? Math.round(((v.totalSales - prevSales) / prevSales) * 100) : null;
        return { name, quantity: v.quantity, totalSales: c2e(v.totalSales), pctChange };
      });
    if (sorted.length > 0) topByCategory.push({ category: cat, products: sorted });
  }
  topByCategory.sort((a, b) => b.products.reduce((s, p) => s + p.totalSales, 0) - a.products.reduce((s, p) => s + p.totalSales, 0));

  // ── Top 5 overall ──
  const prodMapAll = new Map<string, { quantity: number; totalSales: number }>();
  for (const dateStr of activeDates) {
    const dayProds = prodByDate.get(dateStr);
    if (!dayProds) continue;
    for (const [name, v] of dayProds) {
      const prev = prodMapAll.get(name);
      if (prev) { prev.quantity += v.quantity; prev.totalSales += v.totalSales; }
      else prodMapAll.set(name, { quantity: v.quantity, totalSales: v.totalSales });
    }
  }
  const top5PrevNames = new Set(Array.from(prevProdMapAll.entries()).sort(([, a], [, b]) => b - a).slice(0, 5).map(([n]) => n));
  const topSemaine = Array.from(prodMapAll.entries()).sort(([, a], [, b]) => b.totalSales - a.totalSales).slice(0, 5)
    .map(([name, v]) => {
      const prevSales = prevProdMapAll.get(name) ?? 0;
      const pctChange = prevSales > 0 ? Math.round(((v.totalSales - prevSales) / prevSales) * 100) : null;
      return { name, quantity: v.quantity, totalSales: c2e(v.totalSales), isNew: !top5PrevNames.has(name), pctChange };
    });

  // Week label
  const mondayDate = new Date(weekDates[0] + "T12:00:00");
  const sundayDate = new Date(weekDates[6] + "T12:00:00");
  const weekLabel = `Semaine du ${mondayDate.getDate()} au ${sundayDate.getDate()} ${sundayDate.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}`;

  return NextResponse.json({
    week: selectedWeek, weekLabel, isCurrentWeek,
    activeDays: activeDates.length, today: todayParis, apiError,
    kpis: {
      caSemaine, caHT: Math.round(caSemaine * 100 / 1.1) / 100,
      paxSemaine, ticketMoyenSurPlace: ticketSurPlace, ticketMoyenEmporter: ticketEmporter,
      bestDay, variationCA, variationPax, variationTicket,
      caSemainePrec, paxSemainePrec, ticketMoyenPrec,
    },
    zones: zoneTotals, zonePcts,
    days: dailyDetails,
    topSemaine, topByCategory,
  });
}
