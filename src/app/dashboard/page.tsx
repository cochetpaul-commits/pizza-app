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

/** Fiscal year starts Oct 1. Returns YYYY-MM-DD of the fiscal year start for a given date. */
function getFiscalYearStart(dateStr: string): string {
  const y = parseInt(dateStr.slice(0, 4));
  const m = parseInt(dateStr.slice(5, 7));
  const fiscalYear = m >= 10 ? y : y - 1;
  return `${fiscalYear}-10-01`;
}

/** Navigate a date by period offset (+1 or -1) */
function shiftDate(ref: string, period: Period, delta: number): string {
  const d = new Date(ref + "T00:00:00");
  if (period === "semaine") {
    d.setDate(d.getDate() + delta * 7);
  } else if (period === "mois") {
    d.setMonth(d.getMonth() + delta);
  } else {
    d.setFullYear(d.getFullYear() + delta);
  }
  return d.toISOString().slice(0, 10);
}

/** Previous period boundaries based on period type */
function getPreviousPeriodRange(
  period: Period,
  ref: string,
): { start: string; end: string } {
  const prevRef = shiftDate(ref, period, -1);
  return getPeriodRange(period, prevRef);
}

/** Same period one year ago */
function getA1Range(period: Period, ref: string): { start: string; end: string } {
  const y = parseInt(ref.slice(0, 4));
  const a1Ref = `${y - 1}${ref.slice(4)}`;
  return getPeriodRange(period, a1Ref);
}

function getPeriodRange(period: Period, ref: string): { start: string; end: string } {
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
  ca: number;
  caPrev: number;
  caA1: number;
  couverts: number;
  couvertsPrev: number;
  couvertsA1: number;
};

type SupplierTotal = { name: string; total: number };

export default function GroupDashboard() {
  return (
    <RequireRole allowedRoles={["group_admin", "equipier"]}>
      <GroupContent />
    </RequireRole>
  );
}

/** Human-readable period label */
function periodDisplayLabel(period: Period, ref: string): string {
  const MONTHS = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
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
    if (d1.getMonth() === d2.getMonth()) {
      return `Sem. du ${day1} au ${day2} ${month1} ${year2}`;
    }
    return `Sem. du ${day1} ${month1} au ${day2} ${month2} ${year2}`;
  }
  if (period === "mois") {
    const m = parseInt(ref.slice(5, 7));
    const y = parseInt(ref.slice(0, 4));
    return `${MONTHS[m - 1].charAt(0).toUpperCase() + MONTHS[m - 1].slice(1)} ${y}`;
  }
  // exercice
  const fyStart = getFiscalYearStart(ref);
  const fyY = parseInt(fyStart.slice(0, 4));
  return `Oct ${fyY} — Sep ${fyY + 1}`;
}

