import { NextRequest, NextResponse } from "next/server";
import {
  fetchReports, getParisDate,
  dateToISOWeek, isoWeekToMonday, fmtDateUTC,
  type PopinaReport,
} from "@/lib/popinaClient";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY_LABELS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
const DAY_LABELS_FULL = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

/* ── Paris time helpers ───────────────────────────────── */

function toParisDate(iso: string): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date(iso));
}

function toParisHour(iso: string): number {
  return parseInt(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", hour12: false }).format(new Date(iso)), 10);
}

const c2e = (c: number) => Math.round(c / 100 * 100) / 100;

/* ── Zone classification from roomName ────────────────── */

function classifyRoom(roomName?: string): "salle" | "pergolas" | "terrasse" | "emporter" {
  const r = (roomName ?? "").toLowerCase();
  if (r.includes("pergola")) return "pergolas";
  if (r.includes("terrasse")) return "terrasse";
  if (r.includes("emporter") || r.includes("livraison") || r.includes("take")) return "emporter";
  return "salle"; // default (includes "salle", "bar", empty)
}

/* ── Service classification from startedAt time ──────── */

function classifyService(startedAt?: string): "midi" | "soir" | "other" {
  if (!startedAt) return "other";
  const h = toParisHour(startedAt);
  if (h >= 11 && h < 16) return "midi";
  if (h >= 18 || h <= 2) return "soir";
  return "other";
}

/* ── Product category inference ──────────────────────── */

const PIZZA_KEYWORDS = [
  "margherita", "regina", "diavola", "calzone", "focaccia", "napoli", "bufala",
  "4 fromage", "quatre fromage", "formaggi", "capricciosa", "parma", "truffe",
  "crudo", "tartufata", "bergamino", "pepperoni", "prosciutto", "burratina",
  "al ", // "al tartufata" etc.
];
const ANTIPASTI_KEYWORDS = [
  "burrata", "bruschett", "carpaccio", "vitello", "polpo", "tartare",
  "salade", "insalata", "articho", "bresaola", "mozzarella",
];
const DOLCI_KEYWORDS = [
  "tiramisu", "panna cotta", "profiterole", "cannoli", "fondant",
  "affogato", "semifreddo", "gelato", "sorbet", "mousse", "cheesecake",
];
const PIATTI_KEYWORDS = [
  "ossobuco", "saltimbocca", "risotto", "linguine", "spaghetti", "penne",
  "tagliata", "gnocchi", "ravioli", "lasagne", "vongole", "carbonara",
  "bolognese", "amatriciana", "cacio", "pepe",
];
const BOISSON_KEYWORDS = [
  "vin ", "verre", "bouteille", "chianti", "barolo", "prosecco", "amarone",
  "spritz", "negroni", "americano", "bellini", "rossini", "cocktail",
  "biere", "birra", "coca", "eau", "cafe", "coffee", "limonade", "jus",
  "digestif", "limoncello", "grappa", "amaro",
];

function inferCategory(name: string, popinaCategory?: string): string {
  // Use Popina category if available and not empty
  if (popinaCategory && popinaCategory.trim()) return popinaCategory;

  const n = name.toLowerCase();
  if (DOLCI_KEYWORDS.some(k => n.includes(k))) return "Dolci";
  if (ANTIPASTI_KEYWORDS.some(k => n.includes(k))) return "Antipasti";
  if (PIATTI_KEYWORDS.some(k => n.includes(k))) return "Piatti";
  if (BOISSON_KEYWORDS.some(k => n.includes(k))) return "Boissons";
  if (PIZZA_KEYWORDS.some(k => n.includes(k))) return "Pizze";
  return "Autre";
}

/* ── Weather helper ──────────────────────────────────── */

async function fetchWeekWeather(dates: string[]): Promise<Map<string, { midi: { temp: number; condition: string; icon: string }; soir: { temp: number; condition: string; icon: string } }>> {
  const result = new Map<string, { midi: { temp: number; condition: string; icon: string }; soir: { temp: number; condition: string; icon: string } }>();

  // Try to read from Supabase cache first
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) return result;

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data: cached } = await supabase
    .from("daily_weather")
    .select("*")
    .in("date", dates);

  if (cached) {
    for (const row of cached) {
      result.set(row.date, {
        midi: { temp: row.temp_midi ?? 0, condition: row.condition_midi ?? "", icon: row.icon_midi ?? "" },
        soir: { temp: row.temp_soir ?? 0, condition: row.condition_soir ?? "", icon: row.icon_soir ?? "" },
      });
    }
  }

  // Fetch missing dates from OpenWeather
  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) return result;

  const missingDates = dates.filter(d => !result.has(d));
  if (missingDates.length === 0) return result;

  // Paris coordinates
  const lat = 48.8566;
  const lon = 2.3522;

  try {
    // Use 5-day forecast for recent/upcoming dates
    const res = await fetch(`https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric&lang=fr`, { cache: "no-store" });
    if (!res.ok) return result;
    const forecast = await res.json();

    const toUpsert: Array<{ date: string; temp_midi: number; condition_midi: string; icon_midi: string; temp_soir: number; condition_soir: string; icon_soir: string }> = [];

    for (const dateStr of missingDates) {
      // Find forecast entries closest to 12:00 and 20:00
      const midiTarget = new Date(`${dateStr}T12:00:00`).getTime();
      const soirTarget = new Date(`${dateStr}T20:00:00`).getTime();

      let bestMidi: { temp: number; condition: string; icon: string } | null = null;
      let bestSoir: { temp: number; condition: string; icon: string } | null = null;
      let bestMidiDiff = Infinity;
      let bestSoirDiff = Infinity;

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

      // Only store if within 6 hours of target
      if (bestMidi && bestMidiDiff < 6 * 3600 * 1000 && bestSoir && bestSoirDiff < 6 * 3600 * 1000) {
        result.set(dateStr, { midi: bestMidi, soir: bestSoir });
        toUpsert.push({
          date: dateStr,
          temp_midi: bestMidi.temp, condition_midi: bestMidi.condition, icon_midi: bestMidi.icon,
          temp_soir: bestSoir.temp, condition_soir: bestSoir.condition, icon_soir: bestSoir.icon,
        });
      }
    }

    // Cache in Supabase
    if (toUpsert.length > 0) {
      await supabase.from("daily_weather").upsert(toUpsert, { onConflict: "date" }).select();
    }
  } catch { /* silencieux */ }

  return result;
}

