"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import Link from "next/link";
import Chart from "chart.js/auto";
import { useEtablissement } from "@/lib/EtablissementContext";
import { supabase } from "@/lib/supabaseClient";
import { T } from "@/lib/tokens";
import { RequireRole } from "@/components/RequireRole";
import { AiInsightCard } from "@/components/AiInsightCard";

const GROUP_COLOR = "#b45f57";
const OSWALD = "var(--font-oswald), Oswald, sans-serif";
const DM_SANS = "var(--font-dm-sans), 'DM Sans', sans-serif";

/* macOS card styles */
const CARD = {
  background: "rgba(255,255,255,0.82)",
  backdropFilter: "blur(20px) saturate(180%)",
  WebkitBackdropFilter: "blur(20px) saturate(180%)",
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.06)",
  boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03), 0 0 0 0.5px rgba(0,0,0,0.04)",
} as const;

type Period = "semaine" | "mois" | "exercice";

function fmtEur(n: number) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtPct(n: number) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/* ── Date helpers ── */

function getMonday(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function getFirstOfMonth(dateStr: string): string {
  return dateStr.slice(0, 8) + "01";
}

function getFiscalYearStart(dateStr: string): string {
  const y = parseInt(dateStr.slice(0, 4));
  const m = parseInt(dateStr.slice(5, 7));
  const fiscalYear = m >= 10 ? y : y - 1;
  return `${fiscalYear}-10-01`;
}

function shiftDate(ref: string, period: Period, delta: number): string {
  const d = new Date(ref + "T00:00:00");
  if (period === "semaine") d.setDate(d.getDate() + delta * 7);
  else if (period === "mois") d.setMonth(d.getMonth() + delta);
  else d.setFullYear(d.getFullYear() + delta);
  return d.toISOString().slice(0, 10);
}

function getPreviousPeriodRange(period: Period, ref: string) {
  return getPeriodRange(period, shiftDate(ref, period, -1));
}

function getA1Range(period: Period, ref: string) {
  const y = parseInt(ref.slice(0, 4));
  return getPeriodRange(period, `${y - 1}${ref.slice(4)}`);
}

function getPeriodRange(period: Period, ref: string) {
  if (period === "semaine") {
    const mon = getMonday(ref);
    const d = new Date(mon + "T00:00:00");
    d.setDate(d.getDate() + 6);
    return { start: mon, end: d.toISOString().slice(0, 10) };
  }
  if (period === "mois") {
    const start = getFirstOfMonth(ref);
    const y = parseInt(ref.slice(0, 4));
    const m = parseInt(ref.slice(5, 7));
    const last = new Date(y, m, 0).getDate();
    return { start, end: `${ref.slice(0, 8)}${String(last).padStart(2, "0")}` };
  }
  const fyStart = getFiscalYearStart(ref);
  const fyY = parseInt(fyStart.slice(0, 4));
  return { start: fyStart, end: `${fyY + 1}-09-30` };
}

/* ── Types ── */

type EtabKpis = {
  ca: number; caPrev: number; caA1: number;
  couverts: number; couvertsPrev: number; couvertsA1: number;
};

type SupplierTotal = { name: string; total: number };

export default function GroupDashboard() {
  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <GroupContent />
    </RequireRole>
  );
}

function periodDisplayLabel(period: Period, ref: string): string {
  const MONTHS = ["janvier","fevrier","mars","avril","mai","juin","juillet","aout","septembre","octobre","novembre","decembre"];
  if (period === "semaine") {
    const mon = getMonday(ref);
    const d1 = new Date(mon + "T00:00:00");
    const d2 = new Date(mon + "T00:00:00");
    d2.setDate(d2.getDate() + 6);
    const day1 = d1.getDate();
    const month1 = MONTHS[d1.getMonth()];
    const day2 = d2.getDate();
    const month2 = MONTHS[d2.getMonth()];
    const year2 = d2.getFullYear();
    if (d1.getMonth() === d2.getMonth()) return `Sem. du ${day1} au ${day2} ${month1} ${year2}`;
    return `Sem. du ${day1} ${month1} au ${day2} ${month2} ${year2}`;
  }
  if (period === "mois") {
    const m = parseInt(ref.slice(5, 7));
    const y = parseInt(ref.slice(0, 4));
    return `${MONTHS[m - 1].charAt(0).toUpperCase() + MONTHS[m - 1].slice(1)} ${y}`;
  }
  const fyStart = getFiscalYearStart(ref);
  const fyY = parseInt(fyStart.slice(0, 4));
  return `Oct ${fyY} — Sep ${fyY + 1}`;
}

