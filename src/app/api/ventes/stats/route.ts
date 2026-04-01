import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type Row = {
  date_service: string;
  service: string;
  salle: string;
  operateur: string;
  categorie: string;
  sous_categorie: string;
  description: string;
  quantite: number;
  annule: boolean;
  ttc: number;
  ht: number;
  couverts: number;
  num_fiscal: string;
  statut: string;
  ouvert_a: string;
  ferme_a: string;
  type_ligne: string;
  table_num: string;
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const etabId = searchParams.get("etablissement_id");
  const from = searchParams.get("from"); // YYYY-MM-DD
  const to = searchParams.get("to");     // YYYY-MM-DD

  if (!etabId || !from || !to) {
    return NextResponse.json({ error: "etablissement_id, from, to requis" }, { status: 400 });
  }

  // Paginate — Supabase defaults to 1000 rows max
  const allData: Row[] = [];
  const PAGE = 1000;
  let offset = 0;
  let hasMore = true;
  while (hasMore) {
    const { data, error } = await supabase
      .from("ventes_lignes")
      .select("date_service,service,salle,operateur,categorie,sous_categorie,description,quantite,annule,ttc,ht,couverts,num_fiscal,statut,ouvert_a,ferme_a,type_ligne,table_num")
      .eq("etablissement_id", etabId)
      .gte("date_service", from)
      .lte("date_service", to)
      .order("ouvert_a", { ascending: true })
      .range(offset, offset + PAGE - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    allData.push(...((data ?? []) as Row[]));
    hasMore = (data?.length ?? 0) === PAGE;
    offset += PAGE;
  }

  if (allData.length === 0) {
    // Fallback: try daily_sales (Kezia / aggregated data)
    const dailyResult = await buildFromDailySales(etabId, from, to);
    if (dailyResult) {
      // Also fetch comparison data
      let dailyPrev = null;
      const fromA1ds = (parseInt(from.slice(0, 4)) - 1) + from.slice(4);
      const toA1ds = (parseInt(to.slice(0, 4)) - 1) + to.slice(4);
      dailyPrev = await buildFromDailySales(etabId, fromA1ds, toA1ds);
      return NextResponse.json({ empty: false, stats: dailyResult, prev: dailyPrev, source: "daily_sales" });
    }
    return NextResponse.json({ empty: true, stats: null, prev: null });
  }

  const rows = allData;

  // Fetch A-1 (same period, previous year) for comparison
  const fromA1 = (parseInt(from.slice(0, 4)) - 1) + from.slice(4);
  const toA1 = (parseInt(to.slice(0, 4)) - 1) + to.slice(4);
  const prevData: Row[] = [];
  let prevOffset = 0;
  let prevMore = true;
  while (prevMore) {
    const { data: pd } = await supabase
      .from("ventes_lignes")
      .select("date_service,service,salle,operateur,categorie,sous_categorie,description,quantite,annule,ttc,ht,couverts,num_fiscal,statut,ouvert_a,ferme_a,type_ligne,table_num")
      .eq("etablissement_id", etabId)
      .gte("date_service", fromA1)
      .lte("date_service", toA1)
      .order("ouvert_a", { ascending: true })
      .range(prevOffset, prevOffset + PAGE - 1);
    prevData.push(...((pd ?? []) as Row[]));
    prevMore = (pd?.length ?? 0) === PAGE;
    prevOffset += PAGE;
  }

  // Aggregate
  const stats = aggregate(rows);
  const prev = prevData.length > 0 ? aggregate(prevData) : null;
  return NextResponse.json({ empty: false, stats, prev });
}

/** Get couverts for a unique order (dedup by num_fiscal+date).
 *  Falls back to ticket count if all couverts are 0 (Popina products format). */
function getCouverts(rows: Row[]): number {
  const seen = new Map<string, number>();
  for (const r of rows) {
    const key = `${r.date_service}:${r.num_fiscal}`;
    if (!seen.has(key)) {
      seen.set(key, Number(r.couverts) || 0);
    }
  }
  let total = 0;
  for (const v of seen.values()) total += v;
  // Fallback: if all couverts are 0, use ticket count as estimate
  if (total === 0 && seen.size > 0) return seen.size;
  return total;
}

function getCouvertsByKey(rows: Row[], keyFn: (r: Row) => string): Record<string, number> {
  const orderCov = new Map<string, { key: string; cov: number }>();
  for (const r of rows) {
    const orderKey = `${r.date_service}:${r.num_fiscal}`;
    if (!orderCov.has(orderKey)) {
      orderCov.set(orderKey, { key: keyFn(r), cov: Number(r.couverts) || 0 });
    }
  }
  const result: Record<string, number> = {};
  let allZero = true;
  for (const v of orderCov.values()) {
    result[v.key] = (result[v.key] || 0) + v.cov;
    if (v.cov > 0) allZero = false;
  }
  // Fallback: if all couverts are 0, count tickets per key
  if (allZero && orderCov.size > 0) {
    const ticketCount: Record<string, number> = {};
    for (const v of orderCov.values()) {
      ticketCount[v.key] = (ticketCount[v.key] || 0) + 1;
    }
    return ticketCount;
  }
  return result;
}

/** Normalize category names: PIZZE→Pizze, CUCINA→Cuisine, etc. */
const CAT_MAP: Record<string, string> = {
  PIZZE: "Pizze", CUCINA: "Cuisine", DOLCI: "Dolci", VINI: "Vins",
  ALCOOL: "Alcool", ANTIPASTI: "Antipasti", BEVANDE: "Boissons",
  "BEVANDE CALDE": "Boissons chaudes", DIGESTIVI: "Digestifs",
  MESSAGES: "Messages",
};
function normCat(cat: string | null): string {
  if (!cat) return "Autre";
  return CAT_MAP[cat.toUpperCase()] ?? CAT_MAP[cat] ?? cat;
}

function aggregate(rows: Row[]) {
  // IMPORTANT: only use "Produit" lines — ignore "Paiement" and "Total"
  const productRows = rows.filter(r => r.type_ligne === "Produit");
  const validRows = productRows.filter(r => !r.annule && Number(r.ttc) > 0);
  // For couverts/tickets, use all product rows (even annulés) to count orders
  const allRows = productRows;

  // Unique dates
  const dates = [...new Set(validRows.map(r => r.date_service))].sort();
  const dayNames = dates.map(d => {
    const dt = new Date(d + "T12:00:00");
    return dt.toLocaleDateString("fr-FR", { weekday: "long" });
  });

  // CA totals
  const ca_ttc = validRows.reduce((s, r) => s + Number(r.ttc), 0);
  const ca_ht = validRows.reduce((s, r) => s + Number(r.ht), 0);

  // Total couverts (dedup by order)
  const totalCouverts = getCouverts(allRows);

  // Nb tickets (unique orders)
  const tickets = new Set(allRows.map(r => `${r.date_service}:${r.num_fiscal}`));
  const totalTickets = tickets.size;

  // Annulations
  const annules = allRows.filter(r => r.annule);
  const ann_pct = allRows.length > 0 ? (annules.length / allRows.length * 100) : 0;

  // CA par jour
  const day_ttc = dates.map(d => validRows.filter(r => r.date_service === d).reduce((s, r) => s + Number(r.ttc), 0));
  const day_ht = dates.map(d => validRows.filter(r => r.date_service === d).reduce((s, r) => s + Number(r.ht), 0));

  // Couverts par jour (dedup by order per day)
  const covByDay = getCouvertsByKey(allRows, r => r.date_service);
  const day_cov = dates.map(d => covByDay[d] || 0);
  const tm_ttc = dates.map((_, i) => day_cov[i] > 0 ? day_ttc[i] / day_cov[i] : 0);
  const tm_ht = dates.map((_, i) => day_cov[i] > 0 ? day_ht[i] / day_cov[i] : 0);

  // Zones par jour (TTC + HT)
  const zoneNames = ["Salle", "Pergolas", "Terrasse", "\u00C0 emporter"];
  const isEmp = (r: Row) => r.salle?.toLowerCase().includes("emporter");
  const zoneMatch = (z: string) => z === "\u00C0 emporter" ? isEmp : (r: Row) => r.salle === z;

  const zones_ttc: Record<string, number[]> = {};
  const zones_ht: Record<string, number[]> = {};
  for (const z of zoneNames) {
    const matcher = zoneMatch(z);
    zones_ttc[z] = dates.map(d => validRows.filter(r => r.date_service === d && matcher(r)).reduce((s, r) => s + Number(r.ttc), 0));
    zones_ht[z] = dates.map(d => validRows.filter(r => r.date_service === d && matcher(r)).reduce((s, r) => s + Number(r.ht), 0));
  }

  // Sur place vs emporter (TTC + HT)
  const empRows = validRows.filter(isEmp);
  const spRows = validRows.filter(r => !isEmp(r));
  const place_emp_ttc = empRows.reduce((s, r) => s + Number(r.ttc), 0);
  const place_sur_ttc = spRows.reduce((s, r) => s + Number(r.ttc), 0);
  const place_emp_ht = empRows.reduce((s, r) => s + Number(r.ht), 0);
  const place_sur_ht = spRows.reduce((s, r) => s + Number(r.ht), 0);
  const cov_emp = getCouverts(empRows.length > 0 ? allRows.filter(isEmp) : []);
  const cov_sur = getCouverts(spRows.length > 0 ? allRows.filter(r => !isEmp(r)) : []);

  // Services (par jour + midi/soir) — with couverts
  const services: {
    jour: string; svc: string; ttc: number; ht: number; cov: number; tm_ttc: number; tm_ht: number;
    sp_ttc: number; sp_ht: number; emp_ttc: number; emp_ht: number;
    sp_cov: number; tm_sp_ttc: number; tm_sp_ht: number;
    z_ttc: Record<string, number>; z_ht: Record<string, number>;
  }[] = [];

  for (const d of dates) {
    const jourName = new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long" });
    const jourCap = jourName.charAt(0).toUpperCase() + jourName.slice(1);
    for (const svc of ["midi", "soir"]) {
      const svcRows = validRows.filter(r => r.date_service === d && r.service === svc);
      if (svcRows.length === 0) continue;
      const svcAllRows = allRows.filter(r => r.date_service === d && r.service === svc);
      const cov = getCouverts(svcAllRows);
      const ttc = svcRows.reduce((s, r) => s + Number(r.ttc), 0);
      const ht = svcRows.reduce((s, r) => s + Number(r.ht), 0);
      const spSvc = svcRows.filter(r => !isEmp(r));
      const empSvc = svcRows.filter(r => isEmp(r));
      const spCov = getCouverts(svcAllRows.filter(r => !isEmp(r)));
      const spTTC = spSvc.reduce((s, r) => s + Number(r.ttc), 0);
      const spHT = spSvc.reduce((s, r) => s + Number(r.ht), 0);
      const empTTC = empSvc.reduce((s, r) => s + Number(r.ttc), 0);
      const empHT = empSvc.reduce((s, r) => s + Number(r.ht), 0);

      const z_ttc: Record<string, number> = {};
      const z_ht: Record<string, number> = {};
      for (const zn of zoneNames) {
        const m = zoneMatch(zn);
        const key = zn === "\u00C0 emporter" ? "emp" : zn;
        z_ttc[key] = svcRows.filter(m).reduce((s, r) => s + Number(r.ttc), 0);
        z_ht[key] = svcRows.filter(m).reduce((s, r) => s + Number(r.ht), 0);
      }

      services.push({
        jour: jourCap, svc, ttc, ht, cov,
        tm_ttc: cov > 0 ? ttc / cov : 0,
        tm_ht: cov > 0 ? ht / cov : 0,
        sp_ttc: spTTC, sp_ht: spHT, emp_ttc: empTTC, emp_ht: empHT,
        sp_cov: spCov,
        tm_sp_ttc: spCov > 0 ? spTTC / spCov : 0,
        tm_sp_ht: spCov > 0 ? spHT / spCov : 0,
        z_ttc, z_ht,
      });
    }
  }

  // Mix catégories (TTC + HT)
  const catMap: Record<string, { ttc: number; ht: number }> = {};
  for (const r of validRows) {
    const cat = normCat(r.categorie);
    if (!catMap[cat]) catMap[cat] = { ttc: 0, ht: 0 };
    catMap[cat].ttc += Number(r.ttc);
    catMap[cat].ht += Number(r.ht);
  }
  const mixEntries = Object.entries(catMap)
    .filter(([k, v]) => v.ttc > 0 && k !== "Messages" && k !== "Autre")
    .sort((a, b) => b[1].ttc - a[1].ttc);
  const mix_labels = mixEntries.map(([k]) => k);
  const mix_ttc = mixEntries.map(([, v]) => Math.round(v.ttc));
  const mix_ht = mixEntries.map(([, v]) => Math.round(v.ht));

  // Top 10 produits (TTC + HT)
  const prodMap: Record<string, { ca_ttc: number; ca_ht: number; qty: number }> = {};
  for (const r of validRows) {
    if (!r.description) continue;
    const nc = normCat(r.categorie);
    if (nc === "Messages" || nc === "Autre") continue;
    const key = r.description;
    if (!prodMap[key]) prodMap[key] = { ca_ttc: 0, ca_ht: 0, qty: 0 };
    prodMap[key].ca_ttc += Number(r.ttc);
    prodMap[key].ca_ht += Number(r.ht);
    prodMap[key].qty += Number(r.quantite);
  }
  const top10 = Object.entries(prodMap).sort((a, b) => b[1].ca_ttc - a[1].ca_ttc).slice(0, 10);
  const top10_names = top10.map(([k]) => k);
  const top10_ca_ttc = top10.map(([, v]) => Math.round(v.ca_ttc));
  const top10_ca_ht = top10.map(([, v]) => Math.round(v.ca_ht));
  const top10_qty = top10.map(([, v]) => v.qty);

  // Produits par catégorie (TTC + HT)
  const catProds: Record<string, { n: string; qty: number; ca_ttc: number; ca_ht: number }[]> = {};
  for (const r of validRows) {
    if (!r.description) continue;
    const cat = normCat(r.categorie);
    if (cat === "Messages" || cat === "Autre") continue;
    if (!catProds[cat]) catProds[cat] = [];
    const existing = catProds[cat].find(p => p.n === r.description);
    if (existing) {
      existing.ca_ttc += Number(r.ttc);
      existing.ca_ht += Number(r.ht);
      existing.qty += Number(r.quantite);
    } else {
      catProds[cat].push({ n: r.description, qty: Number(r.quantite), ca_ttc: Number(r.ttc), ca_ht: Number(r.ht) });
    }
  }
  for (const cat of Object.keys(catProds)) {
    catProds[cat].sort((a, b) => b.ca_ttc - a.ca_ttc);
    catProds[cat] = catProds[cat].map(p => ({ ...p, ca_ttc: Math.round(p.ca_ttc), ca_ht: Math.round(p.ca_ht) }));
  }

  // Produits par catégorie — sur place vs emporter
  function buildCatProdsForRows(rows: Row[]) {
    const cp: Record<string, { n: string; qty: number; ca_ttc: number; ca_ht: number }[]> = {};
    for (const r of rows) {
      if (!r.description) continue;
      const cat = normCat(r.categorie);
      if (cat === "Messages" || cat === "Autre") continue;
      if (!cp[cat]) cp[cat] = [];
      const existing = cp[cat].find(p => p.n === r.description);
      if (existing) {
        existing.ca_ttc += Number(r.ttc);
        existing.ca_ht += Number(r.ht);
        existing.qty += Number(r.quantite);
      } else {
        cp[cat].push({ n: r.description, qty: Number(r.quantite), ca_ttc: Number(r.ttc), ca_ht: Number(r.ht) });
      }
    }
    for (const cat of Object.keys(cp)) {
      cp[cat].sort((a, b) => b.ca_ttc - a.ca_ttc);
      cp[cat] = cp[cat].map(p => ({ ...p, ca_ttc: Math.round(p.ca_ttc), ca_ht: Math.round(p.ca_ht) }));
    }
    return cp;
  }
  const cat_products_sur = buildCatProdsForRows(spRows);
  const cat_products_emp = buildCatProdsForRows(empRows);

  // Top 3 par catégorie
  const top3_cats = mixEntries.slice(0, 8).map(([cat]) => {
    const prods = catProds[cat] || [];
    const top3 = prods.slice(0, 3).map(p => ({
      n: p.n,
      ca_ttc: `${p.ca_ttc.toLocaleString("fr-FR")}\u20AC`,
      ca_ht: `${p.ca_ht.toLocaleString("fr-FR")}\u20AC`,
    }));
    const flop = prods.length > 3 ? prods[prods.length - 1] : null;
    return {
      cat,
      rows: top3,
      flop: flop ? {
        n: flop.n,
        ca_ttc: `${flop.ca_ttc.toLocaleString("fr-FR")}\u20AC`,
        ca_ht: `${flop.ca_ht.toLocaleString("fr-FR")}\u20AC`,
        qty: flop.qty,
      } : null,
    };
  });

  // Serveurs (TTC + HT + couverts + tickets)
  const servMap: Record<string, { ttc: number; ht: number; orders: Set<string> }> = {};
  for (const r of validRows) {
    const op = r.operateur?.trim();
    if (!op) continue;
    if (!servMap[op]) servMap[op] = { ttc: 0, ht: 0, orders: new Set() };
    servMap[op].ttc += Number(r.ttc);
    servMap[op].ht += Number(r.ht);
    servMap[op].orders.add(`${r.date_service}:${r.num_fiscal}`);
  }
  const servEntries = Object.entries(servMap).sort((a, b) => b[1].ttc - a[1].ttc);
  const serveurs = servEntries.map(([k]) => k);
  const serv_ca_ttc = servEntries.map(([, v]) => Math.round(v.ttc));
  const serv_ca_ht = servEntries.map(([, v]) => Math.round(v.ht));
  const serv_tickets = servEntries.map(([, v]) => v.orders.size);
  // Couverts per server
  const serv_cov = servEntries.map(([name]) => {
    const serverOrders = new Map<string, number>();
    for (const r of allRows) {
      if (r.operateur?.trim() !== name) continue;
      const key = `${r.date_service}:${r.num_fiscal}`;
      if (!serverOrders.has(key)) serverOrders.set(key, Number(r.couverts) || 0);
    }
    let total = 0;
    let allZ = true;
    for (const v of serverOrders.values()) { total += v; if (v > 0) allZ = false; }
    return allZ ? serverOrders.size : total;
  });

  // Ratios upsell (based on unique tables/tickets + couverts)
  const orderKey = (r: Row) => `${r.date_service}:${r.num_fiscal}`;

  // Build order-level data: couverts per order, categories ordered
  const orderData = new Map<string, { cov: number; cats: Set<string>; ca_ttc: number; ca_ht: number }>();
  for (const r of allRows) {
    const key = orderKey(r);
    if (!orderData.has(key)) {
      orderData.set(key, { cov: Number(r.couverts) || 0, cats: new Set(), ca_ttc: 0, ca_ht: 0 });
    }
    const od = orderData.get(key)!;
    const nc = normCat(r.categorie);
    if (nc !== "Messages" && nc !== "Autre" && !r.annule) {
      od.cats.add(nc);
      od.ca_ttc += Number(r.ttc);
      od.ca_ht += Number(r.ht);
    }
  }

  // If couverts are all 0 (Popina format), estimate 1 per order
  let allCovZero = true;
  for (const od of orderData.values()) { if (od.cov > 0) { allCovZero = false; break; } }
  if (allCovZero) { for (const od of orderData.values()) od.cov = 1; }

  // Count tables & couverts for each upsell category
  function upsellStats(catFilter: (cats: Set<string>) => boolean) {
    let tables = 0, coverts = 0, ca_ttc_total = 0, ca_ht_total = 0;
    for (const od of orderData.values()) {
      if (catFilter(od.cats)) {
        tables++;
        coverts += od.cov;
      }
    }
    // CA for the category
    for (const r of validRows) {
      const nc = normCat(r.categorie);
      if (catFilter(new Set([nc]))) {
        ca_ttc_total += Number(r.ttc);
        ca_ht_total += Number(r.ht);
      }
    }
    return { tables, coverts, ca_ttc: Math.round(ca_ttc_total), ca_ht: Math.round(ca_ht_total) };
  }

  const anti = upsellStats(cats => cats.has("Antipasti"));
  const dolci = upsellStats(cats => cats.has("Dolci"));
  const vin = upsellStats(cats => cats.has("Vins"));
  const alcool = upsellStats(cats => cats.has("Alcool"));
  const boissons = upsellStats(cats => cats.has("Boissons") || cats.has("Alcool") || cats.has("Vins"));
  const digestif = upsellStats(cats => cats.has("Digestifs"));
  const cafe = upsellStats(cats => cats.has("Boissons chaudes"));

  // Avg couverts per table
  const totalOrderCov = Array.from(orderData.values()).reduce((s, od) => s + od.cov, 0);
  const avgCovPerTable = totalTickets > 0 ? Math.round(totalOrderCov / totalTickets * 10) / 10 : 0;

  // Avg time per table (from ouvert_a to ferme_a)
  // We'd need ferme_a but aggregate doesn't have it — skip for now

  // Duration & rotation per table
  type OrderDur = { salle: string; table: string; service: string; date: string; cov: number; dur: number; ca_ttc: number };
  const orderDurs: OrderDur[] = [];
  for (const [key, od] of orderData.entries()) {
    // Find ouvert_a and ferme_a from first row of this order
    const orderRows = allRows.filter(r => `${r.date_service}:${r.num_fiscal}` === key);
    if (orderRows.length === 0) continue;
    const first = orderRows[0];
    if (!first.ouvert_a || !first.ferme_a) continue;
    const open = new Date(first.ouvert_a).getTime();
    const close = new Date(first.ferme_a).getTime();
    if (isNaN(open) || isNaN(close) || close <= open) continue;
    const durMin = Math.round((close - open) / 60000);
    if (durMin < 5 || durMin > 600) continue; // filter aberrations
    orderDurs.push({
      salle: first.salle || "",
      table: first.table_num || "",
      service: first.service || "",
      date: first.date_service,
      cov: od.cov,
      dur: durMin,
      ca_ttc: od.ca_ttc,
    });
  }

  // Global averages
  const avgDurMin = orderDurs.length > 0 ? Math.round(orderDurs.reduce((s, o) => s + o.dur, 0) / orderDurs.length) : 0;

  // Duration by zone (exclude "A emporter" — no table rotation there)
  const durByZone: Record<string, { count: number; totalDur: number; totalCov: number }> = {};
  for (const o of orderDurs) {
    if (o.salle.toLowerCase().includes("emporter")) continue;
    const z = o.salle;
    if (!durByZone[z]) durByZone[z] = { count: 0, totalDur: 0, totalCov: 0 };
    durByZone[z].count++;
    durByZone[z].totalDur += o.dur;
    durByZone[z].totalCov += o.cov;
  }
  const zoneDurations = Object.entries(durByZone).map(([zone, d]) => ({
    zone,
    avgDur: d.count > 0 ? Math.round(d.totalDur / d.count) : 0,
    tables: d.count,
    couverts: d.totalCov,
  }));

  // Duration by service
  const durBySvc: Record<string, { count: number; totalDur: number }> = {};
  for (const o of orderDurs) {
    if (!durBySvc[o.service]) durBySvc[o.service] = { count: 0, totalDur: 0 };
    durBySvc[o.service].count++;
    durBySvc[o.service].totalDur += o.dur;
  }
  const svcDurations = Object.entries(durBySvc).map(([svc, d]) => ({
    svc,
    avgDur: d.count > 0 ? Math.round(d.totalDur / d.count) : 0,
    tables: d.count,
  }));

  // Rotation: count unique orders per physical table per service per day
  const tableSlots: Record<string, Set<string>> = {}; // key = date:service:salle:table → set of order keys
  for (const o of orderDurs) {
    if (!o.table || o.salle.toLowerCase().includes("emporter")) continue;
    const slotKey = `${o.date}:${o.service}:${o.salle}:${o.table}`;
    if (!tableSlots[slotKey]) tableSlots[slotKey] = new Set();
    tableSlots[slotKey].add(`${o.date}:${o.table}:${o.dur}`);
  }
  const rotations = Object.values(tableSlots).map(s => s.size);
  const avgRotation = rotations.length > 0 ? Math.round(rotations.reduce((a, b) => a + b, 0) / rotations.length * 10) / 10 : 0;

  // Rotation by zone
  const rotByZone: Record<string, number[]> = {};
  for (const [slotKey, orders] of Object.entries(tableSlots)) {
    const parts = slotKey.split(":");
    const zone = parts[2]; // salle name
    if (!rotByZone[zone]) rotByZone[zone] = [];
    rotByZone[zone].push(orders.size);
  }
  const zoneRotations = Object.entries(rotByZone).map(([zone, rots]) => ({
    zone,
    avgRotation: rots.length > 0 ? Math.round(rots.reduce((a, b) => a + b, 0) / rots.length * 10) / 10 : 0,
    maxRotation: rots.length > 0 ? Math.max(...rots) : 0,
  }));

  // Paiements — aggregate type_ligne='Paiement' lines
  const payRows = rows.filter(r => r.type_ligne === "Paiement" && Number(r.ttc) > 0);
  const payMap: Record<string, number> = {};
  for (const r of payRows) {
    const label = (r.description || "Autre").trim();
    payMap[label] = (payMap[label] || 0) + Number(r.ttc);
  }
  const payTotal = Object.values(payMap).reduce((a, b) => a + b, 0);
  const pay = Object.entries(payMap)
    .sort((a, b) => b[1] - a[1])
    .map(([label, val]) => ({
      l: `${label} · ${payTotal > 0 ? Math.round(val / payTotal * 100) : 0}%`,
      v: Math.round(val),
      pct: payTotal > 0 ? Math.round(val / payTotal * 100) : 0,
    }));

  return {
    dates,
    days: dayNames.map(d => d.charAt(0).toUpperCase() + d.slice(1)),
    ca_ttc: Math.round(ca_ttc * 100) / 100,
    ca_ht: Math.round(ca_ht * 100) / 100,
    couverts: totalCouverts,
    tickets: totalTickets,
    ann_pct: Math.round(ann_pct * 10) / 10,
    day_ttc, day_ht, day_cov, tm_ttc, tm_ht,
    zones_ttc, zones_ht,
    place_sur_ttc: Math.round(place_sur_ttc), place_sur_ht: Math.round(place_sur_ht),
    place_emp_ttc: Math.round(place_emp_ttc), place_emp_ht: Math.round(place_emp_ht),
    cov_sur, cov_emp,
    services,
    mix_labels, mix_ttc, mix_ht,
    top10_names, top10_ca_ttc, top10_ca_ht, top10_qty,
    cat_products: catProds,
    cat_products_sur: cat_products_sur,
    cat_products_emp: cat_products_emp,
    top3_cats,
    serveurs, serv_ca_ttc, serv_ca_ht, serv_tickets, serv_cov,
    ratios: {
      anti, dolci, vin, alcool, boissons, digestif, cafe,
      avgCovPerTable,
    },
    pay,
    duration: {
      avgDurMin,
      byZone: zoneDurations,
      bySvc: svcDurations,
      avgRotation,
      rotByZone: zoneRotations,
      totalOrders: orderDurs.length,
    },
  };
}

/* ── daily_sales fallback (Kezia / aggregated data) ── */

type DailySalesRow = {
  date: string;
  ca_ttc: number;
  ca_ht: number;
  tickets: number;
  couverts: number;
  panier_moyen: number;
  marge_total: number;
  taux_marque: number;
  tva_total: number;
  rayons: unknown;
};

async function buildFromDailySales(etabId: string, from: string, to: string) {
  const { data, error } = await supabase
    .from("daily_sales")
    .select("date,ca_ttc,ca_ht,tickets,couverts,panier_moyen,marge_total,taux_marque,tva_total,rayons")
    .eq("etablissement_id", etabId)
    .not("source", "in", '("kezia_products","kezia_article_stats")')
    .gte("date", from)
    .lte("date", to)
    .order("date");

  if (error || !data || data.length === 0) return null;

  const rows = data as DailySalesRow[];

  // Fetch product hourly summary (kezia_products)
  const { data: prodRow } = await supabase
    .from("daily_sales")
    .select("rayons")
    .eq("etablissement_id", etabId)
    .eq("source", "kezia_products")
    .limit(1);

  let topProductsHourly: { name: string; total: number; hourly: number[] }[] = [];
  if (prodRow && prodRow[0]?.rayons) {
    try {
      const parsed = typeof prodRow[0].rayons === "string" ? JSON.parse(prodRow[0].rayons) : prodRow[0].rayons;
      topProductsHourly = parsed.top_products ?? [];
    } catch { /* ignore */ }
  }

  // Fetch article stats (kezia_article_stats) — monthly product data with CA + marge
  const { data: articleRows } = await supabase
    .from("daily_sales")
    .select("date,rayons,ca_ttc,ca_ht,marge_total")
    .eq("etablissement_id", etabId)
    .eq("source", "kezia_article_stats")
    .gte("date", from.slice(0, 7) + "-01") // same month range
    .lte("date", to)
    .order("date");

  type ArticleProduct = { name: string; ca_ht: number; ca_ttc: number; marge: number; nb_ventes: number; nb_articles: number; panier_moyen: number };
  let articleProducts: ArticleProduct[] = [];
  if (articleRows && articleRows.length > 0) {
    // Merge products from all matching monthly stats
    const allProds = new Map<string, ArticleProduct>();
    for (const ar of articleRows) {
      const parsed = typeof ar.rayons === "string" ? JSON.parse(ar.rayons as string) : ar.rayons;
      const prods = (parsed?.products ?? []) as ArticleProduct[];
      for (const p of prods) {
        const existing = allProds.get(p.name);
        if (existing) {
          existing.ca_ht += p.ca_ht;
          existing.ca_ttc += p.ca_ttc;
          existing.marge += p.marge;
          existing.nb_ventes += p.nb_ventes;
          existing.nb_articles += p.nb_articles;
        } else {
          allProds.set(p.name, { ...p });
        }
      }
    }
    articleProducts = Array.from(allProds.values()).sort((a, b) => b.ca_ttc - a.ca_ttc);
  }

  const dates = rows.map(d => d.date);
  const dayNames = dates.map(d => {
    const dt = new Date(d + "T12:00:00");
    return dt.toLocaleDateString("fr-FR", { weekday: "long" });
  });

  const ca_ttc = rows.reduce((s, d) => s + (Number(d.ca_ttc) || 0), 0);
  const ca_ht = rows.reduce((s, d) => s + (Number(d.ca_ht) || 0), 0);
  const totalTickets = rows.reduce((s, d) => s + (Number(d.tickets) || 0), 0);
  const totalCouverts = rows.reduce((s, d) => s + (Number(d.couverts) || Number(d.tickets) || 0), 0);
  const totalMarge = rows.reduce((s, d) => s + (Number(d.marge_total) || 0), 0);

  const day_ttc = rows.map(d => Number(d.ca_ttc) || 0);
  const day_ht = rows.map(d => Number(d.ca_ht) || 0);
  const day_cov = rows.map(d => Number(d.couverts) || Number(d.tickets) || 0);
  const tm_ttc = rows.map(d => Number(d.panier_moyen) || 0);
  const tm_ht = rows.map(d => {
    const ht = Number(d.ca_ht) || 0;
    const tix = Number(d.tickets) || 1;
    return tix > 0 ? Math.round(ht / tix * 100) / 100 : 0;
  });

  // Marge data per day
  const day_marge = rows.map(d => Number(d.marge_total) || 0);
  const day_taux_marque = rows.map(d => Number(d.taux_marque) || 0);

  // Extract rayon (category) data from daily_sales.rayons field
  const rayonTotals: Record<string, number> = {};
  const rayonByDay: Record<string, number[]> = {};
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r.rayons || typeof r.rayons !== "object") continue;
    const rayonsObj = r.rayons as Record<string, unknown>;
    const cats = rayonsObj.categories as Record<string, number> | undefined;
    if (!cats) continue;
    for (const [cat, val] of Object.entries(cats)) {
      if (!rayonTotals[cat]) { rayonTotals[cat] = 0; rayonByDay[cat] = new Array(rows.length).fill(0); }
      rayonTotals[cat] += val;
      rayonByDay[cat][i] = val;
    }
  }

  // Build mix from rayons
  const mixEntries = Object.entries(rayonTotals)
    .filter(([k, v]) => v > 0 && k !== "Non attribué" && k !== "Rayon inconnu")
    .sort((a, b) => b[1] - a[1]);
  const mix_labels = mixEntries.map(([k]) => k);
  const mix_ttc = mixEntries.map(([, v]) => Math.round(v));
  const mix_ht = mix_ttc; // approximation — rayon data is TTC from Table 10-02

  // Build zones from rayons (for daily zone charts)
  const zones_ttc: Record<string, number[]> = {};
  for (const [cat] of mixEntries) {
    if (rayonByDay[cat]) {
      zones_ttc[cat] = rayonByDay[cat];
    }
  }

  // Build top10 from article stats (best source) or hourly products (fallback)
  let top10_names: string[] = [];
  let top10_ca_ttc: number[] = [];
  let top10_ca_ht: number[] = [];
  let top10_qty: number[] = [];
  let catProducts: Record<string, { n: string; qty: number; ca_ttc: number; ca_ht: number }[]> = {};

  if (articleProducts.length > 0) {
    const top10 = articleProducts.slice(0, 10);
    top10_names = top10.map(p => p.name);
    top10_ca_ttc = top10.map(p => Math.round(p.ca_ttc));
    top10_ca_ht = top10.map(p => Math.round(p.ca_ht));
    top10_qty = top10.map(p => p.nb_ventes);

    // Group all products by a simple categorization (first word or grouping)
    for (const p of articleProducts) {
      // Use a simple heuristic: group PIZZA*, ARANCINI, TIRAMISU, etc.
      let cat = "Autre";
      const n = p.name.toUpperCase();
      if (n.includes("PIZZA")) cat = "Pizze";
      else if (n.includes("LASAGNA") || n.includes("GNUDI") || n.includes("PARM") || n.includes("POLPETTE") || n.includes("PASTA") || n.includes("RAVIOLI") || n.includes("GNOCCHI")) cat = "Cuisine";
      else if (n.includes("TIRAMISU") || n.includes("PANNA COTTA") || n.includes("CHEESECAKE") || n.includes("PATISSERIE") || n.includes("FONDANT") || n.includes("CRUMBLE")) cat = "Dolci";
      else if (n.includes("ARANCINI") || n.includes("BRUSCHETTA") || n.includes("BURRATA") || n.includes("CARPACCIO") || n.includes("FOCACCIA")) cat = "Antipasti";
      else if (n.includes("PROSECCO") || n.includes("ROSSO") || n.includes("BIANCO") || n.includes("VIN") || n.includes("CHIANTI") || n.includes("ZACCAGNINI") || n.includes("MONCARRO") || n.includes("SENTIMENTO")) cat = "Vins";
      else if (n.includes("CAFFE") || n.includes("CAFÉ") || n.includes("CAPPUCCINO") || n.includes("ESPRESSO") || n.includes("LATTE")) cat = "Boissons chaudes";
      else if (n.includes("COCA") || n.includes("ORANGINA") || n.includes("EAU") || n.includes("LIMONADE") || n.includes("JUS") || n.includes("SCHWEPPES") || n.includes("SPRITE") || n.includes("SAN PELLEGRINO")) cat = "Boissons";
      else if (n.includes("NEGRONI") || n.includes("SPRITZ") || n.includes("LIMONCELLO") || n.includes("GRAPPA") || n.includes("APEROL") || n.includes("COSMO") || n.includes("COCKTAIL")) cat = "Alcool";
      else if (n.includes("CHIPS") || n.includes("SAUCE") || n.includes("OLIO") || n.includes("HUILE") || n.includes("TRUFFE") || n.includes("FILOTEA") || n.includes("POLENTA")) cat = "Epicerie";

      if (!catProducts[cat]) catProducts[cat] = [];
      catProducts[cat].push({ n: p.name, qty: p.nb_ventes, ca_ttc: Math.round(p.ca_ttc), ca_ht: Math.round(p.ca_ht) });
    }
    // Sort each category by CA
    for (const cat of Object.keys(catProducts)) {
      catProducts[cat].sort((a, b) => b.ca_ttc - a.ca_ttc);
    }
  } else if (topProductsHourly.length > 0) {
    const top10 = topProductsHourly.slice(0, 10);
    top10_names = top10.map(p => p.name);
    top10_qty = top10.map(p => Math.round(p.total));
    top10_ca_ttc = top10_qty;
    top10_ca_ht = top10_qty;
  }

  // Build top3_cats from catProducts
  const top3_cats = Object.entries(catProducts)
    .filter(([k]) => k !== "Autre")
    .sort((a, b) => {
      const aCA = a[1].reduce((s, p) => s + p.ca_ttc, 0);
      const bCA = b[1].reduce((s, p) => s + p.ca_ttc, 0);
      return bCA - aCA;
    })
    .slice(0, 8)
    .map(([cat, prods]) => ({
      cat,
      rows: prods.slice(0, 3).map(p => ({
        n: p.n,
        ca_ttc: `${p.ca_ttc.toLocaleString("fr-FR")}\u20AC`,
        ca_ht: `${p.ca_ht.toLocaleString("fr-FR")}\u20AC`,
      })),
      flop: prods.length > 3 ? {
        n: prods[prods.length - 1].n,
        ca_ttc: `${prods[prods.length - 1].ca_ttc.toLocaleString("fr-FR")}\u20AC`,
        ca_ht: `${prods[prods.length - 1].ca_ht.toLocaleString("fr-FR")}\u20AC`,
        qty: prods[prods.length - 1].qty,
      } : null,
    }));

  // Build mix from article stats if rayons empty
  let finalMixLabels = mix_labels;
  let finalMixTtc = mix_ttc;
  let finalMixHt = mix_ht;
  if (finalMixLabels.length === 0 && Object.keys(catProducts).length > 0) {
    const catEntries = Object.entries(catProducts)
      .filter(([k]) => k !== "Autre")
      .map(([cat, prods]) => ({
        cat,
        ttc: prods.reduce((s, p) => s + p.ca_ttc, 0),
        ht: prods.reduce((s, p) => s + p.ca_ht, 0),
      }))
      .sort((a, b) => b.ttc - a.ttc);
    finalMixLabels = catEntries.map(e => e.cat);
    finalMixTtc = catEntries.map(e => e.ttc);
    finalMixHt = catEntries.map(e => e.ht);
  }

  // Hourly distribution from hourly products
  const hourly_totals = Array.from({ length: 24 }, () => 0);
  for (const p of topProductsHourly) {
    if (p.hourly) {
      for (let h = 0; h < 24; h++) {
        hourly_totals[h] += p.hourly[h] || 0;
      }
    }
  }

  const emptyUpsell = { tables: 0, coverts: 0, ca_ttc: 0, ca_ht: 0 };

  return {
    dates,
    days: dayNames.map(d => d.charAt(0).toUpperCase() + d.slice(1)),
    ca_ttc: Math.round(ca_ttc * 100) / 100,
    ca_ht: Math.round(ca_ht * 100) / 100,
    couverts: totalCouverts,
    tickets: totalTickets,
    ann_pct: 0,
    day_ttc, day_ht, day_cov, tm_ttc, tm_ht,
    zones_ttc,
    zones_ht: zones_ttc, // same as TTC for rayon data
    place_sur_ttc: Math.round(ca_ttc),
    place_sur_ht: Math.round(ca_ht),
    place_emp_ttc: 0, place_emp_ht: 0,
    cov_sur: totalCouverts, cov_emp: 0,
    services: [],
    mix_labels: finalMixLabels,
    mix_ttc: finalMixTtc,
    mix_ht: finalMixHt,
    top10_names,
    top10_ca_ttc,
    top10_ca_ht,
    top10_qty,
    cat_products: catProducts as Record<string, unknown[]>,
    cat_products_sur: {} as Record<string, unknown[]>,
    cat_products_emp: {} as Record<string, unknown[]>,
    top3_cats,
    serveurs: [] as string[],
    serv_ca_ttc: [] as number[],
    serv_ca_ht: [] as number[],
    serv_tickets: [] as number[],
    serv_cov: [] as number[],
    ratios: {
      anti: emptyUpsell, dolci: emptyUpsell, vin: emptyUpsell,
      alcool: emptyUpsell, boissons: emptyUpsell, digestif: emptyUpsell, cafe: emptyUpsell,
      avgCovPerTable: 0,
    },
    pay: [],
    duration: {
      avgDurMin: 0, byZone: [], bySvc: [], avgRotation: 0, rotByZone: [], totalOrders: 0,
    },
    // Extra: marge data for daily_sales source
    marge_total: Math.round(totalMarge * 100) / 100,
    marge_pct: ca_ht > 0 ? Math.round(totalMarge / ca_ht * 10000) / 100 : 0,
    day_marge,
    day_taux_marque,
    hourly_totals,
  };
}