async function fetchAllVentesRows(
  etabId: string,
  from: string,
  to: string,
  cols = "ttc, num_fiscal",
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let all: any[] = [];
  let offset = 0;
  while (true) {
    const { data } = await supabase
      .from("ventes_lignes")
      .select(cols)
      .eq("etablissement_id", etabId)
      .gte("date_service", from)
      .lte("date_service", to)
      .eq("type_ligne", "Produit")
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

  // Reference date: default will be set to last day with data
  const [referenceDate, setReferenceDate] = useState<string | null>(null);

  // Fetch last day with data
  useEffect(() => {
    (async () => {
      const { data: lastRow } = await supabase
        .from("ventes_lignes")
        .select("date_service")
        .eq("type_ligne", "Produit")
        .order("date_service", { ascending: false })
        .limit(1);
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

  // Set group view
  useEffect(() => {
    setGroupView(true);
  }, [setGroupView]);

  // Fetch all data in parallel
  const fetchData = useCallback(async () => {
    if (etablissements.length === 0) return;
    setLoading(true);

    const etabIds = etablissements.map((e) => e.id);

    // 1. CA for current period per etab (paginated to avoid 1000-row limit)
    const caPromises = etablissements.map(async (etab) => {
      const rows = await fetchAllVentesRows(etab.id, range.start, range.end);
      const ca = rows.reduce((s, r) => s + (Number(r.ttc) || 0), 0);
      const couverts = new Set(rows.map((r) => r.num_fiscal).filter(Boolean)).size;
      return { id: etab.id, ca, couverts };
    });

    // 2. CA for previous period per etab
    const caPrevPromises = etablissements.map(async (etab) => {
      const rows = await fetchAllVentesRows(etab.id, prevRange.start, prevRange.end);
      const ca = rows.reduce((s, r) => s + (Number(r.ttc) || 0), 0);
      const couverts = new Set(rows.map((r) => r.num_fiscal).filter(Boolean)).size;
      return { id: etab.id, ca, couverts };
    });

    // 2b. CA for same period A-1 (year ago)
    const caA1Promises = etablissements.map(async (etab) => {
      const rows = await fetchAllVentesRows(etab.id, a1Range.start, a1Range.end);
      const ca = rows.reduce((s, r) => s + (Number(r.ttc) || 0), 0);
      const couverts = new Set(rows.map((r) => r.num_fiscal).filter(Boolean)).size;
      return { id: etab.id, ca, couverts };
    });

    // 2c. Daily CA breakdown for chart + mix categories
    const dailyPromise = (async () => {
      const byDate: Record<string, Record<string, number>> = {};
      const mixCats: Record<string, number> = {};
      for (const etab of etablissements) {
        const rows = await fetchAllVentesRows(etab.id, range.start, range.end, "ttc, date_service, categorie");
        for (const r of rows) {
          const d = String(r.date_service);
          if (!byDate[d]) byDate[d] = {};
          byDate[d][etab.id] = (byDate[d][etab.id] ?? 0) + (Number(r.ttc) || 0);
          const cat = String(r.categorie || "Autre");
          mixCats[cat] = (mixCats[cat] ?? 0) + (Number(r.ttc) || 0);
        }
      }
      const daily = Object.entries(byDate)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, etabs]) => ({
          date,
          total: Object.values(etabs).reduce((s, v) => s + v, 0),
          byEtab: etabs,
        }));
      const mix = Object.entries(mixCats)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([cat, ca]) => ({ cat, ca }));
      return { daily, mix };
    })();

    // 3. CA exercice (cumulative fiscal year)
    const fyPromise = (async () => {
      let total = 0;
      for (const etab of etablissements) {
        const rows = await fetchAllVentesRows(etab.id, fiscalStart, today, "ttc");
        total += rows.reduce((s, r) => s + (Number(r.ttc) || 0), 0);
      }
      return total;
    })();

    // 4. Achats du mois (supplier_invoices)
    const achatsPromise = (async () => {
      const monthStart = getFirstOfMonth(today);
      const { data } = await supabase
        .from("supplier_invoices")
        .select("total_ht, supplier_id, suppliers(name)")
        .gte("invoice_date", monthStart)
        .lte("invoice_date", today)
        .in("etablissement_id", etabIds);
      const rows = (data ?? []) as unknown as {
        total_ht: number | null;
        supplier_id: string;
        suppliers: { name: string } | null;
      }[];
      const total = rows.reduce((s, r) => s + (r.total_ht ?? 0), 0);

      // Top 3 fournisseurs
      const bySupplier: Record<string, { name: string; total: number }> = {};
      for (const r of rows) {
        const name = r.suppliers?.name ?? "Inconnu";
        const key = name.toLowerCase().trim();
        if (!bySupplier[key]) bySupplier[key] = { name, total: 0 };
        bySupplier[key].total += r.total_ht ?? 0;
      }
      const top3 = Object.values(bySupplier)
        .sort((a, b) => b.total - a.total)
        .slice(0, 3);

      return { total, top3 };
    })();

    // 5. Tresorerie balance
    const tresoPromise = (async () => {
      const monthStart = getFirstOfMonth(today);
      const { data, error } = await supabase
        .from("bank_operations")
        .select("amount")
        .gte("operation_date", monthStart)
        .lte("operation_date", today)
        .in("etablissement_id", etabIds);
      if (error || !data || data.length === 0) return null;
      return (data as { amount: number }[]).reduce((s, r) => s + (r.amount ?? 0), 0);
    })();

    // Execute all in parallel
    const [caResults, caPrevResults, caA1Results, dailyResult, fy, achats, treso] = await Promise.all([
      Promise.all(caPromises),
      Promise.all(caPrevPromises),
      Promise.all(caA1Promises),
      dailyPromise,
      fyPromise,
      achatsPromise,
      tresoPromise,
    ]);

    // Build etab data
    const result: Record<string, EtabKpis> = {};
    for (const cur of caResults) {
      const prev = caPrevResults.find((p) => p.id === cur.id);
      const a1 = caA1Results.find((p) => p.id === cur.id);
      result[cur.id] = {
        ca: cur.ca,
        caPrev: prev?.ca ?? 0,
        caA1: a1?.ca ?? 0,
        couverts: cur.couverts,
        couvertsPrev: prev?.couverts ?? 0,
        couvertsA1: a1?.couverts ?? 0,
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

  useEffect(() => {
    fetchData(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [fetchData]);

  // Draw chart
  useEffect(() => {
    if (!chartRef.current || dailyCa.length === 0) return;
    if (chartInstance.current) chartInstance.current.destroy();

    const etabIds = etablissements.map(e => e.id);
    const etabColors: Record<string, string> = {};
    for (const e of etablissements) {
      etabColors[e.id] = e.slug?.includes("bello") ? T.belloMio : T.piccolaMia;
    }

    const labels = dailyCa.map(d => {
      const dt = new Date(d.date + "T12:00:00");
      return dt.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" });
    });

    const datasets = etabIds.map(id => ({
      label: etablissements.find(e => e.id === id)?.nom ?? "",
      data: dailyCa.map(d => Math.round(d.byEtab[id] ?? 0)),
      backgroundColor: etabColors[id] + "CC",
      borderRadius: 4,
    }));

    chartInstance.current = new Chart(chartRef.current, {
      type: "bar",
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: etabIds.length > 1, position: "top", labels: { boxWidth: 10, font: { size: 11 } } },
          tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${(ctx.parsed.y ?? 0).toLocaleString("fr-FR")} \u20AC` } },
        },
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { font: { size: 10 } } },
          y: { stacked: true, grid: { color: "#f0ebe2" }, ticks: { font: { size: 10 }, callback: (v) => `${Number(v).toLocaleString("fr-FR")}` } },
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
  const margeGlobale = totalCa > 0 ? totalCa - achatsMonth : 0;
  const foodCostRatio = totalCa > 0 ? (achatsMonth / totalCa) * 100 : 0;

  const periodLabel = period === "semaine" ? "semaine" : period === "mois" ? "mois" : "exercice";
  const prevLabel =
    period === "semaine"
      ? "sem. prec."
      : period === "mois"
        ? "mois prec."
        : "exercice prec.";

  const _dateDisplay = new Date(today + "T12:00:00").toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "16px 24px 40px" }}>
      {/* ── Hero header ── */}
      <div
        style={{
          background: `linear-gradient(135deg, ${GROUP_COLOR} 0%, ${GROUP_COLOR}DD 100%)`,
          borderRadius: 16,
          padding: "24px 20px 20px",
          marginBottom: 20,
          color: "#fff",
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: 1.5,
            opacity: 0.7,
            marginBottom: 4,
          }}
        >
          Vue groupe
        </div>
        <div
          style={{
            fontFamily: OSWALD,
            fontSize: 28,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: 1,
          }}
        >
          iFratelli Group
        </div>
        <div style={{ fontSize: 13, opacity: 0.9, marginTop: 6, fontWeight: 600 }}>
          {periodDisplayLabel(period, today)}
        </div>
      </div>

      {/* ── Period selector ── */}
      <div
        style={{
          display: "flex",
          gap: 0,
          marginBottom: 10,
          borderRadius: 10,
          overflow: "hidden",
          border: `1px solid ${T.border}`,
        }}
      >
        {(["semaine", "mois", "exercice"] as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            style={{
              flex: 1,
              padding: "10px 0",
              border: "none",
              background: period === p ? GROUP_COLOR : T.white,
              color: period === p ? "#fff" : T.dark,
              fontWeight: 700,
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              cursor: "pointer",
              fontFamily: OSWALD,
              transition: "all 0.15s",
            }}
          >
            {p === "exercice" ? "Exercice" : p === "semaine" ? "Semaine" : "Mois"}
          </button>
        ))}
      </div>

      {/* ── Date navigation ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          marginBottom: 18,
        }}
      >
        <button
          onClick={() => setReferenceDate(shiftDate(today, period, -1))}
          style={{
            background: "none",
            border: `1px solid ${T.border}`,
            borderRadius: 8,
            width: 34,
            height: 34,
            cursor: "pointer",
            fontSize: 16,
            color: T.dark,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          aria-label="Période précédente"
        >
          &#8592;
        </button>
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: T.dark,
            textAlign: "center",
            minWidth: 180,
          }}
        >
          {periodDisplayLabel(period, today)}
        </span>
        <button
          onClick={() => setReferenceDate(shiftDate(today, period, 1))}
          style={{
            background: "none",
            border: `1px solid ${T.border}`,
            borderRadius: 8,
            width: 34,
            height: 34,
            cursor: "pointer",
            fontSize: 16,
            color: T.dark,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          aria-label="Période suivante"
        >
          &#8594;
        </button>
        {!isCurrentPeriod && (
          <button
            onClick={() => setReferenceDate(todayStr)}
            style={{
              background: GROUP_COLOR,
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "6px 12px",
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: OSWALD,
              letterSpacing: "0.04em",
            }}
          >
            Aujourd&apos;hui
          </button>
        )}
      </div>

      {/* ── KPIs ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 10,
          marginBottom: 24,
        }}
      >
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
          delta={null}
          deltaLabel=""
          loading={loading}
          subtitle={`depuis oct. ${getFiscalYearStart(today).slice(0, 4)}`}
        />
      </div>

      {/* ── Graphique CA par jour ── */}
      {dailyCa.length > 0 && (
        <>
          <SectionTitle>CA par jour</SectionTitle>
          <div
            style={{
              background: T.white,
              borderRadius: 12,
              padding: "14px 16px",
              border: "1px solid #e0d8ce",
              marginBottom: 24,
            }}
          >
            <canvas ref={chartRef} height={200} />
          </div>
        </>
      )}

      {/* ── Mix catégories ── */}
      {mixCats.length > 0 && (
        <>
          <SectionTitle>Mix categories</SectionTitle>
          <div
            style={{
              background: T.white,
              borderRadius: 12,
              padding: "14px 16px",
              border: "1px solid #e0d8ce",
              marginBottom: 24,
            }}
          >
            {mixCats.map((m, i) => {
              const pct = totalCa > 0 ? (m.ca / totalCa) * 100 : 0;
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "5px 0",
                    borderBottom: i < mixCats.length - 1 ? "1px solid #f0ebe2" : "none",
                  }}
                >
                  <span style={{ flex: 1, fontSize: 12, color: T.dark }}>{m.cat}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, fontFamily: OSWALD, color: T.dark, minWidth: 70, textAlign: "right" }}>
                    {fmtEur(m.ca)} {"\u20AC"}
                  </span>
                  <span style={{ fontSize: 11, color: T.muted, minWidth: 45, textAlign: "right" }}>
                    {fmtPct(pct)}%
                  </span>
                  <div style={{ width: 60, height: 6, background: "#f0ebe2", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: GROUP_COLOR, borderRadius: 3 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── Par etablissement ── */}
      <SectionTitle>Par etablissement</SectionTitle>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 10,
          marginBottom: 24,
        }}
      >
        {etablissements.map((etab) => {
          const d = etabData[etab.id] ?? { ca: 0, caPrev: 0, caA1: 0, couverts: 0, couvertsPrev: 0, couvertsA1: 0 };
          const ticket = d.couverts > 0 ? d.ca / d.couverts : 0;
          const delta = d.caPrev > 0 ? Math.round(((d.ca - d.caPrev) / d.caPrev) * 100) : null;
          const deltaA1 = d.caA1 > 0 ? Math.round(((d.ca - d.caA1) / d.caA1) * 100) : null;
          const color = etab.slug?.includes("bello") ? T.belloMio : T.piccolaMia;
          const ventesHref = `/ventes?from=${range.start}&to=${range.end}`;

          return (
            <Link key={etab.id} href={ventesHref} onClick={() => { const target = etablissements.find(e => e.id === etab.id); if (target) { setCurrent(target); setGroupView(false); } }} style={{ textDecoration: "none" }}>
              <div
                style={{
                  background: T.white,
                  borderRadius: 12,
                  padding: "14px 16px",
                  border: `1px solid #e0d8ce`,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: color,
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontFamily: OSWALD,
                      fontSize: 16,
                      fontWeight: 700,
                      color: T.dark,
                      textTransform: "uppercase",
                    }}
                  >
                    {etab.nom}
                  </span>
                </div>
                <Row label={`CA ${periodLabel}`} value={`${fmtEur(d.ca)} \u20AC`} />
                <Row label="Couverts" value={String(d.couverts)} />
                <Row
                  label="Ticket moyen"
                  value={`${ticket.toFixed(1).replace(".", ",")} \u20AC`}
                />
                {delta != null && (
                  <div style={{ fontSize: 11, fontWeight: 600, color: delta >= 0 ? T.sauge : "#DC2626", marginTop: 2 }}>
                    {delta > 0 ? "+" : ""}{delta}% vs {prevLabel}
                  </div>
                )}
                {deltaA1 != null && (
                  <div style={{ fontSize: 11, fontWeight: 600, color: deltaA1 >= 0 ? T.sauge : "#DC2626", marginTop: 1 }}>
                    {deltaA1 > 0 ? "+" : ""}{deltaA1}% vs A-1
                  </div>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      {/* ── Pilotage ── */}
      <SectionTitle>Pilotage</SectionTitle>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 10,
          marginBottom: 24,
        }}
      >
        {/* Marge globale */}
        <MiniCard
          label="Marge globale"
          value={totalCa > 0 ? `${fmtEur(margeGlobale)} \u20AC` : "-"}
          accent={T.sauge}
          subtitle={totalCa > 0 ? `${fmtPct(100 - foodCostRatio)}%` : undefined}
        />
        {/* Ratio masse salariale */}
        <MiniCard label="Masse salariale" value="A configurer" accent={T.bleu} muted />
        {/* Tresorerie */}
        <MiniCard
          label="Tresorerie"
          value={tresoBalance != null ? `${fmtEur(tresoBalance)} \u20AC` : "Importer un releve"}
          accent={T.dore}
          muted={tresoBalance == null}
        />
      </div>

      {/* ── Achats summary ── */}
      <SectionTitle>Achats du mois</SectionTitle>
      <div
        style={{
          background: T.white,
          borderRadius: 12,
          padding: "14px 16px",
          border: "1px solid #e0d8ce",
          marginBottom: 24,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontSize: 11, color: T.muted }}>Total achats HT</span>
          <span
            style={{
              fontFamily: OSWALD,
              fontSize: 18,
              fontWeight: 700,
              color: T.sauge,
            }}
          >
            {fmtEur(achatsMonth)} {"\u20AC"}
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <span style={{ fontSize: 11, color: T.muted }}>Food cost ratio</span>
          <span
            style={{
              fontFamily: OSWALD,
              fontSize: 14,
              fontWeight: 700,
              color: foodCostRatio > 35 ? "#DC2626" : T.dark,
            }}
          >
            {totalCa > 0 ? `${fmtPct(foodCostRatio)}%` : "-"}
          </span>
        </div>
        {topFournisseurs.length > 0 && (
          <>
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "#777",
                marginBottom: 6,
              }}
            >
              Top fournisseurs
            </div>
            {topFournisseurs.map((f, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "3px 0",
                }}
              >
                <span style={{ fontSize: 12, color: T.dark }}>{f.name}</span>
                <span
                  style={{ fontSize: 12, fontWeight: 700, fontFamily: OSWALD, color: T.dark }}
                >
                  {fmtEur(f.total)} {"\u20AC"}
                </span>
              </div>
            ))}
          </>
        )}
      </div>

      {/* ── Raccourcis ── */}
      <SectionTitle>Raccourcis</SectionTitle>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
          marginBottom: 20,
        }}
      >
        <ShortcutCard
          title="Pilotage"
          icon="P"
          links={[
            { href: "/ventes", label: "Rapport de vente" },
            { href: "/stats-achats", label: "Marges" },
            { href: "/tresorerie", label: "Tresorerie" },
          ]}
        />
        <ShortcutCard
          title="Personnel"
          icon="H"
          links={[
            { href: "/rh/equipe", label: "Employes" },
            { href: "/plannings", label: "Planning" },
          ]}
        />
        <ShortcutCard
          title="Production"
          icon="R"
          links={[{ href: "/recettes", label: "Fiches techniques" }]}
        />
        <ShortcutCard
          title="Achats"
          icon="A"
          links={[
            { href: "/commandes", label: "Commandes" },
            { href: "/achats", label: "Factures" },
          ]}
        />
        <ShortcutCard
          title="Evenementiel"
          icon="E"
          links={[{ href: "/evenements", label: "Evenements" }]}
          subtitle="Piccola Mia"
        />
      </div>

      {/* ── IA Tendances ── */}
      <SectionTitle>Intelligence artificielle</SectionTitle>
      <AiInsightCard
        type="trends"
        label="Analyse des tendances"
        icon={"\uD83D\uDCC9"}
        color="#5e7a8a"
      />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   Sub-components
   ══════════════════════════════════════════════════════════ */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: "#777",
        marginBottom: 10,
      }}
    >
      {children}
    </div>
  );
}