async function fetchAllVentesRows(
  etabId: string, from: string, to: string, cols = "ttc, num_fiscal",
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let all: any[] = [];
  let offset = 0;
  while (true) {
    const { data } = await supabase
      .from("ventes_lignes").select(cols)
      .eq("etablissement_id", etabId).gte("date_service", from)
      .lte("date_service", to).eq("type_ligne", "Produit")
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < 1000) break;
    offset += 1000;
  }
  return all;
}

function GroupContent() {
  const { etablissements, setGroupView, setCurrent } = useEtablissement();
  const [period, setPeriod] = useState<Period>("mois");

  const todayStr = useMemo(
    () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date()),
    [],
  );

  const [referenceDate, setReferenceDate] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: lastRow } = await supabase
        .from("ventes_lignes").select("date_service")
        .eq("type_ligne", "Produit").order("date_service", { ascending: false }).limit(1);
      if (lastRow && lastRow.length > 0 && lastRow[0].date_service) {
        setReferenceDate(lastRow[0].date_service);
      } else {
        setReferenceDate(todayStr);
      }
    })();
  }, [todayStr]);

  const today = referenceDate ?? todayStr;

  const range = useMemo(() => getPeriodRange(period, today), [period, today]);
  const prevRange = useMemo(() => getPreviousPeriodRange(period, today), [period, today]);
  const a1Range = useMemo(() => getA1Range(period, today), [period, today]);
  const fiscalStart = useMemo(() => getFiscalYearStart(today), [today]);

  const isCurrentPeriod = useMemo(() => {
    return getPeriodRange(period, todayStr).start === getPeriodRange(period, today).start;
  }, [period, todayStr, today]);

  const [etabData, setEtabData] = useState<Record<string, EtabKpis>>({});
  const [dailyCa, setDailyCa] = useState<{ date: string; total: number; byEtab: Record<string, number> }[]>([]);
  const [mixCats, setMixCats] = useState<{ cat: string; ca: number }[]>([]);
  const [caExercice, setCaExercice] = useState(0);
  const [achatsMonth, setAchatsMonth] = useState(0);
  const [topFournisseurs, setTopFournisseurs] = useState<SupplierTotal[]>([]);
  const [tresoBalance, setTresoBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const chartRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstance = useRef<Chart | null>(null);

  useEffect(() => { setGroupView(true); }, [setGroupView]);

  const fetchData = useCallback(async () => {
    if (etablissements.length === 0) return;
    setLoading(true);

    const etabIds = etablissements.map((e) => e.id);

    const caPromises = etablissements.map(async (etab) => {
      const rows = await fetchAllVentesRows(etab.id, range.start, range.end);
      const ca = rows.reduce((s, r) => s + (Number(r.ttc) || 0), 0);
      const couverts = new Set(rows.map((r) => r.num_fiscal).filter(Boolean)).size;
      return { id: etab.id, ca, couverts };
    });

    const caPrevPromises = etablissements.map(async (etab) => {
      const rows = await fetchAllVentesRows(etab.id, prevRange.start, prevRange.end);
      const ca = rows.reduce((s, r) => s + (Number(r.ttc) || 0), 0);
      const couverts = new Set(rows.map((r) => r.num_fiscal).filter(Boolean)).size;
      return { id: etab.id, ca, couverts };
    });

    const caA1Promises = etablissements.map(async (etab) => {
      const rows = await fetchAllVentesRows(etab.id, a1Range.start, a1Range.end);
      const ca = rows.reduce((s, r) => s + (Number(r.ttc) || 0), 0);
      const couverts = new Set(rows.map((r) => r.num_fiscal).filter(Boolean)).size;
      return { id: etab.id, ca, couverts };
    });

    const dailyPromise = (async () => {
      const byDate: Record<string, Record<string, number>> = {};
      const cats: Record<string, number> = {};
      for (const etab of etablissements) {
        const rows = await fetchAllVentesRows(etab.id, range.start, range.end, "ttc, date_service, categorie");
        for (const r of rows) {
          const d = String(r.date_service);
          if (!byDate[d]) byDate[d] = {};
          byDate[d][etab.id] = (byDate[d][etab.id] ?? 0) + (Number(r.ttc) || 0);
          const cat = String(r.categorie || "Autre");
          cats[cat] = (cats[cat] ?? 0) + (Number(r.ttc) || 0);
        }
      }
      const daily = Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b))
        .map(([date, etabs]) => ({ date, total: Object.values(etabs).reduce((s, v) => s + v, 0), byEtab: etabs }));
      const mix = Object.entries(cats).sort(([, a], [, b]) => b - a).slice(0, 10).map(([cat, ca]) => ({ cat, ca }));
      return { daily, mix };
    })();

    const fyPromise = (async () => {
      let total = 0;
      for (const etab of etablissements) {
        const rows = await fetchAllVentesRows(etab.id, fiscalStart, today, "ttc");
        total += rows.reduce((s, r) => s + (Number(r.ttc) || 0), 0);
      }
      return total;
    })();

    const achatsPromise = (async () => {
      const monthStart = getFirstOfMonth(today);
      const { data } = await supabase.from("supplier_invoices")
        .select("total_ht, supplier_id, suppliers(name)")
        .gte("invoice_date", monthStart).lte("invoice_date", today).in("etablissement_id", etabIds);
      const rows = (data ?? []) as unknown as { total_ht: number | null; supplier_id: string; suppliers: { name: string } | null }[];
      const total = rows.reduce((s, r) => s + (r.total_ht ?? 0), 0);
      const bySupplier: Record<string, { name: string; total: number }> = {};
      for (const r of rows) {
        const name = r.suppliers?.name ?? "Inconnu";
        const key = name.toLowerCase().trim();
        if (!bySupplier[key]) bySupplier[key] = { name, total: 0 };
        bySupplier[key].total += r.total_ht ?? 0;
      }
      const top3 = Object.values(bySupplier).sort((a, b) => b.total - a.total).slice(0, 3);
      return { total, top3 };
    })();

    const tresoPromise = (async () => {
      const monthStart = getFirstOfMonth(today);
      const { data, error } = await supabase.from("bank_operations")
        .select("amount").gte("operation_date", monthStart).lte("operation_date", today).in("etablissement_id", etabIds);
      if (error || !data || data.length === 0) return null;
      return (data as { amount: number }[]).reduce((s, r) => s + (r.amount ?? 0), 0);
    })();

    const [caResults, caPrevResults, caA1Results, dailyResult, fy, achats, treso] = await Promise.all([
      Promise.all(caPromises), Promise.all(caPrevPromises), Promise.all(caA1Promises),
      dailyPromise, fyPromise, achatsPromise, tresoPromise,
    ]);

    const result: Record<string, EtabKpis> = {};
    for (const cur of caResults) {
      const prev = caPrevResults.find((p) => p.id === cur.id);
      const a1 = caA1Results.find((p) => p.id === cur.id);
      result[cur.id] = {
        ca: cur.ca, caPrev: prev?.ca ?? 0, caA1: a1?.ca ?? 0,
        couverts: cur.couverts, couvertsPrev: prev?.couverts ?? 0, couvertsA1: a1?.couverts ?? 0,
      };
    }
    setEtabData(result);
    setDailyCa(dailyResult.daily);
    setMixCats(dailyResult.mix);
    setCaExercice(fy);
    setAchatsMonth(achats.total);
    setTopFournisseurs(achats.top3);
    setTresoBalance(treso);
    setLoading(false);
  }, [etablissements, range, prevRange, a1Range, fiscalStart, today]);

  useEffect(() => { fetchData(); }, [fetchData]); // eslint-disable-line react-hooks/set-state-in-effect

  // Draw chart
  useEffect(() => {
    if (!chartRef.current || dailyCa.length === 0) return;
    if (chartInstance.current) chartInstance.current.destroy();

    const etabIds = etablissements.map(e => e.id);
    const etabColors: Record<string, string> = {};
    for (const e of etablissements) etabColors[e.id] = e.slug?.includes("bello") ? T.belloMio : T.piccolaMia;

    const labels = dailyCa.map(d => {
      const dt = new Date(d.date + "T12:00:00");
      return dt.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" });
    });

    const datasets = etabIds.map(id => ({
      label: etablissements.find(e => e.id === id)?.nom ?? "",
      data: dailyCa.map(d => Math.round(d.byEtab[id] ?? 0)),
      backgroundColor: etabColors[id] + "CC",
      borderRadius: 6,
    }));

    chartInstance.current = new Chart(chartRef.current, {
      type: "bar",
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: etabIds.length > 1, position: "top", labels: { boxWidth: 10, font: { size: 11, family: DM_SANS } } },
          tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${(ctx.parsed.y ?? 0).toLocaleString("fr-FR")} \u20AC` } },
        },
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { font: { size: 10, family: DM_SANS } } },
          y: { stacked: true, grid: { color: "rgba(0,0,0,0.04)" }, ticks: { font: { size: 10, family: DM_SANS }, callback: (v) => `${Number(v).toLocaleString("fr-FR")}` } },
        },
      },
    });
    return () => { chartInstance.current?.destroy(); chartInstance.current = null; };
  }, [dailyCa, etablissements]);

  // Derived totals
  const totalCa = Object.values(etabData).reduce((s, d) => s + d.ca, 0);
  const totalCaPrev = Object.values(etabData).reduce((s, d) => s + d.caPrev, 0);
  const totalCaA1 = Object.values(etabData).reduce((s, d) => s + d.caA1, 0);
  const totalCouverts = Object.values(etabData).reduce((s, d) => s + d.couverts, 0);
  const totalCouvertsPrev = Object.values(etabData).reduce((s, d) => s + d.couvertsPrev, 0);
  const totalCouvertsA1 = Object.values(etabData).reduce((s, d) => s + d.couvertsA1, 0);
  const ticketMoyen = totalCouverts > 0 ? totalCa / totalCouverts : 0;
  const ticketMoyenPrev = totalCouvertsPrev > 0 ? totalCaPrev / totalCouvertsPrev : 0;
  const foodCostRatio = totalCa > 0 ? (achatsMonth / totalCa) * 100 : 0;

  const periodLabel = period === "semaine" ? "semaine" : period === "mois" ? "mois" : "exercice";
  const prevLabel = period === "semaine" ? "sem. prec." : period === "mois" ? "mois prec." : "exercice prec.";

  return (
    <div className="dashboard-page" style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 32px 60px", fontFamily: DM_SANS }}>

      {/* ── Hero + Period controls ── */}
      <div style={{
        display: "flex", alignItems: "flex-end", justifyContent: "space-between",
        marginBottom: 28, gap: 20, flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-ifratelli.png" alt="" width={64} height={64} style={{ objectFit: "contain", flexShrink: 0 }} />
          <div>
            <div style={{
              fontSize: 11, fontWeight: 600, textTransform: "uppercase",
              letterSpacing: 1.5, color: GROUP_COLOR, marginBottom: 4,
            }}>
              Vue groupe
            </div>
            <h1 style={{
              fontFamily: OSWALD, fontSize: 32, fontWeight: 700,
              textTransform: "uppercase", letterSpacing: 1,
              color: T.dark, margin: 0, lineHeight: 1.1,
            }}>
              iFratelli Group
            </h1>
            <div style={{ fontSize: 13, color: T.muted, marginTop: 6, fontWeight: 500 }}>
              {periodDisplayLabel(period, today)}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Period selector */}
          <div style={{
            ...CARD,
            display: "flex", overflow: "hidden",
            padding: 0, borderRadius: 10,
          }}>
            {(["semaine", "mois", "exercice"] as Period[]).map((p) => (
              <button key={p} onClick={() => setPeriod(p)} style={{
                padding: "8px 16px", border: "none",
                background: period === p ? GROUP_COLOR : "transparent",
                color: period === p ? "#fff" : T.dark,
                fontWeight: 600, fontSize: 11, textTransform: "uppercase",
                letterSpacing: "0.05em", cursor: "pointer", fontFamily: OSWALD,
                transition: "all 0.15s",
              }}>
                {p === "exercice" ? "Exercice" : p === "semaine" ? "Semaine" : "Mois"}
              </button>
            ))}
          </div>

          {/* Date navigation */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <NavBtn onClick={() => setReferenceDate(shiftDate(today, period, -1))} label="Precedent">
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
            </NavBtn>
            <NavBtn onClick={() => setReferenceDate(shiftDate(today, period, 1))} label="Suivant">
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 6 15 12 9 18" /></svg>
            </NavBtn>
            {!isCurrentPeriod && (
              <button onClick={() => setReferenceDate(todayStr)} style={{
                ...CARD, padding: "7px 14px", border: "none",
                background: GROUP_COLOR, color: "#fff",
                fontSize: 11, fontWeight: 700, cursor: "pointer",
                fontFamily: OSWALD, letterSpacing: "0.04em", borderRadius: 8,
              }}>
                Aujourd&apos;hui
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── KPIs row ── */}
      <div className="kpi-grid" style={{
        display: "grid",
        gap: 12, marginBottom: 28,
      }}>
        <KpiCard
          label={`CA TTC ${periodLabel}`}
          value={`${fmtEur(totalCa)} \u20AC`}
          accent={GROUP_COLOR}
          delta={totalCaPrev > 0 ? ((totalCa - totalCaPrev) / totalCaPrev) * 100 : null}
          deltaLabel={prevLabel}
          deltaA1={totalCaA1 > 0 ? ((totalCa - totalCaA1) / totalCaA1) * 100 : null}
          loading={loading}
        />
        <KpiCard
          label={`Couverts ${periodLabel}`}
          value={String(totalCouverts)}
          accent={T.dark}
          delta={totalCouvertsPrev > 0 ? ((totalCouverts - totalCouvertsPrev) / totalCouvertsPrev) * 100 : null}
          deltaLabel={prevLabel}
          deltaA1={totalCouvertsA1 > 0 ? ((totalCouverts - totalCouvertsA1) / totalCouvertsA1) * 100 : null}
          loading={loading}
        />
        <KpiCard
          label="Ticket moyen"
          value={`${ticketMoyen.toFixed(1).replace(".", ",")} \u20AC`}
          accent={T.dore}
          delta={ticketMoyenPrev > 0 ? ((ticketMoyen - ticketMoyenPrev) / ticketMoyenPrev) * 100 : null}
          deltaLabel={prevLabel}
          deltaA1={totalCouvertsA1 > 0 ? (() => { const tmA1 = totalCaA1 / totalCouvertsA1; return tmA1 > 0 ? ((ticketMoyen - tmA1) / tmA1) * 100 : null; })() : null}
          loading={loading}
        />
        <KpiCard
          label="CA Exercice"
          value={`${fmtEur(caExercice)} \u20AC`}
          accent={GROUP_COLOR}
          delta={null} deltaLabel=""
          loading={loading}
          subtitle={`depuis oct. ${getFiscalYearStart(today).slice(0, 4)}`}
        />
      </div>

      {/* ── Main content: 2 columns ── */}
      <div className="dashboard-grid" style={{
        display: "grid",
        gap: 20, marginBottom: 28, alignItems: "start",
      }}>
        {/* Left: Chart + Etabs */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* CA chart */}
          {dailyCa.length > 0 && (
            <div style={{ ...CARD, padding: "20px 22px" }}>
              <SectionTitle>CA par jour</SectionTitle>
              <div style={{ marginTop: 12 }}>
                <canvas ref={chartRef} height={220} />
              </div>
            </div>
          )}

          {/* Par etablissement */}
          <div>
            <SectionTitle style={{ marginBottom: 12 }}>Par etablissement</SectionTitle>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
              {etablissements.map((etab) => {
                const d = etabData[etab.id] ?? { ca: 0, caPrev: 0, caA1: 0, couverts: 0, couvertsPrev: 0, couvertsA1: 0 };
                const ticket = d.couverts > 0 ? d.ca / d.couverts : 0;
                const delta = d.caPrev > 0 ? Math.round(((d.ca - d.caPrev) / d.caPrev) * 100) : null;
                const deltaA1 = d.caA1 > 0 ? Math.round(((d.ca - d.caA1) / d.caA1) * 100) : null;
                const color = etab.slug?.includes("bello") ? T.belloMio : T.piccolaMia;
                const ventesHref = `/ventes?from=${range.start}&to=${range.end}`;

                return (
                  <Link key={etab.id} href={ventesHref} onClick={() => {
                    const target = etablissements.find(e => e.id === etab.id);
                    if (target) { setCurrent(target); setGroupView(false); }
                  }} style={{ textDecoration: "none" }}>
                    <div className="hover-lift" style={{
                      ...CARD, padding: "18px 20px",
                      borderLeft: `4px solid ${color}`,
                      transition: "box-shadow 0.2s, transform 0.2s",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: 10,
                          background: `${color}18`, color,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontFamily: OSWALD, fontWeight: 700, fontSize: 14,
                        }}>
                          {etab.nom.charAt(0)}
                        </div>
                        <span style={{ fontFamily: OSWALD, fontSize: 16, fontWeight: 700, color: T.dark, textTransform: "uppercase" }}>
                          {etab.nom}
                        </span>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                        <MiniStat label={`CA ${periodLabel}`} value={`${fmtEur(d.ca)}\u00A0\u20AC`} accent={color} />
                        <MiniStat label="Couverts" value={String(d.couverts)} accent={T.dark} />
                        <MiniStat label="Ticket moy." value={`${ticket.toFixed(1).replace(".", ",")}\u00A0\u20AC`} accent={T.dark} />
                      </div>
                      <div style={{ display: "flex", gap: 12, marginTop: 10 }}>
                        {delta != null && (
                          <span style={{ fontSize: 11, fontWeight: 600, color: delta >= 0 ? T.sauge : "#DC2626" }}>
                            {delta > 0 ? "+" : ""}{delta}% vs {prevLabel}
                          </span>
                        )}
                        {deltaA1 != null && (
                          <span style={{ fontSize: 11, fontWeight: 600, color: deltaA1 >= 0 ? T.sauge : "#DC2626" }}>
                            {deltaA1 > 0 ? "+" : ""}{deltaA1}% vs A-1
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right sidebar */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Pilotage KPIs */}
          <div style={{ ...CARD, padding: "18px 20px" }}>
            <SectionTitle>Pilotage</SectionTitle>
            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 12 }}>
              <PilotRow
                label="Marge globale"
                value={totalCa > 0 ? `${fmtEur(totalCa - achatsMonth)} \u20AC` : "-"}
                sub={totalCa > 0 ? `${fmtPct(100 - foodCostRatio)}%` : undefined}
                accent={T.sauge}
              />
              <PilotRow label="Masse salariale" value="A configurer" accent={T.bleu} muted />
              <PilotRow
                label="Tresorerie"
                value={tresoBalance != null ? `${fmtEur(tresoBalance)} \u20AC` : "Importer un releve"}
                accent={T.dore}
                muted={tresoBalance == null}
              />
            </div>
          </div>

          {/* Achats du mois */}
          <div style={{ ...CARD, padding: "18px 20px" }}>
            <SectionTitle>Achats du mois</SectionTitle>
            <div style={{ marginTop: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: T.muted }}>Total HT</span>
                <span style={{ fontFamily: OSWALD, fontSize: 22, fontWeight: 700, color: T.sauge }}>{fmtEur(achatsMonth)} {"\u20AC"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <span style={{ fontSize: 12, color: T.muted }}>Food cost</span>
                <span style={{
                  fontFamily: OSWALD, fontSize: 15, fontWeight: 700,
                  color: foodCostRatio > 35 ? "#DC2626" : T.dark,
                  background: foodCostRatio > 35 ? "rgba(220,38,38,0.08)" : "rgba(0,0,0,0.04)",
                  padding: "2px 10px", borderRadius: 6,
                }}>
                  {totalCa > 0 ? `${fmtPct(foodCostRatio)}%` : "-"}
                </span>
              </div>
              {topFournisseurs.length > 0 && (
                <>
                  <div style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
                    color: T.muted, marginBottom: 8, paddingTop: 10,
                    borderTop: "1px solid rgba(0,0,0,0.06)",
                  }}>
                    Top fournisseurs
                  </div>
                  {topFournisseurs.map((f, i) => (
                    <div key={i} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "5px 0", borderBottom: i < topFournisseurs.length - 1 ? "1px solid rgba(0,0,0,0.04)" : "none",
                    }}>
                      <span style={{ fontSize: 13, color: T.dark }}>{f.name}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, fontFamily: OSWALD, color: T.dark }}>{fmtEur(f.total)} {"\u20AC"}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>

          {/* Mix categories */}
          {mixCats.length > 0 && (
            <div style={{ ...CARD, padding: "18px 20px" }}>
              <SectionTitle>Mix categories</SectionTitle>
              <div style={{ marginTop: 10 }}>
                {mixCats.map((m, i) => {
                  const pct = totalCa > 0 ? (m.ca / totalCa) * 100 : 0;
                  return (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "5px 0", borderBottom: i < mixCats.length - 1 ? "1px solid rgba(0,0,0,0.04)" : "none",
                    }}>
                      <span style={{ flex: 1, fontSize: 12, color: T.dark }}>{m.cat}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, fontFamily: OSWALD, color: T.dark, minWidth: 65, textAlign: "right" }}>
                        {fmtEur(m.ca)} {"\u20AC"}
                      </span>
                      <span style={{ fontSize: 11, color: T.muted, minWidth: 40, textAlign: "right" }}>{fmtPct(pct)}%</span>
                      <div style={{ width: 50, height: 5, background: "rgba(0,0,0,0.05)", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: GROUP_COLOR, borderRadius: 3 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Raccourcis ── */}
      <SectionTitle style={{ marginBottom: 12 }}>Acces rapide</SectionTitle>
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
        gap: 10, marginBottom: 28,
      }}>
        {SHORTCUTS.map((s) => (
          <Link key={s.href} href={s.href} style={{ textDecoration: "none" }}>
            <div className="hover-lift" style={{
              ...CARD, padding: "16px 18px",
              display: "flex", alignItems: "center", gap: 12,
              transition: "box-shadow 0.2s, transform 0.2s",
              cursor: "pointer",
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: `${s.color}12`, color: s.color,
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>
                {s.icon}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.dark }}>{s.label}</div>
                {s.sub && <div style={{ fontSize: 10, color: T.muted, marginTop: 1 }}>{s.sub}</div>}
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Hover lift CSS */}
      <style>{`
        .hover-lift:hover {
          box-shadow: 0 2px 8px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.06) !important;
          transform: translateY(-1px);
        }
        .kpi-grid { grid-template-columns: repeat(4, 1fr); }
        .dashboard-grid { grid-template-columns: 1fr 380px; }
        @media (max-width: 767px) {
          .dashboard-page { padding: 16px 14px 100px !important; }
          .kpi-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .dashboard-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   Sub-components
   ══════════════════════════════════════════════════════════ */

const SHORTCUTS = [
  { href: "/ventes", label: "Rapport de vente", color: GROUP_COLOR, icon: <SvgBarChart />, sub: "Pilotage" },
  { href: "/ventes/marges", label: "Marges produits", color: T.dore, icon: <SvgTag />, sub: "Pilotage" },
  { href: "/tresorerie", label: "Tresorerie", color: T.dore, icon: <SvgWallet />, sub: "Pilotage" },
  { href: "/rh/equipe", label: "Employes", color: T.bleu, icon: <SvgUsers />, sub: "Personnel" },
  { href: "/recettes", label: "Fiches techniques", color: T.terracotta, icon: <SvgBook /> , sub: "Production" },
  { href: "/commandes", label: "Commandes", color: T.sauge, icon: <SvgTruck />, sub: "Achats" },
  { href: "/achats", label: "Factures", color: T.sauge, icon: <SvgFileText />, sub: "Achats" },
  { href: "/evenements", label: "Evenements", color: T.violet, icon: <SvgHeart />, sub: "Piccola Mia" },
];

function SvgBarChart() {
  return <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="12" width="4" height="9" rx="1" /><rect x="10" y="7" width="4" height="14" rx="1" /><rect x="17" y="3" width="4" height="18" rx="1" /></svg>;
}
function SvgTag() {
  return <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>;
}
function SvgWallet() {
  return <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="5" width="20" height="16" rx="2" /><path d="M2 10h20" /><path d="M16 15h2" /></svg>;
}
function SvgUsers() {
  return <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
}
function SvgBook() {
  return <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>;
}
function SvgTruck() {
  return <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="1" y="3" width="15" height="13" rx="1" /><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></svg>;
}
function SvgFileText() {
  return <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>;
}
function SvgHeart() {
  return <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>;
}

function SectionTitle({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
      textTransform: "uppercase", color: T.muted, ...style,
    }}>
      {children}
    </div>
  );
}

function NavBtn({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} style={{
      ...CARD, width: 34, height: 34, padding: 0,
      border: "none", cursor: "pointer",
      display: "flex", alignItems: "center", justifyContent: "center",
      color: T.dark, borderRadius: 8,
    }}>
      {children}
    </button>
  );
}

