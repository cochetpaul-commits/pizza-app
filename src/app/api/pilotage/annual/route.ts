import { NextRequest, NextResponse } from "next/server";
import { etabAccessDenied } from "@/lib/getEtablissement";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHARGES_RATE = 0.45;

export async function GET(req: NextRequest) {
  const etabId = req.nextUrl.searchParams.get("etablissement_id");
  const year = parseInt(req.nextUrl.searchParams.get("year") ?? String(new Date().getFullYear()));
  if (!etabId) return NextResponse.json({ error: "etablissement_id required" }, { status: 400 });
  const denied = await etabAccessDenied(req, etabId);
  if (denied) return denied;


  const supabase = supabaseAdmin;
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;

  // Aggregate directly in SQL to avoid pagination limits
  const { data: monthlyData, error: sqlErr } = await supabase.rpc("aggregate_ventes_monthly", {
    p_etab_id: etabId,
    p_from: from,
    p_to: to,
  });

  // Fallback: if RPC doesn't exist, use raw SQL
  let monthlyRows: { month: number; ca_ht: number; ca_ttc: number; couverts: number; tickets: number; jours: number }[] = [];

  if (sqlErr || !monthlyData) {
    // Paginate to get all rows (Supabase max ~1000 per request)
    const PAGE = 1000;
    const allRows: { date_service: string; ht: number; ttc: number; couverts: number; num_fiscal: string }[] = [];
    let offset = 0;
    let hasMore = true;
    while (hasMore) {
      const { data: page } = await supabase.from("ventes_lignes")
        .select("date_service, ht, ttc, couverts, num_fiscal")
        .eq("etablissement_id", etabId)
        .gte("date_service", from)
        .lte("date_service", to)
        .eq("type_ligne", "Produit")
        .eq("annule", false)
        .order("date_service")
        .range(offset, offset + PAGE - 1);
      const batch = (page ?? []) as typeof allRows;
      allRows.push(...batch);
      hasMore = batch.length === PAGE;
      offset += PAGE;
    }

    const rows = allRows;

    for (let m = 0; m < 12; m++) {
      const mRows = rows.filter(r => {
        const month = parseInt(r.date_service.slice(5, 7)) - 1;
        return month === m;
      });

      const ca_ht = mRows.reduce((s, r) => s + (Number(r.ht) || 0), 0);
      const ca_ttc = mRows.reduce((s, r) => s + (Number(r.ttc) || 0), 0);
      const dates = new Set(mRows.map(r => r.date_service));
      const ticketKeys = new Set(mRows.map(r => `${r.date_service}:${r.num_fiscal}`));

      // Couverts: dedup by order
      const covMap = new Map<string, number>();
      for (const r of mRows) {
        const key = `${r.date_service}:${r.num_fiscal}`;
        if (!covMap.has(key)) covMap.set(key, Number(r.couverts) || 0);
      }
      let couverts = 0;
      for (const v of covMap.values()) couverts += v;
      if (couverts === 0 && covMap.size > 0) couverts = covMap.size;

      monthlyRows.push({
        month: m + 1,
        ca_ht: Math.round(ca_ht),
        ca_ttc: Math.round(ca_ttc),
        couverts,
        tickets: ticketKeys.size,
        jours: dates.size,
      });
    }
  } else {
    monthlyRows = (monthlyData as { month: number; ca_ht: number; ca_ttc: number; couverts: number; tickets: number; jours: number }[]);
  }

  // Fetch contrats for MS calculation
  const { data: contrats } = await supabase
    .from("contrats")
    .select("type, remuneration, employes!inner(actif, etablissement_id)")
    .eq("actif", true)
    .eq("employes.actif", true)
    .eq("employes.etablissement_id", etabId);

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

  // Build month labels + add MS
  const MONTH_LABELS = ["Jan", "Fev", "Mar", "Avr", "Mai", "Juin", "Juil", "Aout", "Sep", "Oct", "Nov", "Dec"];
  const months = monthlyRows.map(m => {
    const ms_pct = m.ca_ht > 0 ? Math.round((msTotal / m.ca_ht) * 1000) / 10 : 0;
    return {
      ...m,
      label: MONTH_LABELS[m.month - 1],
      ms: msTotal,
      ms_pct,
    };
  });

  // Annual KPIs
  const totalCA = months.reduce((s, m) => s + m.ca_ht, 0);
  const totalCouverts = months.reduce((s, m) => s + m.couverts, 0);
  const totalJours = months.reduce((s, m) => s + m.jours, 0);
  const activeMonths = months.filter(m => m.ca_ht > 0).length;
  const avgCAMonth = activeMonths > 0 ? totalCA / activeMonths : 0;
  const avgTM = totalCouverts > 0 ? totalCA / totalCouverts : 0;
  const msPctAnnual = totalCA > 0 ? (msTotal * activeMonths / totalCA) * 100 : 0;
  const avgCAJour = totalJours > 0 ? totalCA / totalJours : 0;

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