function KpiCard({
  label,
  value,
  accent,
  delta,
  deltaLabel,
  deltaA1,
  loading,
  subtitle,
}: {
  label: string;
  value: string;
  accent: string;
  delta: number | null;
  deltaLabel: string;
  deltaA1?: number | null;
  loading: boolean;
  subtitle?: string;
}) {
  return (
    <div
      style={{
        background: T.white,
        borderRadius: 12,
        padding: "14px 16px",
        border: "1px solid #e0d8ce",
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      <span
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "#777",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: accent,
          fontFamily: OSWALD,
          lineHeight: 1.15,
          marginTop: 4,
          opacity: loading ? 0.4 : 1,
          transition: "opacity 0.2s",
        }}
      >
        {value}
      </span>
      {subtitle && (
        <span style={{ fontSize: 10, color: T.muted, marginTop: 2 }}>{subtitle}</span>
      )}
      {delta != null && (
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: delta >= 0 ? T.sauge : "#DC2626",
            marginTop: 2,
          }}
        >
          {delta > 0 ? "+" : ""}
          {Math.round(delta)}% vs {deltaLabel}
        </span>
      )}
      {deltaA1 != null && (
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: deltaA1 >= 0 ? T.sauge : "#DC2626",
            marginTop: 1,
          }}
        >
          {deltaA1 > 0 ? "+" : ""}
          {Math.round(deltaA1)}% vs A-1
        </span>
      )}
    </div>
  );
}