function KpiCard({
  label, value, accent, delta, deltaLabel, deltaA1, loading, subtitle,
}: {
  label: string; value: string; accent: string;
  delta: number | null; deltaLabel: string; deltaA1?: number | null;
  loading: boolean; subtitle?: string;
}) {
  return (
    <div style={{ ...CARD, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.muted }}>
        {label}
      </span>
      <span style={{
        fontSize: 28, fontWeight: 700, color: accent,
        fontFamily: OSWALD, lineHeight: 1.15, marginTop: 6,
        opacity: loading ? 0.4 : 1, transition: "opacity 0.2s",
      }}>
        {value}
      </span>
      {subtitle && <span style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{subtitle}</span>}
      {delta != null && (
        <span style={{ fontSize: 11, fontWeight: 600, color: delta >= 0 ? T.sauge : "#DC2626", marginTop: 4 }}>
          {delta > 0 ? "+" : ""}{Math.round(delta)}% vs {deltaLabel}
        </span>
      )}
      {deltaA1 != null && (
        <span style={{ fontSize: 11, fontWeight: 600, color: deltaA1 >= 0 ? T.sauge : "#DC2626", marginTop: 1 }}>
          {deltaA1 > 0 ? "+" : ""}{Math.round(deltaA1)}% vs A-1
        </span>
      )}
    </div>
  );
}

function MiniStat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div>
      <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: T.muted, marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: accent, fontFamily: OSWALD }}>
        {value}
      </div>
    </div>
  );
}

function PilotRow({
  label, value, sub, accent, muted: isMuted,
}: {
  label: string; value: string; sub?: string; accent: string; muted?: boolean;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "10px 14px", borderRadius: 10,
      background: isMuted ? "rgba(0,0,0,0.02)" : `${accent}08`,
      border: `1px solid ${isMuted ? "rgba(0,0,0,0.04)" : `${accent}15`}`,
    }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: isMuted ? T.muted : T.dark }}>{label}</span>
      <div style={{ textAlign: "right" }}>
        <div style={{
          fontSize: isMuted ? 12 : 16, fontWeight: 700, fontFamily: isMuted ? DM_SANS : OSWALD,
          color: isMuted ? T.muted : accent,
        }}>
          {value}
        </div>
        {sub && <div style={{ fontSize: 10, color: T.muted }}>{sub}</div>}
      </div>
    </div>
  );
}