/* ── Report-based zone/service aggregation ───────────── */

type DayAgg = {
  journee: { salle: number; pergolas: number; terrasse: number; emporter: number; total: number; pax: number };
  midi: { salle: number; pergolas: number; terrasse: number; emporter: number; total: number; pax: number };
  soir: { salle: number; pergolas: number; terrasse: number; emporter: number; total: number; pax: number };
  piattiCa: number;
  pizzaCa: number;
};

function aggregateReportsForDay(reports: PopinaReport[]): DayAgg {
  const agg: DayAgg = {
    journee: { salle: 0, pergolas: 0, terrasse: 0, emporter: 0, total: 0, pax: 0 },
    midi: { salle: 0, pergolas: 0, terrasse: 0, emporter: 0, total: 0, pax: 0 },
    soir: { salle: 0, pergolas: 0, terrasse: 0, emporter: 0, total: 0, pax: 0 },
    piattiCa: 0, pizzaCa: 0,
  };

  for (const r of reports) {
    const ca = r.totalSales ?? 0;
    const pax = r.guestsNumber ?? 0;
    const zone = classifyRoom(r.roomName);
    const service = classifyService(r.startedAt);

    agg.journee[zone] += ca;
    agg.journee.total += ca;
    agg.journee.pax += pax;

    if (service === "midi") {
      agg.midi[zone] += ca;
      agg.midi.total += ca;
      agg.midi.pax += pax;
    } else if (service === "soir") {
      agg.soir[zone] += ca;
      agg.soir.total += ca;
      agg.soir.pax += pax;
    }

    // Piatti/Pizza ratio from products
    for (const p of r.reportProducts ?? []) {
      const cat = inferCategory(p.productName ?? "", p.productCategory);
      if (cat === "Pizze") agg.pizzaCa += p.productSales ?? 0;
      else if (cat === "Piatti") agg.piattiCa += p.productSales ?? 0;
    }
  }

  return agg;
}