function MiniCard({
  label,
  value,
  accent,
  subtitle,
  muted: isMuted,
}: {
  label: string;
  value: string;
  accent: string;
  subtitle?: string;
  muted?: boolean;
}) {
  return (
    <div
      style={{
        background: T.white,
        borderRadius: 12,
        padding: "12px 10px",
        border: "1px solid #e0d8ce",
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      <span
        style={{
          fontSize: 8,
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "#777",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: isMuted ? 11 : 16,
          fontWeight: 700,
          color: isMuted ? T.muted : accent,
          fontFamily: isMuted ? undefined : OSWALD,
          lineHeight: 1.2,
          marginTop: 4,
        }}
      >
        {value}
      </span>
      {subtitle && (
        <span style={{ fontSize: 10, color: T.muted, marginTop: 1 }}>{subtitle}</span>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: 11, color: T.muted }}>{label}</span>
      <span
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: T.dark,
          fontFamily: OSWALD,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function ShortcutCard({
  title,
  icon,
  links,
  subtitle,
}: {
  title: string;
  icon: string;
  links: { href: string; label: string }[];
  subtitle?: string;
}) {
  return (
    <div
      style={{
        background: T.white,
        borderRadius: 12,
        padding: "14px 16px",
        border: "1px solid #e0d8ce",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
        <span
          style={{
            width: 26,
            height: 26,
            borderRadius: 7,
            background: `${GROUP_COLOR}18`,
            color: GROUP_COLOR,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: OSWALD,
            fontWeight: 700,
            fontSize: 13,
            flexShrink: 0,
          }}
        >
          {icon}
        </span>
        <div>
          <div
            style={{
              fontFamily: OSWALD,
              fontSize: 13,
              fontWeight: 700,
              color: T.dark,
              textTransform: "uppercase",
            }}
          >
            {title}
          </div>
          {subtitle && (
            <div style={{ fontSize: 9, color: T.muted, fontWeight: 500 }}>{subtitle}</div>
          )}
        </div>
      </div>
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          style={{
            fontSize: 12,
            color: GROUP_COLOR,
            textDecoration: "none",
            fontWeight: 600,
            padding: "2px 0",
            borderBottom: `1px solid ${GROUP_COLOR}15`,
          }}
        >
          {l.label}
        </Link>
      ))}
    </div>
  );
}
