import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHARGES_RATE = 0.45;

export async function GET(req: NextRequest) {
  const etabId = req.nextUrl.searchParams.get("etablissement_id");
  const year = parseInt(req.nextUrl.searchParams.get("year") ?? String(new Date().getFullYear()));
  if (!etabId) return NextResponse.json({ error: "etablissement_id required" }, { status: 400 });

  const supabase = supabaseAdmin;

  // Fetch all ventes for the year
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;

  const { data: ventes } = await supabase
    .from("ventes_lignes")
    .select("date_service, ht, ttc, couverts, num_fiscal, type_ligne, annule, service, salle")
    .eq("etablissement_id", etabId)
    .gte("date_service", from)
    .lte("date_service", to)
    .eq("type_ligne", "Produit");

  // Fetch contrats for MS calculation
  const { data: contrats } = await supabase
    .from("contrats")
    .select("type, remuneration, employes!inner(actif, etablissement_id)")
    .eq("actif", true)
    .eq("employes.actif", true)
    .eq("employes.etablissement_id", etabId);

  // Calculate monthly MS (same every month from current contrats)
  let msSalaries = 0;
  let msGerants = 0;
  for (const c of (contrats ?? []) as unknown as { type: string; remuneration: number }[]) {
    const brut = Number(c.remuneration) || 0;
    const t = (c.type ?? "").toLowerCase();
    if (t === "tns") {
      msGerants += brut * 1.465;
    } else {
      msSalaries += brut * (1 + CHARGES_RATE);
    }
  }
  const msTotal = Math.round(msSalaries + msGerants);

  // Aggregate by month
  type MonthData = {
    month: number; label: string;
    ca_ht: number; ca_ttc: number; couverts: number; tickets: number; jours: number;
    ms: number; ms_pct: number;
  };

  const months: MonthData[] = [];
  const rows = (ventes ?? []) as { date_service: string; ht: number; ttc: number; couverts: number; num_fiscal: string; annule: boolean }[];

  for (let m = 0; m < 12; m++) {
    const monthRows = rows.filter(r => {
      const d = new Date(r.date_service + "T12:00:00");
      return d.getMonth() === m && !r.annule;
    });

    const ca_ht = monthRows.reduce((s, r) => s + (Number(r.ht) || 0), 0);
    const ca_ttc = monthRows.reduce((s, r) => s + (Number(r.ttc) || 0), 0);

    // Unique dates
    const dates = new Set(monthRows.map(r => r.date_service));
    const jours = dates.size;

    // Unique tickets
    const ticketKeys = new Set(rows.filter(r => {
      const d = new Date(r.date_service + "T12:00:00");
      return d.getMonth() === m;
    }).map(r => `${r.date_service}:${r.num_fiscal}`));

    // Couverts (dedup by order)
    const covMap = new Map<string, number>();
    for (const r of rows.filter(r => new Date(r.date_service + "T12:00:00").getMonth() === m)) {
      const key = `${r.date_service}:${r.num_fiscal}`;
      if (!covMap.has(key)) covMap.set(key, Number(r.couverts) || 0);
    }
    let couverts = 0;
    for (const v of covMap.values()) couverts += v;
    if (couverts === 0 && covMap.size > 0) couverts = covMap.size;

    const ms_pct = ca_ht > 0 ? (msTotal / ca_ht) * 100 : 0;

    const dt = new Date(year, m, 1);
    months.push({
      month: m + 1,
      label: dt.toLocaleDateString("fr-FR", { month: "short" }).replace(/^\w/, c => c.toUpperCase()),
      ca_ht: Math.round(ca_ht),
      ca_ttc: Math.round(ca_ttc),
      couverts,
      tickets: ticketKeys.size,
      jours,
      ms: msTotal,
      ms_pct: Math.round(ms_pct * 10) / 10,
    });
  }

  // Annual KPIs
  const totalCA = months.reduce((s, m) => s + m.ca_ht, 0);
  const totalCouverts = months.reduce((s, m) => s + m.couverts, 0);
  const totalJours = months.reduce((s, m) => s + m.jours, 0);
  const activeMonths = months.filter(m => m.ca_ht > 0).length;
  const avgCAMonth = activeMonths > 0 ? totalCA / activeMonths : 0;
  const avgTM = totalCouverts > 0 ? totalCA / totalCouverts : 0;
  const msPctAnnual = totalCA > 0 ? (msTotal * activeMonths / totalCA) * 100 : 0;
  const avgCAJour = totalJours > 0 ? totalCA / totalJours : 0;

  // Best/worst months
  const withCA = months.filter(m => m.ca_ht > 0);
  const bestMonth = withCA.length > 0 ? withCA.reduce((a, b) => a.ca_ht > b.ca_ht ? a : b) : null;
  const worstMonth = withCA.length > 0 ? withCA.reduce((a, b) => a.ca_ht < b.ca_ht ? a : b) : null;

  return NextResponse.json({
    year,
    months,
    kpis: {
      totalCA: Math.round(totalCA),
      totalCouverts,
      totalJours,
      activeMonths,
      avgCAMonth: Math.round(avgCAMonth),
      avgCAJour: Math.round(avgCAJour),
      avgTM: Math.round(avgTM * 100) / 100,
      msTotal,
      msPctAnnual: Math.round(msPctAnnual * 10) / 10,
      msSalaries: Math.round(msSalaries),
      msGerants: Math.round(msGerants),
      bestMonth: bestMonth ? { label: bestMonth.label, ca: bestMonth.ca_ht } : null,
      worstMonth: worstMonth ? { label: worstMonth.label, ca: worstMonth.ca_ht } : null,
    },
  });
}
