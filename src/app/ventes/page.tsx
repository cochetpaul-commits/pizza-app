"use client";

import { useEffect, useState, useRef, useCallback, Suspense, type CSSProperties } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { RequireRole } from "@/components/RequireRole";
import { useEtablissement } from "@/lib/EtablissementContext";
import Chart from "chart.js/auto";
import { getCategoryColor, getCategoryColors } from "@/lib/categoryColors";
import { DateRangePicker, type DateRange } from "@/components/ui/DateRangePicker";
import { BottomSheet } from "@/components/layout/BottomSheet";

/* ── Types ── */
type WeekData = {
  dates: string[];
  days: string[];
  ca_ttc: number; ca_ht: number; couverts: number; tickets: number; ann_pct: number;
  day_ttc: number[]; day_ht: number[]; day_cov: number[];
  tm_ttc: number[]; tm_ht: number[];
  zones_ttc: Record<string, number[]>; zones_ht: Record<string, number[]>;
  place_sur_ttc: number; place_sur_ht: number;
  place_emp_ttc: number; place_emp_ht: number;
  cov_sur: number; cov_emp: number;
  services: {
    jour: string; svc: string; ttc: number; ht: number; cov: number;
    tm_ttc: number; tm_ht: number;
    sp_ttc: number; sp_ht: number; emp_ttc: number; emp_ht: number;
    sp_cov: number; tm_sp_ttc: number; tm_sp_ht: number;
    z_ttc: Record<string, number>; z_ht: Record<string, number>;
  }[];
  mix_labels: string[]; mix_ttc: number[]; mix_ht: number[];
  top10_names: string[]; top10_ca_ttc: number[]; top10_ca_ht: number[]; top10_qty: number[];
  cat_products: Record<string, { n: string; qty: number; ca_ttc: number; ca_ht: number }[]>;
  cat_products_sur: Record<string, { n: string; qty: number; ca_ttc: number; ca_ht: number }[]>;
  cat_products_emp: Record<string, { n: string; qty: number; ca_ttc: number; ca_ht: number }[]>;
  cat_products_zones: Record<string, Record<string, { n: string; qty: number; ca_ttc: number; ca_ht: number }[]>>;
  top3_cats: { cat: string; rows: { n: string; ca_ttc: string; ca_ht: string }[]; flop: { n: string; ca_ttc: string; ca_ht: string; qty: number } | null }[];
  serveurs: string[]; serv_ca_ttc: number[]; serv_ca_ht: number[]; serv_tickets: number[]; serv_cov: number[];
  ratios: {
    anti: { tables: number; coverts: number; ca_ttc: number; ca_ht: number };
    dolci: { tables: number; coverts: number; ca_ttc: number; ca_ht: number };
    vin: { tables: number; coverts: number; ca_ttc: number; ca_ht: number };
    alcool: { tables: number; coverts: number; ca_ttc: number; ca_ht: number };
    boissons: { tables: number; coverts: number; ca_ttc: number; ca_ht: number };
    digestif: { tables: number; coverts: number; ca_ttc: number; ca_ht: number };
    cafe: { tables: number; coverts: number; ca_ttc: number; ca_ht: number };
    avgCovPerTable: number;
  };
  pay: { l: string; v: number; pct: number }[];
  duration: {
    avgDurMin: number;
    byZone: { zone: string; avgDur: number; tables: number; couverts: number }[];
    bySvc: { svc: string; avgDur: number; tables: number }[];
    avgRotation: number;
    rotByZone: { zone: string; avgRotation: number; maxRotation: number }[];
    totalOrders: number;
  };
  // Extra fields from daily_sales source
  marge_total?: number;
  marge_pct?: number;
  day_marge?: number[];
  day_taux_marque?: number[];
  hourly_totals?: number[];
};

/* ── Helpers: compute default range (today, weekend-safe) ── */
function defaultRange(): DateRange {
  const d = new Date();
  const dow = d.getDay();
  if (dow === 0) d.setDate(d.getDate() - 2); // Sunday → Friday
  else if (dow === 6) d.setDate(d.getDate() - 1); // Saturday → Friday
  const iso = d.toISOString().slice(0, 10);
  return { from: iso, to: iso };
}

/* ── Helpers ── */
const fmt = (v: number) => Math.round(v).toLocaleString("fr-FR") + "\u20AC";
const fmtK = (v: number) => Math.round(v / 1000) + "k\u20AC";
const ZC: Record<string, string> = { Salle: "#46655a", Pergolas: "#5e8278", Terrasse: "#c4a882", emp: "#D4775A" };

/* ── Week aggregation helpers (for monthly view) ── */
type WeekBucket = { label: string; indices: number[] };

function buildWeekBuckets(dates: string[]): WeekBucket[] {
  if (!dates.length) return [];
  const buckets: WeekBucket[] = [];
  let cur: WeekBucket | null = null;
  for (let i = 0; i < dates.length; i++) {
    const d = new Date(dates[i] + "T12:00:00");
    const dow = d.getDay() || 7; // Monday=1 ... Sunday=7
    const mon = new Date(d);
    mon.setDate(d.getDate() - dow + 1);
    const key = `S.${mon.getDate()}/${mon.getMonth() + 1}`;
    if (!cur || cur.label !== key) {
      cur = { label: key, indices: [i] };
      buckets.push(cur);
    } else {
      cur.indices.push(i);
    }
  }
  return buckets;
}

function sumByBuckets(vals: number[], buckets: WeekBucket[]): number[] {
  return buckets.map(b => b.indices.reduce((s, i) => s + (vals[i] ?? 0), 0));
}

/* ── Chart helper ── */
const charts: Record<string, Chart> = {};
function destroyChart(id: string) { if (charts[id]) { charts[id].destroy(); delete charts[id]; } }

/* ── Styles ── */
const S = {
  card: { background: "#fff", borderRadius: 12, padding: "18px 20px", border: "1px solid #e0d8ce", marginBottom: 14 } as CSSProperties,
  sec: { fontSize: 9, textTransform: "uppercase" as const, letterSpacing: ".12em", color: "#777", fontWeight: 500, marginBottom: 12 } as CSSProperties,
  bigNum: { fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 46, fontWeight: 700, color: "#fff", lineHeight: 1, letterSpacing: "-.02em" } as CSSProperties,
};

/* ══════════════════════════════════════════════════════
   COMPONENT
   ══════════════════════════════════════════════════════ */

export default function PerformancesPageWrapper() {
  return (
    <Suspense fallback={null}>
      <PerformancesPage />
    </Suspense>
  );
}

function PerformancesPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { current: etab } = useEtablissement();
  const accent = etab?.couleur ?? "#D4775A";

  const [range, setRange] = useState<DateRange>(() => {
    const qf = searchParams.get("from");
    const qt = searchParams.get("to");
    if (qf && qt && /^\d{4}-\d{2}-\d{2}$/.test(qf) && /^\d{4}-\d{2}-\d{2}$/.test(qt)) {
      return { from: qf, to: qt };
    }
    return defaultRange();
  });
  const [mode, setMode] = useState<"ttc" | "ht">(() => {
    const m = searchParams.get("mode");
    if (m === "ttc" || m === "ht") return m;
    return "ttc";
  });
  const [data, setData] = useState<WeekData | null>(null);
  const [prev, setPrev] = useState<WeekData | null>(null); // A-1
  const [dataSource, setDataSource] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const [exporting, setExporting] = useState(false);
  const [pdfDrawerOpen, setPdfDrawerOpen] = useState(false);
  const [briefing, setBriefing] = useState<string[] | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [mixDDOpen, setMixDDOpen] = useState<{ label: string; color: string } | null>(null);
  const [placeDetail, setPlaceDetail] = useState<"sur" | "emp" | null>(null);
  const [zoneDetail, setZoneDetail] = useState<string | null>(null);
  const [expandedCat, setExpandedCat] = useState<string | null>(null);
  const [meteo, setMeteo] = useState<Record<string, { emoji: string; desc: string; temp: number }>>({});

  // Category trend state
  type CatTrendDaily = { date: string; qty: number; ca_ttc: number; ca_ht: number };
  const [catTrendFrom, setCatTrendFrom] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 3); return d.toISOString().slice(0, 10);
  });
  const [catTrendTo, setCatTrendTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [catTrendMetric, setCatTrendMetric] = useState<"qty" | "ca_ttc">("ca_ttc");
  const [catTrendData, setCatTrendData] = useState<Record<string, CatTrendDaily[]> | null>(null);
  const [catTrendLoading, setCatTrendLoading] = useState(false);
  const catTrendChartRef = useRef<HTMLCanvasElement>(null);
  // Drill-down: optional category + product filter
  const [catTrendFilterCat, setCatTrendFilterCat] = useState<string | null>(null);
  const [catTrendFilterProd, setCatTrendFilterProd] = useState<string | null>(null);
  // Single-product trend data (when product is selected)
  const [prodTrendData, setProdTrendData] = useState<CatTrendDaily[] | null>(null);

  // Compute date range from state
  const getRange = useCallback(() => {
    const { from, to } = range;
    if (from && to && from > to) return { from: to, to: from };
    return { from, to };
  }, [range]);

  // Load data
  const loadData = useCallback(async () => {
    if (!etab) return;
    setLoading(true);
    const { from, to } = getRange();
    try {
      const res = await fetch(`/api/ventes/stats?etablissement_id=${etab.id}&from=${from}&to=${to}`);
      const json = await res.json();
      if (json.empty || !json.stats) {
        setData(null);
        setPrev(null);
        setDataSource(null);
      } else {
        setData(json.stats);
        setPrev(json.prev ?? null);
        setDataSource(json.source ?? "ventes_lignes");
      }
      // Fetch meteo
      try {
        const mRes = await fetch(`/api/meteo?from=${from}&to=${to}`);
        const mJson = await mRes.json();
        const mMap: Record<string, { emoji: string; desc: string; temp: number }> = {};
        for (const m of mJson.meteo ?? []) {
          mMap[`${m.date_service}:${m.service}`] = { emoji: m.emoji, desc: m.description, temp: m.temp };
        }
        setMeteo(mMap);
      } catch { setMeteo({}); }

    } catch {
      setData(null);
      setPrev(null);
    }
    setLoading(false);
  }, [etab, getRange]);

  useEffect(() => { loadData(); }, [loadData]); // eslint-disable-line react-hooks/set-state-in-effect -- async data fetch

  // Fetch category trend data (all categories for chart + optional product drill-down)
  const loadCatTrend = useCallback(async () => {
    if (!etab) return;
    setCatTrendLoading(true);
    try {
      // Always fetch all-categories data (for the dropdown + default chart)
      const res = await fetch(
        `/api/ventes/marges/trend?etablissement_id=${etab.id}&from=${catTrendFrom}&to=${catTrendTo}&group_by=category`,
      );
      const json = await res.json();
      setCatTrendData(json.categories ?? null);

      // If a specific product is selected, fetch product-level daily data
      if (catTrendFilterProd) {
        const pRes = await fetch(
          `/api/ventes/marges/trend?etablissement_id=${etab.id}&from=${catTrendFrom}&to=${catTrendTo}&product=${encodeURIComponent(catTrendFilterProd)}`,
        );
        const pJson = await pRes.json();
        setProdTrendData(pJson.daily ?? null);
      } else {
        setProdTrendData(null);
      }
    } catch {
      setCatTrendData(null);
      setProdTrendData(null);
    }
    setCatTrendLoading(false);
  }, [etab, catTrendFrom, catTrendTo, catTrendFilterProd]);

  useEffect(() => { loadCatTrend(); }, [loadCatTrend]); // eslint-disable-line react-hooks/set-state-in-effect -- async data fetch

  // Draw category trend chart
  useEffect(() => {
    if (!catTrendChartRef.current || !catTrendData) return;
    const id = "catTrend";
    destroyChart(id);

    // Determine time grouping: <= 3 months → weeks, > 3 months → months
    const fromD = new Date(catTrendFrom + "T12:00:00");
    const toD = new Date(catTrendTo + "T12:00:00");
    const diffMonths = (toD.getFullYear() - fromD.getFullYear()) * 12 + toD.getMonth() - fromD.getMonth();
    const useWeeks = diffMonths <= 3;

    // Collect all dates across all categories
    const allDates = new Set<string>();
    for (const daily of Object.values(catTrendData)) {
      for (const d of daily) allDates.add(d.date);
    }
    const sortedDates = Array.from(allDates).sort();

    // Build time buckets
    type Bucket = { label: string; dates: Set<string> };
    const buckets: Bucket[] = [];

    if (useWeeks) {
      const bucketMap = new Map<string, Bucket>();
      for (const ds of sortedDates) {
        const d = new Date(ds + "T12:00:00");
        const dow = d.getDay() || 7;
        const mon = new Date(d);
        mon.setDate(d.getDate() - dow + 1);
        const wk = Math.ceil((mon.getDate() + new Date(mon.getFullYear(), mon.getMonth(), 1).getDay()) / 7);
        const key = `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, "0")}-W${wk}`;
        const label = `S${String(wk).padStart(2, "0")} ${["Jan", "Fev", "Mar", "Avr", "Mai", "Jun", "Jul", "Aou", "Sep", "Oct", "Nov", "Dec"][mon.getMonth()]}`;
        if (!bucketMap.has(key)) {
          const b = { label, dates: new Set<string>() };
          bucketMap.set(key, b);
          buckets.push(b);
        }
        bucketMap.get(key)!.dates.add(ds);
      }
    } else {
      const bucketMap = new Map<string, Bucket>();
      const mNames = ["Jan", "Fev", "Mar", "Avr", "Mai", "Jun", "Jul", "Aou", "Sep", "Oct", "Nov", "Dec"];
      for (const ds of sortedDates) {
        const d = new Date(ds + "T12:00:00");
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const label = `${mNames[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
        if (!bucketMap.has(key)) {
          const b = { label, dates: new Set<string>() };
          bucketMap.set(key, b);
          buckets.push(b);
        }
        bucketMap.get(key)!.dates.add(ds);
      }
    }

    const labels = buckets.map(b => b.label);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let datasets: any[];

    // If a product is selected, show single-product chart
    if (catTrendFilterProd && prodTrendData) {
      const dailyMap = new Map<string, CatTrendDaily>();
      for (const d of prodTrendData) dailyMap.set(d.date, d);
      const values = buckets.map(b => {
        let sum = 0;
        for (const ds of b.dates) {
          const row = dailyMap.get(ds);
          if (row) sum += catTrendMetric === "ca_ttc" ? row.ca_ttc : row.qty;
        }
        return Math.round(sum * 100) / 100;
      });
      datasets = [{
        label: catTrendFilterProd,
        data: values,
        backgroundColor: getCategoryColor(catTrendFilterCat ?? ""),
        borderRadius: 4,
      }];
    }
    // If only a category is selected, show that category's data only
    else if (catTrendFilterCat && catTrendData[catTrendFilterCat]) {
      const dailyMap = new Map<string, CatTrendDaily>();
      for (const d of catTrendData[catTrendFilterCat]) dailyMap.set(d.date, d);
      const values = buckets.map(b => {
        let sum = 0;
        for (const ds of b.dates) {
          const row = dailyMap.get(ds);
          if (row) sum += catTrendMetric === "ca_ttc" ? row.ca_ttc : row.qty;
        }
        return Math.round(sum * 100) / 100;
      });
      datasets = [{
        label: catTrendFilterCat,
        data: values,
        backgroundColor: getCategoryColor(catTrendFilterCat),
        borderRadius: 4,
      }];
    }
    // Default: all categories
    else {
      const catNames = Object.keys(catTrendData).sort((a, b) => {
        const totalA = catTrendData[a].reduce((s, d) => s + d.ca_ttc, 0);
        const totalB = catTrendData[b].reduce((s, d) => s + d.ca_ttc, 0);
        return totalB - totalA;
      });

      datasets = catNames.map((cat) => {
        const dailyMap = new Map<string, CatTrendDaily>();
        for (const d of catTrendData[cat]) dailyMap.set(d.date, d);

        const values = buckets.map(b => {
          let sum = 0;
          for (const ds of b.dates) {
            const row = dailyMap.get(ds);
            if (row) sum += catTrendMetric === "ca_ttc" ? row.ca_ttc : row.qty;
          }
          return Math.round(sum * 100) / 100;
        });

        return {
          label: cat,
          data: values,
          backgroundColor: getCategoryColor(cat),
          borderRadius: 4,
        };
      });
    }

    charts[id] = new Chart(catTrendChartRef.current, {
      type: "bar" as const,
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "top" as const, labels: { font: { size: 10 }, boxWidth: 12, padding: 10 } },
          tooltip: {
            callbacks: {
              label: ctx => {
                const v = ctx.raw as number;
                return catTrendMetric === "ca_ttc"
                  ? `${ctx.dataset.label} : ${Math.round(v).toLocaleString("fr-FR")}\u20AC`
                  : `${ctx.dataset.label} : ${v}`;
              },
            },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: "#777", font: { size: 10 } } },
          y: {
            beginAtZero: true,
            grid: { color: "rgba(0,0,0,0.05)" },
            ticks: {
              color: "#aaa",
              font: { size: 10 },
              callback: v => catTrendMetric === "ca_ttc" ? fmtK(v as number) : String(v),
            },
          },
        },
      },
    });

    return () => { destroyChart(id); };
  }, [catTrendData, catTrendMetric, catTrendFrom, catTrendTo, catTrendFilterCat, catTrendFilterProd, prodTrendData]);

  // Import handler
  const handleImport = async (file: File) => {
    if (!etab) return;
    setImporting(true);
    setImportMsg("");
    const fd = new FormData();
    fd.append("file", file);
    fd.append("etablissement_id", etab.id);
    try {
      const res = await fetch("/api/ventes/import", { method: "POST", body: fd });
      const json = await res.json();
      if (json.ok) {
        setImportMsg(`${json.inserted} lignes importees (${json.range})`);
        loadData();
      } else {
        setImportMsg("Erreur : " + (json.error || "inconnue"));
      }
    } catch (e) {
      setImportMsg("Erreur : " + String(e));
    }
    setImporting(false);
  };

  // Navigate dates (skip weekends in jour mode)
  // Generate AI briefing
  const generateBriefing = async () => {
    if (!etab || !data) return;
    setBriefingLoading(true);
    try {
      const { from, to } = getRange();
      const res = await fetch(`/api/claude/insights?etablissement_id=${etab.id}&from=${from}&to=${to}&type=briefing`);
      const json = await res.json();
      if (json.briefing?.points) setBriefing(json.briefing.points);
    } catch { /* ignore */ }
    setBriefingLoading(false);
  };

  const { from, to } = getRange();
  const isSingleDay = from === to;
  const rangeLabel = isSingleDay
    ? new Date(from + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : `Du ${new Date(from + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })} au ${new Date(to + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}`;

  // PDF export — supports 3 types: "ventes" | "produits" | "complet"
  const handleExportPDF = async (exportType: "ventes" | "produits" | "complet") => {
    if (!data || !etab) return;
    setPdfDrawerOpen(false);
    setExporting(true);
    try {
      const res = await fetch("/api/ventes/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stats: data, prev: activePrev, mode,
          viewTab: isSingleDay ? "jour" : "perso",
          rangeLabel,
          etabName: etab.nom ?? "Etablissement",
          briefing,
          exportType,
        }),
      });
      if (!res.ok) { setExporting(false); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const dateSuffix = isSingleDay ? from : `${from}_${to}`;
      a.download = `rapport-${exportType}-${etab.nom?.replace(/\s/g, "_")}-${dateSuffix}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* ignore */ }
    setExporting(false);
  };

  const W = data;
  const activePrev = prev;
  const ca = W ? (mode === "ttc" ? W.ca_ttc : W.ca_ht) : 0;

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <div className="ventes-container" style={{ maxWidth: 1000, margin: "0 auto", padding: "16px 16px 120px" }}>

        {/* ── Toolbar: Import | Calendar | PDF | TTC/HT ── */}
        <div className="ventes-toolbar" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 14 }}>
          <label style={{
            padding: "7px 14px", borderRadius: 8, border: "none",
            background: accent, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer",
          }}>
            {importing ? "Import..." : "Import"}
            <input type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={e => {
              const f = e.target.files?.[0];
              if (f) handleImport(f);
              e.target.value = "";
            }} />
          </label>
          <DateRangePicker value={range} onChange={(r) => setRange(r)} />
          {data && (
            <button type="button" onClick={() => setPdfDrawerOpen(true)} disabled={exporting} style={{
              padding: "7px 14px", borderRadius: 8, border: "1px solid #e0d8ce",
              background: "#fff", color: "#1a1a1a", fontSize: 12, fontWeight: 700, cursor: "pointer",
              opacity: exporting ? 0.5 : 1,
            }}>
              {exporting ? "Export..." : "PDF"}
            </button>
          )}
          {/* Compact TTC/HT toggle */}
          <div style={{ display: "flex", gap: 0, background: "#fff", border: "1px solid rgba(0,0,0,.08)", borderRadius: 999, padding: 2 }}>
            <button type="button" onClick={() => setMode("ttc")} style={{
              padding: "3px 10px", borderRadius: 999, border: "none", cursor: "pointer",
              background: mode === "ttc" ? accent : "transparent", color: mode === "ttc" ? "#fff" : "#999",
              fontSize: 10, fontWeight: 700, letterSpacing: ".03em",
            }}>TTC</button>
            <button type="button" onClick={() => setMode("ht")} style={{
              padding: "3px 10px", borderRadius: 999, border: "none", cursor: "pointer",
              background: mode === "ht" ? accent : "transparent", color: mode === "ht" ? "#fff" : "#999",
              fontSize: 10, fontWeight: 700, letterSpacing: ".03em",
            }}>HT</button>
          </div>
        </div>

        {/* ── Page nav pills: Ventes / Produits ── */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
          <div style={{ display: "inline-flex", background: "#fff", border: "1px solid rgba(0,0,0,.08)", borderRadius: 20, padding: 3 }}>
            <span style={{
              padding: "5px 16px", borderRadius: 16, fontSize: 11, fontWeight: 600, cursor: "default",
              background: accent, color: "#fff",
              fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
            }}>Ventes</span>
            <button type="button" onClick={() => router.push(`/ventes/marges?from=${from}&to=${to}`)} style={{
              padding: "5px 16px", borderRadius: 16, fontSize: 11, fontWeight: 600, cursor: "pointer",
              background: "transparent", color: "#777", border: "none",
              fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
            }}>Produits</button>
          </div>
        </div>

        {/* PDF export drawer */}
        <BottomSheet
          open={pdfDrawerOpen}
          onClose={() => setPdfDrawerOpen(false)}
          title="Exporter en PDF"
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { key: "ventes" as const, label: "Ventes", sub: "Rapport detaille des ventes" },
              { key: "produits" as const, label: "Produits", sub: "Marges et food cost par produit" },
              { key: "complet" as const, label: "Complet", sub: "Ventes + Produits reunis" },
            ].map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => handleExportPDF(opt.key)}
                disabled={exporting}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "flex-start",
                  gap: 2,
                  width: "100%", padding: "14px 18px",
                  border: "none", cursor: "pointer",
                  borderRadius: 14,
                  background: "rgba(255,255,255,0.55)",
                  textAlign: "left",
                  fontFamily: "inherit",
                  opacity: exporting ? 0.5 : 1,
                }}
              >
                <span style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a" }}>{opt.label}</span>
                <span style={{ fontSize: 12, color: "#777" }}>{opt.sub}</span>
              </button>
            ))}
          </div>
        </BottomSheet>
        {importMsg && <div style={{ fontSize: 12, color: accent, marginBottom: 10 }}>{importMsg}</div>}

        {/* ── Loading / Empty ── */}
        {loading && <div style={{ textAlign: "center", padding: 60, color: "#999" }}>Chargement...</div>}

        {!loading && !W && (
          <div style={{ ...S.card, textAlign: "center", padding: 60 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#1a1a1a", marginBottom: 6 }}>Aucune donnee pour cette periode</div>
            <div style={{ fontSize: 12, color: "#777" }}>Importez un fichier XLSX pour alimenter le dashboard.</div>
          </div>
        )}

        {/* ── Dashboard ── */}
        {!loading && W && (
          <>
            {/* CA Hero card */}
            <div style={{ ...S.card, padding: 0, overflow: "hidden", marginBottom: 18 }}>
              <div style={{
                background: `linear-gradient(135deg, #b85a3a 0%, ${accent} 50%, #e09070 100%)`,
                padding: "22px 24px 20px", position: "relative",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 16, fontWeight: 700, color: "#fff", textTransform: "uppercase", letterSpacing: ".02em", marginBottom: 4, textShadow: "0 1px 4px rgba(0,0,0,.15)" }}>
                      {rangeLabel}
                    </div>
                    <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".16em", color: "rgba(255,255,255,.7)", fontWeight: 600, marginBottom: 8 }}>
                      CA {mode.toUpperCase()}
                    </div>
                    <div style={{ ...S.bigNum, textShadow: "0 2px 6px rgba(0,0,0,.2)" }}>{fmt(ca)}</div>
                    {mode === "ttc" && <div style={{ fontSize: 13, color: "rgba(255,255,255,.85)", marginTop: 6, fontWeight: 500 }}>HT <span style={{ color: "#fff", fontWeight: 700 }}>{fmt(W.ca_ht)}</span></div>}
                  </div>
                  {activePrev && (() => {
                    const prevCA = mode === "ttc" ? activePrev.ca_ttc : activePrev.ca_ht;
                    const d = ca - prevCA;
                    const pct = prevCA > 0 ? (d / prevCA * 100) : 0;
                    return (
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: d >= 0 ? "rgba(165,214,167,.9)" : "#fca5a5" }}>
                          {d >= 0 ? "+" : ""}{pct.toFixed(1)}%
                        </div>
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,.85)", marginTop: 2 }}>vs A-1</div>
                      </div>
                    );
                  })()}
                </div>
                <div className="ventes-hero-kpis" style={{ display: "flex", gap: 20, marginTop: 18, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,.12)", flexWrap: "wrap", alignItems: "flex-start" }}>
                  {dataSource === "daily_sales" ? (<>
                    {/* Piccola / daily_sales KPIs */}
                    <div style={{ minWidth: 0, flex: "1 1 0" }}>
                      <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".12em", color: "rgba(255,255,255,.8)", fontWeight: 700, marginBottom: 4 }}>Tickets</div>
                      <div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 24, fontWeight: 700, color: "#fff", textShadow: "0 2px 6px rgba(0,0,0,.2)" }}>{W.tickets}</div>
                      {prev && prev.tickets > 0 && <DeltaBadge cur={W.tickets} prev={prev.tickets} />}
                    </div>
                    <div style={{ width: 1, background: "rgba(255,255,255,.1)", alignSelf: "stretch" }} />
                    <div style={{ minWidth: 0, flex: "1 1 0" }}>
                      <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".12em", color: "rgba(255,255,255,.8)", fontWeight: 700, marginBottom: 4 }}>Panier moyen</div>
                      <div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 24, fontWeight: 700, color: "#fff", textShadow: "0 2px 6px rgba(0,0,0,.2)" }}>
                        {W.tickets > 0 ? (ca / W.tickets).toFixed(1) + "\u20AC" : "\u2014"}
                      </div>
                      {activePrev && activePrev.tickets > 0 && <DeltaBadge cur={ca / W.tickets} prev={(mode === "ttc" ? activePrev.ca_ttc : activePrev.ca_ht) / activePrev.tickets} decimals={1} suffix="\u20AC" />}
                    </div>
                    <div style={{ width: 1, background: "rgba(255,255,255,.1)", alignSelf: "stretch" }} />
                    <div style={{ minWidth: 0, flex: "1 1 0" }}>
                      <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".12em", color: "rgba(255,255,255,.8)", fontWeight: 700, marginBottom: 4 }}>Marge</div>
                      {(() => {
                        const marge = W.marge_total ?? 0;
                        const margePct = W.marge_pct ?? 0;
                        return (
                          <>
                            <div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 24, fontWeight: 700, color: margePct >= 20 ? "#a5d6a7" : "#fca5a5", lineHeight: 1, textShadow: "0 2px 6px rgba(0,0,0,.2)" }}>
                              {fmt(marge)}
                            </div>
                            <div style={{ fontSize: 10, color: "rgba(255,255,255,.85)", marginTop: 3 }}>{margePct.toFixed(1)}% du CA HT</div>
                          </>
                        );
                      })()}
                    </div>
                  </>) : (<>
                    {/* Bello Mio / ventes_lignes KPIs */}
                    <div style={{ minWidth: 0, flex: "1 1 0" }}>
                      <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".12em", color: "rgba(255,255,255,.8)", fontWeight: 700, marginBottom: 4 }}>Couverts</div>
                      <div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 24, fontWeight: 700, color: "#fff", textShadow: "0 2px 6px rgba(0,0,0,.2)" }}>{W.couverts}</div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,.85)", marginTop: 2 }}>{W.tickets} tickets</div>
                      {prev && <DeltaBadge cur={W.couverts} prev={prev.couverts} />}
                    </div>
                    <div style={{ width: 1, background: "rgba(255,255,255,.1)", alignSelf: "stretch" }} />
                    <div style={{ minWidth: 0, flex: "1 1 0" }}>
                      <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".12em", color: "rgba(255,255,255,.8)", fontWeight: 700, marginBottom: 4 }}>CVT moyen</div>
                      <div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 24, fontWeight: 700, color: "#fff", textShadow: "0 2px 6px rgba(0,0,0,.2)" }}>
                        {W.couverts > 0 ? (ca / W.couverts).toFixed(1) + "\u20AC" : "\u2014"}
                      </div>
                      {W.cov_sur > 0 && <div style={{ fontSize: 10, color: "rgba(255,255,255,.85)", marginTop: 2 }}>CVT M SP <span style={{ color: "#fff", fontWeight: 700 }}>{((mode === "ttc" ? W.place_sur_ttc : W.place_sur_ht) / W.cov_sur).toFixed(1) + "\u20AC"}</span></div>}
                      {activePrev && activePrev.couverts > 0 && <DeltaBadge cur={ca / W.couverts} prev={(mode === "ttc" ? activePrev.ca_ttc : activePrev.ca_ht) / activePrev.couverts} decimals={1} suffix="\u20AC" />}
                    </div>
                    <div style={{ width: 1, background: "rgba(255,255,255,.1)", alignSelf: "stretch" }} />
                    <div style={{ minWidth: 0, flex: "1 1 0" }}>
                      <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".12em", color: "rgba(255,255,255,.8)", fontWeight: 700, marginBottom: 4 }}>vs A-1</div>
                      {activePrev ? (() => {
                        const prevCA = mode === "ttc" ? activePrev.ca_ttc : activePrev.ca_ht;
                        const d = ca - prevCA;
                        return (
                          <>
                            <div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 24, fontWeight: 700, color: d >= 0 ? "#a5d6a7" : "#fca5a5", lineHeight: 1, textShadow: "0 2px 6px rgba(0,0,0,.2)" }}>
                              {d >= 0 ? "+" : ""}{fmt(Math.abs(d))}
                            </div>
                            <div style={{ fontSize: 10, color: "rgba(255,255,255,.85)", marginTop: 3 }}>A-1 : {fmt(prevCA)}</div>
                          </>
                        );
                      })() : (
                        <div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 24, fontWeight: 700, color: "rgba(255,255,255,.3)", textShadow: "0 2px 6px rgba(0,0,0,.2)" }}>{"\u2014"}</div>
                      )}
                    </div>
                  </>)}
                </div>
              </div>
            </div>

            {/* Marge card (daily_sales source) */}
            {dataSource === "daily_sales" && W.day_marge && W.day_marge.length > 0 && (() => {
              const margeTotal = W.marge_total ?? 0;
              const margePct = W.marge_pct ?? 0;
              const dayMarge = W.day_marge ?? [];
              const dayTM = W.day_taux_marque ?? [];
              const avgTM = dayTM.length > 0 ? dayTM.reduce((s, v) => s + v, 0) / dayTM.filter(v => v > 0).length : 0;
              const labels = W.days.length > 7
                ? W.dates.map(d => new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" }))
                : W.days.map(d => d.slice(0, 3));
              const maxMarge = Math.max(...dayMarge, 1);

              return (
              <div style={S.card}>
                <div style={S.sec}>Marge & taux de marque</div>
                <div className="ventes-marge-kpis" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 18 }}>
                  <div style={{ background: "#f9f6f0", borderRadius: 10, padding: "14px 16px", textAlign: "center" }}>
                    <div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 28, fontWeight: 700, color: "#4a6741" }}>{Math.round(margeTotal).toLocaleString("fr-FR")}{"\u20AC"}</div>
                    <div style={{ fontSize: 10, color: "#777", marginTop: 4 }}>Marge totale</div>
                  </div>
                  <div style={{ background: "#f9f6f0", borderRadius: 10, padding: "14px 16px", textAlign: "center" }}>
                    <div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 28, fontWeight: 700, color: margePct >= 25 ? "#4a6741" : margePct >= 15 ? "#e65100" : "#c62828" }}>{margePct.toFixed(1)}%</div>
                    <div style={{ fontSize: 10, color: "#777", marginTop: 4 }}>Marge / CA HT</div>
                  </div>
                  <div style={{ background: "#f9f6f0", borderRadius: 10, padding: "14px 16px", textAlign: "center" }}>
                    <div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 28, fontWeight: 700, color: accent }}>{(avgTM * 100).toFixed(1)}%</div>
                    <div style={{ fontSize: 10, color: "#777", marginTop: 4 }}>Taux de marque moy.</div>
                  </div>
                </div>
                {/* Marge bar chart per day */}
                {dayMarge.length > 1 && (
                  <>
                    <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".12em", color: "#777", fontWeight: 500, marginBottom: 8 }}>Marge par jour</div>
                    {dayMarge.map((m, i) => {
                      const tm = dayTM[i] ?? 0;
                      const barPct = maxMarge > 0 ? Math.round(m / maxMarge * 100) : 0;
                      const tmColor = tm >= 0.25 ? "#4a6741" : tm >= 0.15 ? "#e65100" : "#c62828";
                      return (
                        <div key={i} style={{ marginBottom: 6 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, marginBottom: 2 }}>
                            <span style={{ color: "#777", fontWeight: 500, width: 56 }}>{labels[i] ?? ""}</span>
                            <span style={{ flex: 1, height: 6, background: "rgba(0,0,0,.06)", borderRadius: 3, overflow: "hidden", margin: "0 10px" }}>
                              <span style={{ display: "block", height: "100%", width: `${barPct}%`, background: "#4a6741", borderRadius: 3, transition: "width .4s" }} />
                            </span>
                            <span style={{ fontWeight: 600, color: "#4a6741", width: 60, textAlign: "right", fontSize: 11 }}>{Math.round(m).toLocaleString("fr-FR")}{"\u20AC"}</span>
                            <span style={{ width: 50, textAlign: "right", fontSize: 10, fontWeight: 600, color: tmColor }}>{(tm * 100).toFixed(1)}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
              );
            })()}

            {/* Hourly distribution (daily_sales source with product data) */}
            {dataSource === "daily_sales" && W.hourly_totals && W.hourly_totals.some(v => v > 0) && (() => {
              const h = W.hourly_totals!;
              const maxH = Math.max(...h, 1);
              // Show hours with activity — find first/last non-zero, with padding
              let startH = h.findIndex(v => v > 0);
              let endH = h.length - 1 - [...h].reverse().findIndex(v => v > 0) + 1;
              if (startH < 0) { startH = 10; endH = 22; }
              startH = Math.max(0, startH - 1);
              endH = Math.min(24, endH + 1);
              return (
                <div style={S.card}>
                  <div style={S.sec}>Repartition horaire des ventes (articles)</div>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 120, padding: "0 4px" }}>
                    {Array.from({ length: endH - startH }, (_, i) => {
                      const hour = startH + i;
                      const val = h[hour] || 0;
                      const pct = maxH > 0 ? val / maxH * 100 : 0;
                      return (
                        <div key={hour} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: "flex-end" }}>
                          <div style={{ width: "100%", maxWidth: 32, height: `${Math.max(pct, 2)}%`, background: val > 0 ? accent : "#ddd6c8", borderRadius: "3px 3px 0 0", transition: "height .4s", minHeight: 2, opacity: val > 0 ? 0.4 + 0.6 * (pct / 100) : 0.3 }} title={`${hour}h: ${Math.round(val)} articles`} />
                          <div style={{ fontSize: 8, color: "#999", marginTop: 3 }}>{hour}h</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Upsell ratios */}
            {W.ratios.anti.tables > 0 && <div style={S.card}>
              <div style={S.sec}>Upsell · performance de la periode</div>
              <div className="ventes-upsell-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
                <UpsellCard label="Antipasti" emoji="🥗" data={W.ratios.anti} totalTables={W.tickets} totalCov={W.couverts} color="#D4775A" targets={{ ok: 30, good: 50, avgPrice: 12 }} mode={mode} action="Suggerer en debut de service" onClick={() => setExpandedCat(expandedCat === "Antipasti" ? null : "Antipasti")} active={expandedCat === "Antipasti"} />
                <UpsellCard label="Desserts" emoji="🍮" data={W.ratios.dolci} totalTables={W.tickets} totalCov={W.couverts} color="#b5904a" targets={{ ok: 80, good: 100, avgPrice: 9 }} mode={mode} action="Proposer systematiquement en fin de plat" onClick={() => setExpandedCat(expandedCat === "Dolci" ? null : "Dolci")} active={expandedCat === "Dolci"} />
                <UpsellCard label="Vins" emoji="🍷" data={W.ratios.vin} totalTables={W.tickets} totalCov={W.couverts} color="#7c5c3a" targets={{ ok: 60, good: 80, avgPrice: 6 }} mode={mode} action="Suggerer un verre a l'ouverture du menu" onClick={() => setExpandedCat(expandedCat === "Vins" ? null : "Vins")} active={expandedCat === "Vins"} />
              </div>
              <div className="ventes-upsell-mini-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14 }}>
                <UpsellCardMini label="Alcool (hors vin)" emoji="🍹" data={W.ratios.alcool} totalTables={W.tickets} color="#c15f2e" mode={mode} onClick={() => setExpandedCat(expandedCat === "Alcool" ? null : "Alcool")} active={expandedCat === "Alcool"} />
                <UpsellCardMini label="Boissons (tout)" emoji="🥤" data={W.ratios.boissons} totalTables={W.tickets} color="#5e7a8a" mode={mode} onClick={() => setExpandedCat(expandedCat === "Boissons" ? null : "Boissons")} active={expandedCat === "Boissons"} />
                <UpsellCardMini label="Cafe / Chaud" emoji="☕" data={W.ratios.cafe} totalTables={W.tickets} color="#6f5c3a" mode={mode} onClick={() => setExpandedCat(expandedCat === "Boissons chaudes" ? null : "Boissons chaudes")} active={expandedCat === "Boissons chaudes"} />
                <UpsellCardMini label="Digestifs" emoji="🥃" data={W.ratios.digestif} totalTables={W.tickets} color="#46655a" mode={mode} onClick={() => setExpandedCat(expandedCat === "Digestifs" ? null : "Digestifs")} active={expandedCat === "Digestifs"} />
              </div>
              {/* Expanded category detail */}
              {expandedCat && W.cat_products[expandedCat] && (() => {
                const products = W.cat_products[expandedCat];
                const totalCA = products.reduce((s, p) => s + (mode === "ttc" ? p.ca_ttc : p.ca_ht), 0);
                const totalQty = products.reduce((s, p) => s + p.qty, 0);
                return (
                  <div style={{ marginTop: 14, borderTop: "2px solid rgba(0,0,0,0.06)", paddingTop: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                      <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#777" }}>
                        Detail {expandedCat}
                      </div>
                      <div style={{ display: "flex", gap: 16, fontSize: 13 }}>
                        <span style={{ color: "#777" }}>{totalQty} articles</span>
                        <span style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontWeight: 700, color: accent }}>{fmt(totalCA)}</span>
                      </div>
                    </div>
                    {products.slice(0, 15).map((p, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: i < Math.min(products.length, 15) - 1 ? "1px solid #f0ebe3" : "none" }}>
                        <span style={{ fontSize: 12, color: "#333", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.n}</span>
                        <span style={{ fontSize: 11, color: "#999", marginLeft: 8, flexShrink: 0 }}>x{p.qty}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: accent, marginLeft: 12, flexShrink: 0, fontFamily: "var(--font-oswald), Oswald, sans-serif" }}>{fmt(mode === "ttc" ? p.ca_ttc : p.ca_ht)}</span>
                      </div>
                    ))}
                    {products.length > 15 && <div style={{ fontSize: 11, color: "#999", marginTop: 6 }}>+{products.length - 15} autres produits</div>}
                  </div>
                );
              })()}
            </div>}

            {/* Duration & Rotation */}
            {W.duration && W.duration.totalOrders > 0 && (() => {
              const P = activePrev?.duration;
              return (
              <div style={S.card}>
                <div style={S.sec}>Duree & rotation des tables</div>
                {/* KPIs row */}
                <div className="ventes-duration-kpis" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
                  <div style={{ background: "#f9f6f0", borderRadius: 10, padding: "12px 14px", textAlign: "center" }}>
                    <div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 28, fontWeight: 700, color: "#D4775A" }}>{W.duration.avgDurMin}<span style={{ fontSize: 14, fontWeight: 500, color: "#777" }}>min</span></div>
                    <div style={{ fontSize: 10, color: "#777", marginTop: 4 }}>Duree moy. / table</div>
                    {P && P.avgDurMin > 0 && <DeltaBadgeSmall cur={W.duration.avgDurMin} prev={P.avgDurMin} suffix="min" inverse />}
                  </div>
                  <div style={{ background: "#f9f6f0", borderRadius: 10, padding: "12px 14px", textAlign: "center" }}>
                    <div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 28, fontWeight: 700, color: "#46655a" }}>{W.duration.avgRotation}x</div>
                    <div style={{ fontSize: 10, color: "#777", marginTop: 4 }}>Rotation moy. / table</div>
                    {P && P.avgRotation > 0 && <DeltaBadgeSmall cur={W.duration.avgRotation} prev={P.avgRotation} suffix="x" />}
                  </div>
                  <div style={{ background: "#f9f6f0", borderRadius: 10, padding: "12px 14px", textAlign: "center" }}>
                    <div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 28, fontWeight: 700, color: "#7c5c3a" }}>{W.duration.totalOrders}</div>
                    <div style={{ fontSize: 10, color: "#777", marginTop: 4 }}>Tables servies</div>
                    {P && P.totalOrders > 0 && <DeltaBadgeSmall cur={W.duration.totalOrders} prev={P.totalOrders} />}
                  </div>
                </div>
                {/* By zone */}
                <div className="ventes-duration-zones" style={{ display: "grid", gridTemplateColumns: `repeat(${W.duration.byZone.length}, 1fr)`, gap: 10, marginBottom: 10 }}>
                  {W.duration.byZone.map(z => {
                    const rot = W.duration.rotByZone.find(r => r.zone === z.zone);
                    const zKey = z.zone === "\u00C0 emporter" ? "emp" : z.zone;
                    const color = ZC[zKey] ?? "#777";
                    return (
                      <div key={z.zone} style={{ background: "#fff", borderRadius: 8, padding: "10px 12px", border: "1px solid #f0ebe3" }}>
                        <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".1em", color, fontWeight: 600, marginBottom: 6 }}>{z.zone}</div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <div>
                            <div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 20, fontWeight: 700 }}>{z.avgDur}<span style={{ fontSize: 11, color: "#777" }}>min</span></div>
                            <div style={{ fontSize: 9, color: "#777" }}>duree moy.</div>
                          </div>
                          {rot && (
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 20, fontWeight: 700, color }}>{rot.avgRotation}x</div>
                              <div style={{ fontSize: 9, color: "#777" }}>rotation</div>
                            </div>
                          )}
                        </div>
                        <div style={{ fontSize: 10, color: "#777" }}>{z.tables} tables · {z.couverts} cvts</div>
                        {rot && rot.maxRotation > 1 && (
                          <div style={{ fontSize: 10, color, fontWeight: 500, marginTop: 2 }}>max {rot.maxRotation}x rotation</div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {/* By service — Soir first, then Midi */}
                <div className="ventes-duration-svc" style={{ display: "flex", gap: 10 }}>
                  {[...W.duration.bySvc].sort((a, _b) => a.svc === "midi" ? -1 : 1).map(sv => (
                    <div key={sv.svc} style={{ flex: 1, background: "#fff", borderRadius: 8, padding: "8px 12px", border: "1px solid #f0ebe3", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: sv.svc === "midi" ? "#5e8278" : "#1a1a1a" }}>{sv.svc === "midi" ? "Midi" : "Soir"}</span>
                        <span style={{ fontSize: 10, color: "#777", marginLeft: 6 }}>{sv.tables} tables</span>
                      </div>
                      <div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 18, fontWeight: 700 }}>{sv.avgDur}<span style={{ fontSize: 10, color: "#777" }}>min</span></div>
                    </div>
                  ))}
                </div>
              </div>
              );
            })()}

            {/* Sur place vs emporter */}
            {(W.place_emp_ttc > 0 || W.cov_emp > 0) && <div style={S.card}>
              <div style={S.sec}>Sur place vs a emporter</div>
              <div className="ventes-place-row" style={{ display: "flex", gap: 0 }}>
                {(() => {
                  const surCA = mode === "ttc" ? W.place_sur_ttc : W.place_sur_ht;
                  const empCA = mode === "ttc" ? W.place_emp_ttc : W.place_emp_ht;
                  const tot = surCA + empCA;
                  return (<>
                    <PlaceBlock label="Sur place" color="#46655a" ca={surCA} pct={tot > 0 ? Math.round(surCA / tot * 100) : 0} couverts={W.cov_sur} tm={W.cov_sur > 0 ? (surCA / W.cov_sur).toFixed(1) : "0"} onClick={() => setPlaceDetail(placeDetail === "sur" ? null : "sur")} active={placeDetail === "sur"} />
                    <div style={{ width: 1, background: "rgba(0,0,0,.08)", margin: "0 20px", flexShrink: 0 }} />
                    <PlaceBlock label="A emporter" color="#D4775A" ca={empCA} pct={tot > 0 ? Math.round(empCA / tot * 100) : 0} couverts={W.cov_emp} tm={W.cov_emp > 0 ? (empCA / W.cov_emp).toFixed(1) : "0"} onClick={() => setPlaceDetail(placeDetail === "emp" ? null : "emp")} active={placeDetail === "emp"} />
                  </>);
                })()}
              </div>
              {/* Detail produits par zone */}
              {placeDetail && (() => {
                const prods = placeDetail === "sur" ? W.cat_products_sur : W.cat_products_emp;
                const color = placeDetail === "sur" ? "#46655a" : "#D4775A";
                const label = placeDetail === "sur" ? "Sur place" : "A emporter";
                const cats = Object.entries(prods ?? {}).filter(([, p]) => p.length > 0).sort((a, b) => {
                  const aTotal = a[1].reduce((s, p) => s + (mode === "ttc" ? p.ca_ttc : p.ca_ht), 0);
                  const bTotal = b[1].reduce((s, p) => s + (mode === "ttc" ? p.ca_ttc : p.ca_ht), 0);
                  return bTotal - aTotal;
                });
                if (cats.length === 0) return null;
                return (
                  <div style={{ marginTop: 14, borderTop: `2px solid ${color}20`, paddingTop: 14 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".12em", color, marginBottom: 12 }}>
                      Detail {label}
                    </div>
                    {cats.map(([cat, items]) => {
                      const catTotal = items.reduce((s, p) => s + (mode === "ttc" ? p.ca_ttc : p.ca_ht), 0);
                      const catQty = items.reduce((s, p) => s + p.qty, 0);
                      return (
                      <div key={cat} style={{ marginBottom: 14 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: "#1a1a1a", textTransform: "uppercase", letterSpacing: ".05em" }}>{cat}</span>
                          <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
                            <span style={{ fontSize: 10, color: "#999" }}>{catQty} art.</span>
                            <span style={{ fontSize: 12, fontWeight: 700, color, fontFamily: "var(--font-oswald), Oswald, sans-serif" }}>{fmt(catTotal)}</span>
                          </span>
                        </div>
                        {items.slice(0, 10).map((p, i) => (
                          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", borderBottom: i < Math.min(items.length, 10) - 1 ? "1px solid #f0ebe3" : "none" }}>
                            <span style={{ fontSize: 12, color: "#333", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.n}</span>
                            <span style={{ fontSize: 11, color: "#999", marginLeft: 8, flexShrink: 0 }}>x{p.qty}</span>
                            <span style={{ fontSize: 12, fontWeight: 700, color, marginLeft: 12, flexShrink: 0, fontFamily: "var(--font-oswald), Oswald, sans-serif" }}>{fmt(mode === "ttc" ? p.ca_ttc : p.ca_ht)}</span>
                          </div>
                        ))}
                        {items.length > 10 && <div style={{ fontSize: 11, color: "#999", marginTop: 4 }}>+{items.length - 10} autres</div>}
                      </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>}

            {/* Zones */}
            {W.days.length > 0 && (() => {
              const zones = mode === "ttc" ? W.zones_ttc : W.zones_ht;
              const activeZones = Object.entries(zones).filter(([, vals]) => vals.some(v => v > 0));
              const totalCA = activeZones.reduce((s, [, vals]) => s + vals.reduce((a, b) => a + b, 0), 0);
              const zoneBuckets = W.dates.length > 14 ? buildWeekBuckets(W.dates) : null;
              const cols = Math.min(activeZones.length, 4);

              return (
              <div className="ventes-zone-grid" style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 10, marginBottom: 6 }}>
                {activeZones.map(([zone, vals]) => {
                  const tot = vals.reduce((a, b) => a + b, 0);
                  const zKey = zone === "\u00C0 emporter" ? "emp" : zone;
                  const color = ZC[zKey] ?? "#888";
                  const pctCA = totalCA > 0 ? Math.round(tot / totalCA * 100) : 0;
                  const rawVals = zoneBuckets ? sumByBuckets(vals, zoneBuckets) : vals;
                  const rawLabels = zoneBuckets ? zoneBuckets.map(b => b.label) : W.days.map(d => d.slice(0, 3));
                  // Filter out days with 0 CA
                  const displayVals: number[] = [];
                  const displayLabels: string[] = [];
                  for (let fi = 0; fi < rawVals.length; fi++) {
                    if (rawVals[fi] > 0) { displayVals.push(rawVals[fi]); displayLabels.push(rawLabels[fi] ?? ""); }
                  }
                  const maxDay = Math.max(...displayVals, 1);

                  const isActive = zoneDetail === zone;
                  return (
                    <div key={zone} onClick={() => setZoneDetail(isActive ? null : zone)} style={{ background: "#fff", border: isActive ? `1.5px solid ${color}50` : "1px solid #e0d8ce", borderRadius: 12, padding: "14px 16px", cursor: "pointer", transition: "all 0.15s" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color, marginBottom: 8 }}>{zone}</div>
                      <div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 22, fontWeight: 700, color, lineHeight: 1, marginBottom: 2 }}>{fmt(tot)}</div>
                      <div style={{ fontSize: 10, color: "#777", marginBottom: 10 }}>{pctCA}% du CA</div>
                      {displayVals.map((v, di) => {
                        const dayLabel = displayLabels[di] ?? "";
                        const barPct = maxDay > 0 ? Math.round(v / maxDay * 100) : 0;
                        return (
                          <div key={di} style={{ marginBottom: 6 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, marginBottom: 2 }}>
                              <span style={{ color: "#777", fontWeight: 500 }}>{dayLabel}</span>
                              <span style={{ fontWeight: 600, color: v > 0 ? "#1a1a1a" : "#ccc" }}>{v > 0 ? fmt(v) : "\u2014"}</span>
                            </div>
                            <div style={{ height: 4, background: "rgba(0,0,0,.06)", borderRadius: 2, overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${barPct}%`, background: color, borderRadius: 2, transition: "width .4s" }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
              );
            })()}

            {/* Detail zone */}
            {zoneDetail && W.cat_products_zones && (() => {
              const prods = W.cat_products_zones[zoneDetail];
              if (!prods) return null;
              const zKey = zoneDetail === "\u00C0 emporter" ? "emp" : zoneDetail;
              const color = ZC[zKey] ?? "#888";
              const cats = Object.entries(prods).filter(([, p]) => p.length > 0).sort((a, b) => {
                const aTotal = a[1].reduce((s: number, p: { ca_ttc: number; ca_ht: number }) => s + (mode === "ttc" ? p.ca_ttc : p.ca_ht), 0);
                const bTotal = b[1].reduce((s: number, p: { ca_ttc: number; ca_ht: number }) => s + (mode === "ttc" ? p.ca_ttc : p.ca_ht), 0);
                return bTotal - aTotal;
              });
              if (cats.length === 0) return null;
              return (
                <div style={{ ...S.card, marginTop: 10, borderLeft: `3px solid ${color}` }}>
                  <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".12em", color, marginBottom: 12 }}>
                    Detail {zoneDetail}
                  </div>
                  {cats.map(([cat, items]) => {
                    const catTotal = items.reduce((s: number, p: { ca_ttc: number; ca_ht: number }) => s + (mode === "ttc" ? p.ca_ttc : p.ca_ht), 0);
                    const catQty = items.reduce((s: number, p: { qty: number }) => s + p.qty, 0);
                    return (
                    <div key={cat} style={{ marginBottom: 14 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#1a1a1a", textTransform: "uppercase", letterSpacing: ".05em" }}>{cat}</span>
                        <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
                          <span style={{ fontSize: 10, color: "#999" }}>{catQty} art.</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color, fontFamily: "var(--font-oswald), Oswald, sans-serif" }}>{fmt(catTotal)}</span>
                        </span>
                      </div>
                      {items.slice(0, 10).map((p: { n: string; qty: number; ca_ttc: number; ca_ht: number }, i: number) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", borderBottom: i < Math.min(items.length, 10) - 1 ? "1px solid #f0ebe3" : "none" }}>
                          <span style={{ fontSize: 12, color: "#333", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.n}</span>
                          <span style={{ fontSize: 11, color: "#999", marginLeft: 8, flexShrink: 0 }}>x{p.qty}</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color, marginLeft: 12, flexShrink: 0, fontFamily: "var(--font-oswald), Oswald, sans-serif" }}>{fmt(mode === "ttc" ? p.ca_ttc : p.ca_ht)}</span>
                        </div>
                      ))}
                      {items.length > 10 && <div style={{ fontSize: 11, color: "#999", marginTop: 4 }}>+{items.length - 10} autres</div>}
                    </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* Comparatif A-1 */}
            {activePrev && W.days.length > 1 && (() => {
              const compBuckets = W.dates.length > 14 ? buildWeekBuckets(W.dates) : null;
              const curDayVals = mode === "ttc" ? W.day_ttc : W.day_ht;
              const prevDayVals = mode === "ttc" ? activePrev!.day_ttc : activePrev!.day_ht;
              const rawCompLabels = compBuckets ? compBuckets.map(b => b.label) : W.days;
              const rawCompCur = compBuckets ? sumByBuckets(curDayVals, compBuckets) : curDayVals;
              const rawCompPrev = compBuckets ? sumByBuckets(prevDayVals, compBuckets) : prevDayVals;
              // Filter out entries where current CA is 0
              const compLabels: string[] = [];
              const compCur: number[] = [];
              const compPrev: number[] = [];
              for (let fi = 0; fi < rawCompCur.length; fi++) {
                if (rawCompCur[fi] > 0) {
                  compLabels.push(rawCompLabels[fi] ?? "");
                  compCur.push(rawCompCur[fi]);
                  compPrev.push(rawCompPrev[fi] ?? 0);
                }
              }
              const compMax = Math.max(...compCur, ...compPrev);
              return (
              <div style={S.card}>
                <div style={S.sec}>Comparatif · CA {mode.toUpperCase()} {W.dates.length > 14 ? "par semaine" : "par jour"} vs A-1</div>
                <div className="ventes-comparatif-legend" style={{ marginBottom: 8, display: "flex", gap: 16 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#777" }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: accent }} /> {new Date(from + "T12:00:00").getFullYear()} (courante)
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#777" }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: "#46655a" }} /> {new Date(from + "T12:00:00").getFullYear() - 1} (A-1)
                  </span>
                </div>
                {compLabels.map((d, i) => {
                  const cur = compCur[i] ?? 0;
                  const prevDay = compPrev[i] ?? 0;
                  const diff = cur - prevDay;
                  return (
                    <div key={d} style={{ marginBottom: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3, fontSize: 11 }}>
                        <span style={{ width: 72, fontWeight: 500 }}>{compBuckets ? d : d}</span>
                        <div style={{ flex: 1, height: 10, background: `${accent}22`, borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${compMax ? cur / compMax * 100 : 0}%`, background: accent, borderRadius: 3 }} />
                        </div>
                        <span style={{ width: 58, textAlign: "right", fontWeight: 600, color: accent, fontSize: 11 }}>{fmt(cur)}</span>
                        <span style={{ width: 62, textAlign: "right", fontSize: 10, fontWeight: 500, color: diff >= 0 ? "#2e7d32" : "#c62828" }}>
                          {diff >= 0 ? "+" : ""}{fmt(Math.abs(diff))}
                        </span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
                        <span style={{ width: 72, fontSize: 10, color: "#777" }}>A-1</span>
                        <div style={{ flex: 1, height: 7, background: "rgba(70,101,90,.12)", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${compMax ? prevDay / compMax * 100 : 0}%`, background: "#46655a", opacity: .6, borderRadius: 3 }} />
                        </div>
                        <span style={{ width: 58, textAlign: "right", color: "#777", fontSize: 11 }}>{prevDay > 0 ? fmt(prevDay) : "\u2014"}</span>
                        <span style={{ width: 62 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              );
            })()}

            {/* Recap table */}
            {W.services.length > 0 && (
              <div style={S.card}>
                <div style={S.sec}>Par service · {mode.toUpperCase()} · couverts</div>
                <div className="ventes-recap-wrap" style={{ overflow: "hidden", borderRadius: 8, border: "1px solid #e0d8ce" }}>
                  <RecapTable services={W.services} mode={mode} meteo={meteo} dates={W.dates} days={W.days} useWeeks={W.dates.length > 14} />
                </div>
              </div>
            )}

            {/* Top 10 */}
            {W.top10_names.length > 0 && (
            <div style={S.card}>
              <div style={S.sec}>Top 10 produits{dataSource === "daily_sales" ? " (articles vendus)" : ` · CA ${mode.toUpperCase()}`}</div>
              <ChartCanvas id="top10" height={380} data={W} mode={mode} type="top10" />
            </div>
            )}

            {/* Top 3 par categorie */}
            {W.top3_cats.length > 0 && (
              <div style={S.card}>
                <div style={S.sec}>Top 3 par categorie · CA {mode.toUpperCase()}</div>
                <div className="ventes-top3-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                  {W.top3_cats.filter(c => !c.cat.toLowerCase().includes("bambini")).map((cat, ci) => (
                    <div key={ci} style={{ background: "#fff", borderRadius: 10, padding: "12px 14px", border: "1px solid rgba(0,0,0,.08)" }}>
                      <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".1em", color: getCategoryColor(cat.cat, ci), fontWeight: 600, marginBottom: 8 }}>{cat.cat}</div>
                      {cat.rows.map((r, ri) => (
                        <div key={ri} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: "1px solid rgba(0,0,0,.04)", fontSize: 11 }}>
                          <span><span style={{ fontSize: 9, color: "#bbb", marginRight: 4 }}>{ri + 1}</span>{r.n}</span>
                          <span style={{ fontFamily: "var(--font-cormorant), Cormorant Garamond, serif", fontSize: 13, fontWeight: 600, color: accent }}>{mode === "ttc" ? r.ca_ttc : r.ca_ht}</span>
                        </div>
                      ))}
                      {cat.flop && (
                        <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0 2px", marginTop: 4, borderTop: "1px dashed rgba(0,0,0,.08)", fontSize: 11 }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ fontSize: 9, color: "#c62828", fontWeight: 600 }}>▼</span><span style={{ color: "#777" }}>{cat.flop.n}</span></span>
                          <span style={{ fontFamily: "var(--font-cormorant), Cormorant Garamond, serif", fontSize: 13, fontWeight: 600, color: "#777" }}>{mode === "ttc" ? cat.flop.ca_ttc : cat.flop.ca_ht}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Ventes par categorie */}
            {W.mix_labels.length > 0 && <div style={S.card}>
              <div style={{ ...S.sec, marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Ventes par categorie · CA {mode.toUpperCase()}</span>
                <span style={{ fontSize: 10, color: "#777", fontStyle: "italic", textTransform: "none", letterSpacing: 0 }}>Cliquer une barre pour le detail</span>
              </div>
              <ChartCanvas id="mix" height={220} data={W} mode={mode} type="mix" onBarClick={(label, color) => setMixDDOpen({ label, color })} />
              {mixDDOpen && W.cat_products[mixDDOpen.label] && (
                <MixDropdown label={mixDDOpen.label} color={mixDDOpen.color} products={W.cat_products[mixDDOpen.label]} onClose={() => setMixDDOpen(null)} mode={mode} />
              )}
            </div>}

            {/* Tendances par categorie */}
            <div style={S.card}>
              <div style={S.sec}>Tendances {catTrendFilterProd ? `· ${catTrendFilterProd}` : catTrendFilterCat ? `· ${catTrendFilterCat}` : "par categorie"}</div>

              {/* Category + Product selectors */}
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <select
                  value={catTrendFilterCat ?? ""}
                  onChange={(e) => {
                    const v = e.target.value || null;
                    setCatTrendFilterCat(v);
                    setCatTrendFilterProd(null);
                  }}
                  style={{ flex: 1, height: 36, borderRadius: 10, border: "1px solid #e0d8ce", padding: "0 10px", fontSize: 12, background: "#fff", color: "#1a1a1a", cursor: "pointer" }}
                >
                  <option value="">Toutes les categories</option>
                  {catTrendData && Object.keys(catTrendData).sort().map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                {catTrendFilterCat && data && (
                  <select
                    value={catTrendFilterProd ?? ""}
                    onChange={(e) => setCatTrendFilterProd(e.target.value || null)}
                    style={{ flex: 1, height: 36, borderRadius: 10, border: "1px solid #e0d8ce", padding: "0 10px", fontSize: 12, background: "#fff", color: "#1a1a1a", cursor: "pointer" }}
                  >
                    <option value="">Tous les produits</option>
                    {(data.cat_products[catTrendFilterCat] ?? [])
                      .sort((a, b) => b.ca_ttc - a.ca_ttc)
                      .map(p => (
                        <option key={p.n} value={p.n}>{p.n}</option>
                      ))}
                  </select>
                )}
              </div>

              {/* Date range + metric toggle */}
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <input type="date" value={catTrendFrom} onChange={e => setCatTrendFrom(e.target.value)} style={{ fontSize: 11, border: "1px solid #e0d8ce", borderRadius: 6, padding: "3px 6px", color: "#555" }} />
                  <span style={{ fontSize: 10, color: "#999" }}>-</span>
                  <input type="date" value={catTrendTo} onChange={e => setCatTrendTo(e.target.value)} style={{ fontSize: 11, border: "1px solid #e0d8ce", borderRadius: 6, padding: "3px 6px", color: "#555" }} />
                </div>
                <div style={{ display: "flex", gap: 0, background: "#f5f0e8", borderRadius: 20, padding: 3, marginLeft: "auto" }}>
                  <button type="button" onClick={() => setCatTrendMetric("ca_ttc")} style={{
                    padding: "4px 12px", borderRadius: 16, border: "none", cursor: "pointer",
                    background: catTrendMetric === "ca_ttc" ? accent : "transparent",
                    color: catTrendMetric === "ca_ttc" ? "#fff" : "#777",
                    fontSize: 11, fontWeight: 500,
                  }}>CA TTC</button>
                  <button type="button" onClick={() => setCatTrendMetric("qty")} style={{
                    padding: "4px 12px", borderRadius: 16, border: "none", cursor: "pointer",
                    background: catTrendMetric === "qty" ? accent : "transparent",
                    color: catTrendMetric === "qty" ? "#fff" : "#777",
                    fontSize: 11, fontWeight: 500,
                  }}>Quantite</button>
                </div>
              </div>
              {/* Chart or loading */}
              {catTrendLoading && (
                <div style={{ padding: "40px 0", textAlign: "center", color: "#999", fontSize: 12 }}>Chargement...</div>
              )}
              {!catTrendLoading && catTrendData && Object.keys(catTrendData).length > 0 && (
                <>
                  <div style={{ position: "relative", height: 320 }}><canvas ref={catTrendChartRef} /></div>
                  {/* Summary line */}
                  <div style={{ marginTop: 10, fontSize: 12, color: "#777", textAlign: "right" }}>
                    Total periode : <strong style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", color: "#1a1a1a" }}>
                      {catTrendMetric === "ca_ttc"
                        ? fmt(Object.values(catTrendData).reduce((s, daily) => s + daily.reduce((ss, d) => ss + d.ca_ttc, 0), 0))
                        : Math.round(Object.values(catTrendData).reduce((s, daily) => s + daily.reduce((ss, d) => ss + d.qty, 0), 0)).toLocaleString("fr-FR")
                      }
                    </strong>
                  </div>
                </>
              )}
              {!catTrendLoading && (!catTrendData || Object.keys(catTrendData).length === 0) && (
                <div style={{ padding: "40px 0", textAlign: "center", color: "#bbb", fontSize: 12 }}>Aucune donnee sur cette periode</div>
              )}
            </div>

            {/* Serveurs */}
            {W.serveurs.length > 0 && (
              <div style={S.card}>
                <div style={S.sec}>Performance serveurs · CA {mode.toUpperCase()}</div>
                <ChartCanvas id="serv" height={Math.max(120, W.serveurs.length * 38)} data={W} mode={mode} type="serv" />
              </div>
            )}

            {/* Paiements */}
            {W.pay && W.pay.length > 0 && (
              <div style={S.card}>
                <div style={S.sec}>Modes de paiement</div>
                <div className="ventes-payment-grid" style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 20, alignItems: "center" }}>
                  <ChartCanvas id="payChart" height={140} data={W} mode={mode} type="pay" />
                  <div>
                    {W.pay.map((p, i) => {
                      const colors = ["#c8960a", "#e0b020", "#f0c840", "#f5d96a", "#f9e9a0"];
                      return (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: "1px solid rgba(0,0,0,.05)" }}>
                          <div style={{ width: 8, height: 8, borderRadius: "50%", background: colors[i % colors.length], flexShrink: 0 }} />
                          <div style={{ flex: 1, fontSize: 12, color: "#777" }}>{p.l}</div>
                          <div style={{ fontFamily: "var(--font-cormorant), Cormorant Garamond, serif", fontSize: 15, fontWeight: 600 }}>{fmt(p.v)}</div>
                          <div style={{ width: 28, textAlign: "right", fontSize: 10, color: "#777" }}>{p.pct}%</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Points briefing IA */}
            <div style={{
              background: "#fff", borderRadius: 12, padding: "18px 20px",
              border: "1px solid #e0d8ce", borderLeft: `4px solid ${accent}`,
              marginBottom: 14,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{
                  fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 11, fontWeight: 700,
                  letterSpacing: ".1em", textTransform: "uppercase", color: accent,
                }}>
                  Points briefing {isSingleDay ? "du jour" : "de la periode"}
                </div>
                <button
                  type="button"
                  onClick={generateBriefing}
                  disabled={briefingLoading}
                  style={{
                    padding: "5px 14px", borderRadius: 8, border: "none",
                    background: accent, color: "#fff", fontSize: 11, fontWeight: 700,
                    cursor: "pointer", opacity: briefingLoading ? 0.5 : 1,
                  }}
                >
                  {briefingLoading ? "Analyse..." : briefing ? "Regenerer" : "Generer avec l'IA"}
                </button>
              </div>
              {briefingLoading && (
                <div style={{ padding: "20px 0", textAlign: "center", color: "#999", fontSize: 12 }}>
                  <div style={{ animation: "pulse 1.5s infinite", marginBottom: 8 }}>Analyse des donnees en cours...</div>
                </div>
              )}
              {briefing && !briefingLoading && (
                <div>
                  {briefing.map((point, i) => (
                    <div key={i} style={{
                      display: "flex", gap: 12, padding: "9px 0",
                      borderBottom: i < briefing.length - 1 ? "1px solid #f0ebe3" : "none",
                      fontSize: 12, lineHeight: 1.65, color: "#333",
                    }}>
                      <span style={{
                        fontFamily: "var(--font-oswald), Oswald, sans-serif",
                        fontSize: 12, fontWeight: 700, color: accent, minWidth: 20,
                      }}>
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span dangerouslySetInnerHTML={{ __html: point }} />
                    </div>
                  ))}
                </div>
              )}
              {!briefing && !briefingLoading && (
                <div style={{ padding: "12px 0", textAlign: "center", color: "#bbb", fontSize: 12 }}>
                  Cliquez pour generer les points briefing avec l&apos;IA
                </div>
              )}
            </div>
          </>
        )}
      </div>

    </RequireRole>
  );
}

/* ── Sub-components ── */

function DeltaBadgeSmall({ cur, prev, suffix = "", inverse = false }: { cur: number; prev: number; suffix?: string; inverse?: boolean }) {
  const d = cur - prev;
  const pct = prev > 0 ? (d / prev * 100) : 0;
  const good = inverse ? d <= 0 : d >= 0;
  return (
    <div style={{ fontSize: 10, marginTop: 4, fontWeight: 500, color: good ? "#2e7d32" : "#c62828" }}>
      {d >= 0 ? "\u2191 +" : "\u2193 "}{Math.abs(d).toFixed(d % 1 !== 0 ? 1 : 0)}{suffix} ({Math.abs(pct).toFixed(1)}%)
      <span style={{ color: "#bbb", fontWeight: 400 }}> vs A-1</span>
    </div>
  );
}

function DeltaBadge({ cur, prev, decimals = 0, suffix = "" }: { cur: number; prev: number; decimals?: number; suffix?: string }) {
  const d = cur - prev;
  const pct = prev > 0 ? (d / prev * 100) : 0;
  const up = d >= 0;
  const val = decimals > 0 ? Math.abs(d).toFixed(decimals) : Math.round(Math.abs(d)).toLocaleString("fr-FR");
  return (
    <div style={{ fontSize: 10, color: up ? "#a5d6a7" : "#fca5a5", marginTop: 2, fontWeight: 500 }}>
      {up ? "\u2191 +" : "\u2193 "}{val}{suffix} ({Math.abs(pct).toFixed(1)}%)
    </div>
  );
}

type UpsellData = { tables: number; coverts: number; ca_ttc: number; ca_ht: number };

function UpsellCard({ label, emoji, data, totalTables, totalCov, color, targets, mode, action, onClick, active }: {
  label: string; emoji: string; data: UpsellData; totalTables: number; totalCov: number; color: string;
  targets: { ok: number; good: number; avgPrice: number }; mode: string; action: string;
  onClick?: () => void; active?: boolean;
}) {
  const pct = totalTables > 0 ? Math.round(data.tables / totalTables * 100) : 0;
  const pctCov = totalCov > 0 ? Math.round(data.coverts / totalCov * 100) : 0;
  const missing = Math.max(0, totalTables - data.tables);
  const gain = missing * targets.avgPrice;
  const ca = mode === "ttc" ? data.ca_ttc : data.ca_ht;
  const _tmPerCov = data.coverts > 0 ? ca / data.coverts : 0;

  const status = pct >= targets.good ? { t: "\u2713 Objectif atteint", c: "#2e7d32", bg: "#e8f5e9" }
    : pct >= targets.ok ? { t: "\u2192 En progression", c: "#e65100", bg: "#fff3e0" }
    : { t: "\u2191 A travailler", c: "#c62828", bg: "#ffebee" };

  return (
    <div onClick={onClick} style={{ padding: "14px 16px", background: active ? `${color}10` : "#f9f6f0", borderRadius: 10, height: "100%", cursor: onClick ? "pointer" : "default", border: active ? `1.5px solid ${color}30` : "1.5px solid transparent", transition: "all 0.15s" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 18 }}>{emoji}</span>
        <span style={{ fontSize: 12, fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 28, fontWeight: 700, color, lineHeight: 1, marginBottom: 4 }}>{pct}%</div>
      <div style={{ fontSize: 11, color: "#777", marginBottom: 6 }}>
        des tables · <strong style={{ color: "#1a1a1a" }}>{data.coverts > 0 ? `1 cvt sur ${Math.round(totalCov / data.coverts)}` : "\u2014"}</strong>
      </div>
      {/* Tables + Couverts */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8, fontSize: 10 }}>
        <div style={{ background: "#fff", borderRadius: 6, padding: "5px 8px" }}>
          <div style={{ color: "#777" }}>Tables</div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{data.tables}<span style={{ color: "#bbb", fontWeight: 400 }}>/{totalTables}</span></div>
        </div>
        <div style={{ background: "#fff", borderRadius: 6, padding: "5px 8px" }}>
          <div style={{ color: "#777" }}>Couverts</div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{data.coverts}<span style={{ color: "#bbb", fontWeight: 400 }}> ({pctCov}%)</span></div>
        </div>
      </div>
      {/* CA + TM/couvert */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8, fontSize: 10 }}>
        <div style={{ background: "#fff", borderRadius: 6, padding: "5px 8px" }}>
          <div style={{ color: "#777" }}>CA {mode.toUpperCase()}</div>
          <div style={{ fontWeight: 700, fontSize: 13, color }}>{fmt(ca)}</div>
        </div>
        <div style={{ background: "#fff", borderRadius: 6, padding: "5px 8px" }}>
          <div style={{ color: "#777" }}>Potentiel</div>
          <div style={{ fontWeight: 700, fontSize: 13, color }}>{gain > 0 ? `+${fmt(gain)}` : "\u2014"}</div>
        </div>
      </div>
      {/* Progress bar */}
      <div style={{ position: "relative", height: 8, background: "rgba(0,0,0,.07)", borderRadius: 4, overflow: "hidden", marginBottom: 6 }}>
        <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: `${Math.min(100, pct)}%`, background: color, borderRadius: 4, transition: "width .5s" }} />
        <div style={{ position: "absolute", top: 0, left: `${targets.ok}%`, height: "100%", width: 2, background: "rgba(0,0,0,.15)" }} />
        <div style={{ position: "absolute", top: 0, left: `${Math.min(100, targets.good)}%`, height: "100%", width: 2, background: "rgba(0,0,0,.25)" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#bbb", marginBottom: 8 }}>
        <span>0%</span><span>obj. {targets.ok}%</span><span>top {targets.good}%</span>
      </div>
      <div style={{ display: "inline-block", padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 500, background: status.bg, color: status.c, marginBottom: 4 }}>{status.t}</div>
      <div style={{ fontSize: 10, color: "#777", lineHeight: 1.5, fontStyle: "italic" }}>{action}</div>
    </div>
  );
}

function UpsellCardMini({ label, emoji, data, totalTables, color, mode, onClick, active }: {
  label: string; emoji: string; data: UpsellData; totalTables: number; color: string; mode: string;
  onClick?: () => void; active?: boolean;
}) {
  const pct = totalTables > 0 ? Math.round(data.tables / totalTables * 100) : 0;
  const ca = mode === "ttc" ? data.ca_ttc : data.ca_ht;
  return (
    <div onClick={onClick} style={{ padding: "12px 14px", background: active ? `${color}10` : "#f9f6f0", borderRadius: 10, cursor: onClick ? "pointer" : "default", border: active ? `1.5px solid ${color}30` : "1.5px solid transparent", transition: "all 0.15s" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 14 }}>{emoji}</span>
        <span style={{ fontSize: 10, fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 22, fontWeight: 700, color, lineHeight: 1, marginBottom: 4 }}>{pct}%</div>
      <div style={{ fontSize: 10, color: "#777", marginBottom: 6 }}>{data.tables}/{totalTables} tables</div>
      <div style={{ height: 5, background: "rgba(0,0,0,.07)", borderRadius: 3, overflow: "hidden", marginBottom: 6 }}>
        <div style={{ height: "100%", width: `${Math.min(100, pct)}%`, background: color, borderRadius: 3 }} />
      </div>
      <div style={{ fontSize: 11, fontWeight: 600, color }}>{fmt(ca)}</div>
    </div>
  );
}

function PlaceBlock({ label, color, ca, pct, couverts, tm, onClick, active }: { label: string; color: string; ca: number; pct: number; couverts: number; tm: string; onClick?: () => void; active?: boolean }) {
  return (
    <div style={{ flex: 1, cursor: onClick ? "pointer" : "default", padding: 8, margin: -8, borderRadius: 10, background: active ? `${color}08` : "transparent", border: active ? `1.5px solid ${color}30` : "1.5px solid transparent", transition: "all 0.15s" }} onClick={onClick}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".1em", fontWeight: 600, color }}>{label}</div>
        <div style={{ fontSize: 10, color: "#777" }}>{pct}% du CA</div>
      </div>
      <div style={{ height: 4, background: "rgba(0,0,0,.06)", borderRadius: 2, overflow: "hidden", marginBottom: 14 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 2 }} />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <div style={{ minWidth: 0 }}><div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 18, fontWeight: 700 }}>{fmt(ca)}</div><div style={{ fontSize: 9, color: "#777", textTransform: "uppercase", marginTop: 2 }}>CA</div></div>
        <div style={{ minWidth: 0 }}><div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 18, fontWeight: 700 }}>{couverts}</div><div style={{ fontSize: 9, color: "#777", textTransform: "uppercase", marginTop: 2 }}>CVT</div></div>
        <div style={{ minWidth: 0 }}><div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 18, fontWeight: 700, color }}>{tm + "\u20AC"}</div><div style={{ fontSize: 9, color: "#777", textTransform: "uppercase", marginTop: 2 }}>TM</div></div>
      </div>
    </div>
  );
}

function RecapTable({ services, mode, meteo, dates, days, useWeeks: useWeeksProp }: { services: WeekData["services"]; mode: "ttc" | "ht"; meteo: Record<string, { emoji: string; desc: string; temp: number }>; dates: string[]; days: string[]; useWeeks: boolean }) {
  // Map day name → date for meteo lookup (simple 1:1 for jour/semaine views)
  const dayToDate: Record<string, string> = {};
  for (let i = 0; i < days.length; i++) {
    if (days[i] && dates[i]) dayToDate[days[i]] = dates[i];
  }

  // Build per-service date mapping: services are emitted in date order (midi, soir per date).
  // For monthly view we need to know which date each service belongs to, since the same day name
  // (e.g. "Lundi") appears multiple times. We match by consuming dates in order.
  const serviceDateMap: string[] = []; // serviceDateMap[i] = ISO date for services[i]
  {
    let dateIdx = 0;
    for (let si = 0; si < services.length; si++) {
      const s = services[si];
      // Advance dateIdx to find the date whose day name matches s.jour
      // (services come in date order, so we only advance forward)
      while (dateIdx < dates.length && days[dateIdx] !== s.jour) {
        dateIdx++;
      }
      serviceDateMap[si] = dates[dateIdx] ?? "";
      // If next service has a different jour or different svc, we may need to advance.
      // But if next service is same jour (e.g. soir after midi), keep same dateIdx.
      const next = services[si + 1];
      if (next && next.jour !== s.jour) {
        dateIdx++;
      }
    }
  }

  // Group services by week when in monthly view
  const useWeeks = useWeeksProp;
  type GroupEntry = { groupLabel: string; services: WeekData["services"] };
  const groups: GroupEntry[] = [];

  if (useWeeks) {
    const weekBuckets = buildWeekBuckets(dates);
    const dateToWeek: Record<string, string> = {};
    for (const b of weekBuckets) {
      for (const idx of b.indices) {
        if (dates[idx]) dateToWeek[dates[idx]] = b.label;
      }
    }
    // Group services by week, then aggregate into midi/soir totals
    const weekMap: Record<string, WeekData["services"]> = {};
    const weekOrder: string[] = [];
    for (let si = 0; si < services.length; si++) {
      const s = services[si];
      const date = serviceDateMap[si];
      const wk = date ? (dateToWeek[date] ?? s.jour) : s.jour;
      if (!weekMap[wk]) { weekMap[wk] = []; weekOrder.push(wk); }
      weekMap[wk].push(s);
    }
    for (const wk of weekOrder) {
      const svcs = weekMap[wk];
      const midiSvcs = svcs.filter(s => s.svc === "midi");
      const soirSvcs = svcs.filter(s => s.svc !== "midi");
      const aggregated: WeekData["services"] = [];
      const sumZones = (arr: WeekData["services"], key: "z_ttc" | "z_ht") => {
        const result: Record<string, number> = {};
        for (const s of arr) {
          for (const [zn, zv] of Object.entries(s[key] ?? {})) {
            result[zn] = (result[zn] ?? 0) + zv;
          }
        }
        return result;
      };
      if (midiSvcs.length > 0) {
        const mTtc = midiSvcs.reduce((s, x) => s + x.ttc, 0);
        const mHt = midiSvcs.reduce((s, x) => s + x.ht, 0);
        const mCov = midiSvcs.reduce((s, x) => s + x.cov, 0);
        const mSpTtc = midiSvcs.reduce((s, x) => s + x.sp_ttc, 0);
        const mSpHt = midiSvcs.reduce((s, x) => s + x.sp_ht, 0);
        const mSpCov = midiSvcs.reduce((s, x) => s + x.sp_cov, 0);
        aggregated.push({
          jour: "Midi", svc: "midi", ttc: mTtc, ht: mHt, cov: mCov,
          tm_ttc: mCov > 0 ? mTtc / mCov : 0, tm_ht: mCov > 0 ? mHt / mCov : 0,
          sp_ttc: mSpTtc, sp_ht: mSpHt, emp_ttc: midiSvcs.reduce((s, x) => s + x.emp_ttc, 0), emp_ht: midiSvcs.reduce((s, x) => s + x.emp_ht, 0),
          sp_cov: mSpCov, tm_sp_ttc: mSpCov > 0 ? mSpTtc / mSpCov : 0, tm_sp_ht: mSpCov > 0 ? mSpHt / mSpCov : 0,
          z_ttc: sumZones(midiSvcs, "z_ttc"), z_ht: sumZones(midiSvcs, "z_ht"),
        });
      }
      if (soirSvcs.length > 0) {
        const sTtc = soirSvcs.reduce((s, x) => s + x.ttc, 0);
        const sHt = soirSvcs.reduce((s, x) => s + x.ht, 0);
        const sCov = soirSvcs.reduce((s, x) => s + x.cov, 0);
        const sSpTtc = soirSvcs.reduce((s, x) => s + x.sp_ttc, 0);
        const sSpHt = soirSvcs.reduce((s, x) => s + x.sp_ht, 0);
        const sSpCov = soirSvcs.reduce((s, x) => s + x.sp_cov, 0);
        aggregated.push({
          jour: "Soir", svc: "soir", ttc: sTtc, ht: sHt, cov: sCov,
          tm_ttc: sCov > 0 ? sTtc / sCov : 0, tm_ht: sCov > 0 ? sHt / sCov : 0,
          sp_ttc: sSpTtc, sp_ht: sSpHt, emp_ttc: soirSvcs.reduce((s, x) => s + x.emp_ttc, 0), emp_ht: soirSvcs.reduce((s, x) => s + x.emp_ht, 0),
          sp_cov: sSpCov, tm_sp_ttc: sSpCov > 0 ? sSpTtc / sSpCov : 0, tm_sp_ht: sSpCov > 0 ? sSpHt / sSpCov : 0,
          z_ttc: sumZones(soirSvcs, "z_ttc"), z_ht: sumZones(soirSvcs, "z_ht"),
        });
      }
      groups.push({ groupLabel: wk, services: aggregated });
    }
  } else {
    const byDay: Record<string, WeekData["services"]> = {};
    const dayOrder: string[] = [];
    for (const s of services) {
      if (!byDay[s.jour]) { byDay[s.jour] = []; dayOrder.push(s.jour); }
      byDay[s.jour].push(s);
    }
    for (const d of dayOrder) {
      groups.push({ groupLabel: d, services: byDay[d] });
    }
  }

  return (
    <table className="ventes-recap-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 700 }}>
      <thead>
        <tr style={{ background: "#f5f0e8" }}>
          <th style={thSt("left")}>{useWeeks ? "Sem." : "Jour"}</th>
          <th style={thSt("left")}>Svc</th>
          <th style={{ ...thSt(), color: ZC.Salle }}>Salle</th>
          <th style={{ ...thSt(), color: ZC.Pergolas }}>Pergolas</th>
          <th style={{ ...thSt(), color: ZC.Terrasse }}>Terrasse</th>
          <th style={{ ...thSt(), color: ZC.emp }}>Emp.</th>
          <th style={{ ...thSt(), color: "#D4775A" }}>Total</th>
          <th style={thSt()}>Cvts</th>
          <th style={thSt()}>CVT M SP</th>
          <th style={{ ...thSt("center"), width: 40 }}>Meteo</th>
        </tr>
      </thead>
      <tbody>
        {groups.map((group, di) => {
          const svcs = group.services;
          return svcs.map((s, si) => {
            const caVal = mode === "ttc" ? s.ttc : s.ht;
            const z = mode === "ttc" ? s.z_ttc : s.z_ht;
            const tmSp = mode === "ttc" ? s.tm_sp_ttc : s.tm_sp_ht;
            const bg = di % 2 === 0 ? "#fff" : "#faf7f2";
            const tmColor = tmSp >= 80 ? "#2e7d32" : tmSp >= 65 ? "#e65100" : "#c62828";
            const tmBg = tmSp >= 80 ? "#e8f5e9" : tmSp >= 65 ? "#fff3e0" : "#ffebee";
            return (
              <tr key={`${group.groupLabel}-${s.jour}-${s.svc}`} style={{ background: bg, borderTop: si === 0 && di > 0 ? "1px solid #e0d8ce" : si > 0 ? "1px solid rgba(0,0,0,.05)" : "none" }}>
                {si === 0 && <td rowSpan={svcs.length} style={{ padding: "0 16px", fontWeight: 700, fontSize: useWeeks ? 12 : 15, verticalAlign: "middle", borderRight: "1px solid #e0d8ce" }}>{useWeeks ? group.groupLabel : s.jour}</td>}
                <td style={tdSt}><span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: s.svc === "midi" ? ZC.Pergolas : "#1a1a1a" }}>{s.svc === "midi" ? "Midi" : "Soir"}</span></td>
                {zCell(z?.Salle, ZC.Salle)}
                {zCell(z?.Pergolas, ZC.Pergolas)}
                {zCell(z?.Terrasse, ZC.Terrasse)}
                {zCell(z?.emp, ZC.emp)}
                <td style={{ ...tdSt, fontWeight: 700, fontSize: 13, color: "#D4775A" }}>{fmt(caVal)}</td>
                <td style={{ ...tdSt, fontWeight: 600 }}>{s.cov}</td>
                <td style={tdSt}><span style={{ background: tmBg, color: tmColor, padding: "3px 9px", borderRadius: 5, fontSize: 11, fontWeight: 700 }}>{tmSp.toFixed(0)}{"\u20AC"}</span></td>
                {(() => {
                  const dateKey = dayToDate[s.jour];
                  const m = dateKey ? meteo[`${dateKey}:${s.svc}`] : null;
                  return (
                    <td style={{ ...tdSt, textAlign: "center", fontSize: 18, lineHeight: 1, padding: "8px 6px" }}>
                      {m ? <span title={`${m.desc} ${m.temp}°C`}>{m.emoji}</span> : ""}
                    </td>
                  );
                })()}
              </tr>
            );
          });
        })}
      </tbody>
    </table>
  );
}

function zCell(val: number | undefined, color: string) {
  if (!val) return <td style={{ ...tdSt, color: "rgba(0,0,0,.2)" }}>{"\u2014"}</td>;
  return <td style={{ ...tdSt, fontWeight: 600, color }}>{fmt(val)}</td>;
}

const thSt = (align: "left" | "right" | "center" = "right"): CSSProperties => ({
  fontSize: 9, textTransform: "uppercase", letterSpacing: ".1em", fontWeight: 600,
  padding: "11px 14px", textAlign: align, whiteSpace: "nowrap", borderBottom: "1px solid #e0d8ce",
  color: "#777",
});

const tdSt: CSSProperties = { padding: "13px 14px", textAlign: "right" };

function renderProductRows(
  prods: { n: string; qty: number; ca_ttc: number; ca_ht: number }[],
  getCA: (p: { ca_ttc: number; ca_ht: number }) => number,
  maxCA: number, total: number, color: string,
) {
  return prods.map((p, i) => {
    const pca = getCA(p);
    return (
      <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: "1px solid rgba(0,0,0,.04)", fontSize: 12 }}>
        <span style={{ fontSize: 10, color: "#bbb", width: 16, textAlign: "right", flexShrink: 0 }}>{i + 1}</span>
        <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.n}</span>
        <div style={{ width: 80, height: 4, background: "rgba(0,0,0,.06)", borderRadius: 2, overflow: "hidden", flexShrink: 0 }}>
          <div style={{ height: "100%", width: `${maxCA ? Math.round(pca / maxCA * 100) : 0}%`, background: color, opacity: .75, borderRadius: 2 }} />
        </div>
        <span style={{ width: 36, textAlign: "right", color: "#777", flexShrink: 0, fontSize: 10 }}>{total ? (pca / total * 100).toFixed(1) : 0}%</span>
        <span style={{ width: 55, textAlign: "right", fontWeight: 500, flexShrink: 0, fontFamily: "var(--font-cormorant), Cormorant Garamond, serif", fontSize: 14 }}>{pca.toLocaleString("fr-FR")}{"\u20AC"}</span>
        <span style={{ width: 34, textAlign: "right", color: "#bbb", flexShrink: 0, fontSize: 10 }}>{p.qty}x</span>
      </div>
    );
  });
}

function MixDropdown({ label, color, products, onClose, mode = "ttc" }: {
  label: string; color: string; products: { n: string; qty: number; ca_ttc: number; ca_ht: number }[]; onClose: () => void; mode?: "ttc" | "ht";
}) {
  const getCA = (p: { ca_ttc: number; ca_ht: number }) => mode === "ttc" ? p.ca_ttc : p.ca_ht;
  const total = products.reduce((s, p) => s + getCA(p), 0);
  const maxCA = products[0] ? getCA(products[0]) : 1;

  // For Vins: separate Verres (V. prefix) from Bouteilles (Btl. prefix)
  const isVins = label.toLowerCase().includes("vin");
  const verres = isVins ? products.filter(p => !p.n.toLowerCase().startsWith("btl")) : [];
  const bouteilles = isVins ? products.filter(p => p.n.toLowerCase().startsWith("btl")) : [];
  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(0,0,0,.08)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".1em", color }}>{label} — {products.length} produits</div>
        <button type="button" onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 16, color: "#777", padding: "0 4px" }}>&times;</button>
      </div>
      {isVins && verres.length > 0 && bouteilles.length > 0 ? (
        <>
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: "#7c5c3a", marginBottom: 4, marginTop: 4 }}>Verres</div>
          {renderProductRows(verres, getCA, maxCA, total, color)}
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: "#7c5c3a", marginBottom: 4, marginTop: 10, paddingTop: 8, borderTop: "1px solid rgba(0,0,0,.08)" }}>Bouteilles</div>
          {renderProductRows(bouteilles, getCA, maxCA, total, color)}
        </>
      ) : (
        renderProductRows(products, getCA, maxCA, total, color)
      )}
    </div>
  );
}

/* ── Chart component ── */
function ChartCanvas({ id, height, data, mode, type, onBarClick }: {
  id: string; height: number; data: WeekData; mode: "ttc" | "ht"; type: "mix" | "top10" | "serv" | "pay";
  onBarClick?: (label: string, color: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    destroyChart(id);

    if (type === "mix") {
      const vals = mode === "ttc" ? data.mix_ttc : data.mix_ht;
      const total = vals.reduce((a, b) => a + b, 0);
      charts[id] = new Chart(canvasRef.current, {
        type: "bar",
        data: { labels: data.mix_labels, datasets: [{ data: vals, backgroundColor: getCategoryColors(data.mix_labels), borderRadius: 4, borderSkipped: false }] },
        options: {
          indexAxis: "y", responsive: true, maintainAspectRatio: false,
          layout: { padding: { right: 80 } },
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${fmt(ctx.raw as number)} — ${((ctx.raw as number) / total * 100).toFixed(1)}%` } } },
          scales: {
            x: { grid: { color: "rgba(0,0,0,0.05)" }, ticks: { callback: v => fmtK(v as number), color: "#aaa", font: { size: 11 } }, border: { display: false } },
            y: { grid: { display: false }, ticks: { color: "#444", font: { size: 12 } }, border: { display: false } },
          },
          onClick: (_evt, elements) => {
            if (elements.length && onBarClick) {
              const i = elements[0].index;
              onBarClick(data.mix_labels[i], getCategoryColor(data.mix_labels[i], i));
            }
          },
        },
        plugins: [{
          id: "barLabels",
          afterDatasetsDraw(chart) {
            const ctx = chart.ctx;
            chart.data.datasets.forEach((ds, di) => {
              chart.getDatasetMeta(di).data.forEach((bar, i) => {
                const val = ds.data[i] as number;
                const pct = (val / total * 100).toFixed(0);
                ctx.save();
                ctx.font = "500 11px DM Sans, sans-serif";
                ctx.fillStyle = "#555";
                ctx.textAlign = "left";
                ctx.textBaseline = "middle";
                ctx.fillText(`${Math.round(val / 1000)}k\u20AC  ${pct}%`, bar.x + 6, bar.y);
                ctx.restore();
              });
            });
          },
        }],
      });
    }

    if (type === "top10") {
      const gradStart = [196, 90, 54], gradEnd = [240, 196, 180];
      const n = data.top10_names.length;
      const colors = data.top10_names.map((_, i) => {
        const t = n > 1 ? i / (n - 1) : 0;
        return `rgb(${Math.round(gradStart[0] + (gradEnd[0] - gradStart[0]) * t)},${Math.round(gradStart[1] + (gradEnd[1] - gradStart[1]) * t)},${Math.round(gradStart[2] + (gradEnd[2] - gradStart[2]) * t)})`;
      });
      charts[id] = new Chart(canvasRef.current, {
        type: "bar",
        data: { labels: data.top10_names, datasets: [{ data: mode === "ttc" ? data.top10_ca_ttc : data.top10_ca_ht, backgroundColor: colors, borderRadius: 4 }] },
        options: {
          indexAxis: "y", responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `CA : ${(ctx.raw as number).toLocaleString("fr-FR")}\u20AC \u00b7 ${data.top10_qty[ctx.dataIndex]} ventes` } } },
          scales: {
            x: { grid: { color: "rgba(0,0,0,0.05)" }, ticks: { callback: v => v + "\u20AC", color: "#aaa", font: { size: 11 } }, border: { display: false } },
            y: { grid: { display: false }, ticks: { color: "#444", font: { size: 11 } }, border: { display: false } },
          },
        },
      });
    }

    if (type === "serv") {
      const gradStart = [46, 101, 90], gradEnd = [155, 195, 185];
      const n = data.serveurs.length;
      const colors = data.serveurs.map((_, i) => {
        const t = n > 1 ? i / (n - 1) : 0;
        return `rgb(${Math.round(gradStart[0] + (gradEnd[0] - gradStart[0]) * t)},${Math.round(gradStart[1] + (gradEnd[1] - gradStart[1]) * t)},${Math.round(gradStart[2] + (gradEnd[2] - gradStart[2]) * t)})`;
      });
      charts[id] = new Chart(canvasRef.current, {
        type: "bar",
        data: { labels: data.serveurs, datasets: [{ data: mode === "ttc" ? data.serv_ca_ttc : data.serv_ca_ht, backgroundColor: colors, borderRadius: 4 }] },
        options: {
          indexAxis: "y", responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => {
            const i = ctx.dataIndex;
            const caVal = ctx.raw as number;
            const tkt = data.serv_tickets?.[i] ?? 0;
            const cov = data.serv_cov?.[i] ?? 0;
            const cvtM = cov > 0 ? (caVal / cov).toFixed(1) : "—";
            return [`CA : ${fmt(caVal)} (${(caVal / (mode === "ttc" ? data.ca_ttc : data.ca_ht) * 100).toFixed(1)}%)`, `${tkt} tickets · ${cov} cvts · CVT M ${cvtM}\u20AC`];
          } } } },
          scales: {
            x: { grid: { color: "rgba(0,0,0,0.05)" }, ticks: { callback: v => fmtK(v as number), color: "#aaa", font: { size: 11 } }, border: { display: false } },
            y: { grid: { display: false }, ticks: { color: "#444", font: { size: 12 } }, border: { display: false } },
          },
        },
      });
    }

    if (type === "pay" && data.pay && data.pay.length > 0) {
      const payColors = ["#c8960a", "#e0b020", "#f0c840", "#f5d96a", "#f9e9a0"];
      charts[id] = new Chart(canvasRef.current, {
        type: "doughnut",
        data: {
          labels: data.pay.map(p => p.l),
          datasets: [{ data: data.pay.map(p => p.v), backgroundColor: payColors.slice(0, data.pay.length), borderWidth: 2, borderColor: "#fff" }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.label} : ${fmt(ctx.raw as number)}` } } },
          cutout: "62%",
        },
      });
    }

    return () => { destroyChart(id); };
  }, [id, data, mode, type, onBarClick]);

  return <div style={{ position: "relative", height }}><canvas ref={canvasRef} /></div>;
}