function formatDayServices(agg: DayAgg) {
  const paxEmporter = 0; // Reports don't split pax by zone, approximate
  const caEmporter = agg.journee.emporter;
  const caSurPlace = agg.journee.total - caEmporter;
  const paxTotal = agg.journee.pax;

  const ticketMoyen = paxTotal > 0 ? c2e(caSurPlace / paxTotal) : 0;
  const totalPP = agg.piattiCa + agg.pizzaCa;
  const ratioPP = totalPP > 0 ? Math.round((agg.piattiCa / totalPP) * 100) : 0;

  return {
    journee: {
      salle: c2e(agg.journee.salle), pergolas: c2e(agg.journee.pergolas),
      terrasse: c2e(agg.journee.terrasse), emporter: c2e(agg.journee.emporter),
      total: c2e(agg.journee.total), totalHT: c2e(Math.round(agg.journee.total / 1.1)),
      pax: paxTotal, ticketMoyen,
      ticketEmporter: paxEmporter > 0 ? c2e(caEmporter / paxEmporter) : 0,
      ratioPiattiPizza: ratioPP,
    },
    midi: {
      salle: c2e(agg.midi.salle), pergolas: c2e(agg.midi.pergolas),
      terrasse: c2e(agg.midi.terrasse), emporter: c2e(agg.midi.emporter),
      total: c2e(agg.midi.total), pax: agg.midi.pax,
      ticketMoyen: agg.midi.pax > 0 ? c2e(agg.midi.total / agg.midi.pax) : 0,
    },
    soir: {
      salle: c2e(agg.soir.salle), pergolas: c2e(agg.soir.pergolas),
      terrasse: c2e(agg.soir.terrasse), emporter: c2e(agg.soir.emporter),
      total: c2e(agg.soir.total), pax: agg.soir.pax,
      ticketMoyen: agg.soir.pax > 0 ? c2e(agg.soir.total / agg.soir.pax) : 0,
    },
  };
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

  const activeDates = isCurrentWeek
    ? weekDates.filter(d => d <= todayParis)
    : weekDates;

  // Previous week equivalent days
  const prevMonday = new Date(monday);
  prevMonday.setUTCDate(monday.getUTCDate() - 7);
  const prevDates = activeDates.map((_, i) => {
    const d = new Date(prevMonday);
    d.setUTCDate(prevMonday.getUTCDate() + i);
    return fmtDateUTC(d);
  });

  // Quick connectivity check: test Popina API with a single-day fetch
  const prevMondayStr = fmtDateUTC(prevMonday);
  const fetchTo = weekDates[6] > todayParis ? todayParis : weekDates[6];

  let apiError: string | null = null;
  try {
    const testRes = await fetch(`https://api.popina.com/v1/reports?locationId=d7442cfe-0305-4885-be9c-4853b9a3a2c2&from=${todayParis}&to=${todayParis}`, {
      headers: { Authorization: `Bearer ${apiKey}` }, cache: "no-store",
    });
    if (!testRes.ok) {
      const body = await testRes.text().catch(() => "");
      if (body.includes("P2025") || body.includes("not found")) {
        apiError = "Cle API Popina invalide ou revoquee. Regenerez-la dans votre compte Popina.";
      } else {
        apiError = `Popina API erreur ${testRes.status}`;
      }
    }
  } catch {
    apiError = "Impossible de joindre l'API Popina";
  }

  // Fetch reports for both weeks + weather in parallel
  const [reports, weatherMap] = await Promise.all([
    fetchReports(apiKey, prevMondayStr, fetchTo),
    fetchWeekWeather(weekDates),
  ]);

  // Group reports by Paris date
  const reportsByDate = new Map<string, PopinaReport[]>();
  const prodByDate = new Map<string, Map<string, { quantity: number; totalSales: number; category: string }>>();

  for (const r of reports) {
    if (!r.startedAt) continue;
    const dateKey = toParisDate(r.startedAt);

    // Raw reports per day (for zone/service breakdown)
    if (!reportsByDate.has(dateKey)) reportsByDate.set(dateKey, []);
    reportsByDate.get(dateKey)!.push(r);

    // Products per day (for top products)
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
  let caSemaineCentimes = 0;
  let paxSemaine = 0;
  for (const d of activeDates) {
    const dayReports = reportsByDate.get(d) ?? [];
    for (const r of dayReports) { caSemaineCentimes += r.totalSales ?? 0; paxSemaine += r.guestsNumber ?? 0; }
  }
  const caSemaine = c2e(caSemaineCentimes);
  const ticketMoyenSemaine = paxSemaine > 0 ? c2e(Math.round(caSemaine / paxSemaine * 100)) : 0;

  let caSemainePrecCentimes = 0;
  let paxSemainePrec = 0;
  for (const d of prevDates) {
    const dayReports = reportsByDate.get(d) ?? [];
    for (const r of dayReports) { caSemainePrecCentimes += r.totalSales ?? 0; paxSemainePrec += r.guestsNumber ?? 0; }
  }
  const caSemainePrec = c2e(caSemainePrecCentimes);
  const ticketMoyenPrec = paxSemainePrec > 0 ? c2e(Math.round(caSemainePrec / paxSemainePrec * 100)) : 0;

  const variationCA = caSemainePrec > 0 ? Math.round(((caSemaine - caSemainePrec) / caSemainePrec) * 100) : 0;
  const variationPax = paxSemainePrec > 0 ? Math.round(((paxSemaine - paxSemainePrec) / paxSemainePrec) * 100) : 0;
  const variationTicket = ticketMoyenPrec > 0 ? Math.round(((ticketMoyenSemaine - ticketMoyenPrec) / ticketMoyenPrec) * 100) : 0;

  // Best day
  let bestDay = { label: "\u2014", ca: 0 };
  for (const d of activeDates) {
    const dayReports = reportsByDate.get(d) ?? [];
    const ca = c2e(dayReports.reduce((s, r) => s + (r.totalSales ?? 0), 0));
    if (ca > bestDay.ca) {
      const dow = new Date(d + "T12:00:00").getDay();
      bestDay = { label: DAY_LABELS[dow], ca };
    }
  }

  // ── Zone totals from reports ──
  const zoneTotalsCentimes = { salle: 0, pergolas: 0, terrasse: 0, emporter: 0 };
  for (const d of activeDates) {
    for (const r of reportsByDate.get(d) ?? []) {
      const zone = classifyRoom(r.roomName);
      zoneTotalsCentimes[zone] += r.totalSales ?? 0;
    }
  }
  const zoneTotalsEur = {
    salle: c2e(zoneTotalsCentimes.salle),
    pergolas: c2e(zoneTotalsCentimes.pergolas),
    terrasse: c2e(zoneTotalsCentimes.terrasse),
    emporter: c2e(zoneTotalsCentimes.emporter),
  };
  const totalZone = zoneTotalsEur.salle + zoneTotalsEur.pergolas + zoneTotalsEur.terrasse + zoneTotalsEur.emporter;
  const zonePcts = {
    salle: totalZone > 0 ? Math.round(zoneTotalsEur.salle / totalZone * 1000) / 10 : 0,
    pergolas: totalZone > 0 ? Math.round(zoneTotalsEur.pergolas / totalZone * 1000) / 10 : 0,
    terrasse: totalZone > 0 ? Math.round(zoneTotalsEur.terrasse / totalZone * 1000) / 10 : 0,
    emporter: totalZone > 0 ? Math.round(zoneTotalsEur.emporter / totalZone * 1000) / 10 : 0,
  };

  // Tickets (sur place vs emporter)
  let paxTotal = 0;
  let caSurPlaceCentimes = 0;
  let caEmporterCentimes = 0;
  for (const d of activeDates) {
    for (const r of reportsByDate.get(d) ?? []) {
      paxTotal += r.guestsNumber ?? 0;
      const zone = classifyRoom(r.roomName);
      if (zone === "emporter") caEmporterCentimes += r.totalSales ?? 0;
      else caSurPlaceCentimes += r.totalSales ?? 0;
    }
  }
  // Rough pax split: proportion of CA
  const paxSurPlace = caEmporterCentimes > 0 && caSurPlaceCentimes > 0
    ? Math.round(paxTotal * caSurPlaceCentimes / (caSurPlaceCentimes + caEmporterCentimes))
    : paxTotal;
  const paxEmporter = paxTotal - paxSurPlace;
  const ticketSurPlace = paxSurPlace > 0 ? c2e(c2e(caSurPlaceCentimes) / paxSurPlace) : 0;
  const ticketEmporter = paxEmporter > 0 ? c2e(c2e(caEmporterCentimes) / paxEmporter) : 0;

  // ── Daily detail ──
  const dailyDetails = weekDates.map((dateStr) => {
    const dayReports = reportsByDate.get(dateStr) ?? [];
    const dow = new Date(dateStr + "T12:00:00").getDay();

    const totalCentimes = dayReports.reduce((s, r) => s + (r.totalSales ?? 0), 0);
    const ca = c2e(totalCentimes);
    const pax = dayReports.reduce((s, r) => s + (r.guestsNumber ?? 0), 0);
    const ticketMoyen = pax > 0 ? c2e(Math.round(ca / pax * 100)) : 0;

    // Zone/service from reports
    const agg = aggregateReportsForDay(dayReports);
    const services = formatDayServices(agg);

    // Top 5 products
    const dayProds = prodByDate.get(dateStr);
    const topProducts = dayProds
      ? Array.from(dayProds.entries())
        .sort(([, a], [, b]) => b.totalSales - a.totalSales)
        .slice(0, 5)
        .map(([name, v]) => ({ name, quantity: v.quantity, totalSales: c2e(v.totalSales) }))
      : [];

    // Weather
    const weather = weatherMap.get(dateStr) ?? null;

    return {
      date: dateStr,
      label: DAY_LABELS[dow],
      labelFull: DAY_LABELS_FULL[dow],
      ca, pax, ticketMoyen,
      services,
      topProducts,
      weather,
      isActive: activeDates.includes(dateStr),
    };
  });

  // ── Top products by category ──
  const catProdMap = new Map<string, Map<string, { quantity: number; totalSales: number }>>();
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

  // Previous week products for variation
  const prevProdMapAll = new Map<string, number>();
  for (const dateStr of prevDates) {
    const dayProds = prodByDate.get(dateStr);
    if (!dayProds) continue;
    for (const [name, v] of dayProds) {
      prevProdMapAll.set(name, (prevProdMapAll.get(name) ?? 0) + v.totalSales);
    }
  }

  const topByCategory: Array<{
    category: string;
    products: Array<{ name: string; quantity: number; totalSales: number; pctChange: number | null }>;
  }> = [];

  for (const [cat, prods] of catProdMap) {
    const sorted = Array.from(prods.entries())
      .sort(([, a], [, b]) => b.totalSales - a.totalSales)
      .slice(0, 5)
      .map(([name, v]) => {
        const prevSales = prevProdMapAll.get(name) ?? 0;
        const pctChange = prevSales > 0 ? Math.round(((v.totalSales - prevSales) / prevSales) * 100) : null;
        return { name, quantity: v.quantity, totalSales: c2e(v.totalSales), pctChange };
      });
    if (sorted.length > 0) topByCategory.push({ category: cat, products: sorted });
  }
  topByCategory.sort((a, b) => {
    const aTotal = a.products.reduce((s, p) => s + p.totalSales, 0);
    const bTotal = b.products.reduce((s, p) => s + p.totalSales, 0);
    return bTotal - aTotal;
  });

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
  const top5PrevNames = new Set(
    Array.from(prevProdMapAll.entries()).sort(([, a], [, b]) => b - a).slice(0, 5).map(([n]) => n)
  );

  const topSemaine = Array.from(prodMapAll.entries())
    .sort(([, a], [, b]) => b.totalSales - a.totalSales)
    .slice(0, 5)
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
    week: selectedWeek,
    weekLabel,
    isCurrentWeek,
    activeDays: activeDates.length,
    today: todayParis,
    apiError,
    kpis: {
      caSemaine, caHT: c2e(Math.round(caSemaine * 100 / 1.1)),
      paxSemaine, ticketMoyenSurPlace: ticketSurPlace, ticketMoyenEmporter: ticketEmporter,
      bestDay, variationCA, variationPax, variationTicket,
      caSemainePrec, paxSemainePrec, ticketMoyenPrec,
    },
    zones: zoneTotalsEur, zonePcts,
    days: dailyDetails,
    topSemaine, topByCategory,
  });
}
