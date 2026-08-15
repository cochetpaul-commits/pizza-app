"use client";

import { useEffect, useState, useRef, useCallback, Suspense, type CSSProperties } from "react";
import { useSearchParams } from "next/navigation";
import { RequireRole } from "@/components/RequireRole";
import { useEtablissement } from "@/lib/EtablissementContext";
import Chart from "chart.js/auto";
import { getCategoryColor, getCategoryColors } from "@/lib/categoryColors";
import { DateRangePicker, shiftRange, type DateRange } from "@/components/ui/DateRangePicker";
import { useTopBar } from "@/components/layout/TopBarContext";
import { BottomSheet } from "@/components/layout/BottomSheet";
import { PilotageSwipeWrapper } from "@/components/layout/PilotageSwipeWrapper";
import { supabase } from "@/lib/supabaseClient";
import { useBottomBarActions } from "@/lib/BottomBarContext";
import { useProfile } from "@/lib/ProfileContext";
import { getCached, setCache } from "@/lib/apiCache";

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
  top3_cats: { cat: string; total_qty?: number; total_ca_ttc?: number; total_ca_ht?: number; rows: { n: string; qty?: number; ca_ttc: string; ca_ht: string }[]; flop: { n: string; ca_ttc: string; ca_ht: string; qty: number } | null }[];
  serveurs: string[]; serv_ca_ttc: number[]; serv_ca_ht: number[]; serv_tickets: number[]; serv_cov: number[];
  ratios: {
    anti: { tables: number; coverts: number; ca_ttc: number; ca_ht: number };
    dolci: { tables: number; coverts: number; ca_ttc: number; ca_ht: number };
    pizze: { tables: number; coverts: number; ca_ttc: number; ca_ht: number };
    plats: { tables: number; coverts: number; ca_ttc: number; ca_ht: number };
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
  // Champs ajoutés (Popina API)
  remises_ttc?: number;
  remises_detail?: { operateur: string; count: number; total: number }[];
  produits_offerts?: { name: string; qty: number; operateurs: string[] }[];
  hourly_ttc?: number[];
  // Split Food / Boissons
  food_ttc?: number; food_ht?: number;
  drink_ttc?: number; drink_ht?: number;
  // Plats qui dorment
  bottom5?: { n: string; qty: number; ca_ttc: number; ca_ht: number }[];
  // Ratios par service + couverts par service
  ratios_by_svc?: Record<string, Record<string, { tables: number; total: number }>>;
  cov_midi?: number; cov_soir?: number;
  tickets_midi?: number; tickets_soir?: number;
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

/** Renvoie l'ensemble des dates ISO (incluses) entre from et to. */
function enumerateRange(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(from + "T12:00:00Z");
  const end = new Date(to + "T12:00:00Z");
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/** Vrai si tous les jours de la range sont des jours de fermeture. */
function isFullyClosed(from: string, to: string, joursFermeture: number[] | null | undefined): boolean {
  if (!joursFermeture || joursFermeture.length === 0) return false;
  const closed = new Set(joursFermeture);
  return enumerateRange(from, to).every((iso) => {
    const dow = new Date(iso + "T12:00:00Z").getUTCDay();
    return closed.has(dow);
  });
}

const JOURS_LABELS: Record<number, string> = {
  0: "dimanche", 1: "lundi", 2: "mardi", 3: "mercredi",
  4: "jeudi", 5: "vendredi", 6: "samedi",
};

/* ── Helpers ── */
const HIDDEN = "\u2022\u2022\u2022";
const _fmt = (v: number) => v.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmt = (v: number) => _fmt(v) + "\u20AC";
const fmtK = (v: number) => Math.round(v).toLocaleString("fr-FR") + "\u20AC";
const ZC: Record<string, string> = { Salle: "#46655a", Pergolas: "#5e8278", Terrasse: "#c4a882", Salon: "#8a6b3e", emp: "#D4775A" };

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
  sec: { fontSize: 11, textTransform: "uppercase" as const, letterSpacing: ".08em", color: "#666", fontWeight: 700, marginBottom: 12 } as CSSProperties,
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
  const { current: etab } = useEtablissement();
  const { can, role, displayName } = useProfile();
  const showMoney = can("performances.show_money");
  const isEquipier = role === "equipier";
  const mc = showMoney ? undefined : "hide-money"; // money class
  const accent = etab?.couleur ?? "#D4775A";

  const hasUrlRange = !!(searchParams.get("from") && searchParams.get("to"));
  const [range, setRange] = useState<DateRange>(() => {
    const qf = searchParams.get("from");
    const qt = searchParams.get("to");
    if (qf && qt && /^\d{4}-\d{2}-\d{2}$/.test(qf) && /^\d{4}-\d{2}-\d{2}$/.test(qt)) {
      return { from: qf, to: qt };
    }
    return defaultRange();
  });
  const initialLoadDone = useRef(hasUrlRange);
  const [mode, setMode] = useState<"ttc" | "ht">(() => {
    const m = searchParams.get("mode");
    if (m === "ttc" || m === "ht") return m;
    return "ttc";
  });
  const [data, setData] = useState<WeekData | null>(null);
  const [prev, setPrev] = useState<WeekData | null>(null); // A-1
  const [prevWeek, setPrevWeek] = useState<WeekData | null>(null); // S-1
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
  const [objectifs, setObjectifs] = useState<Record<string, { valeur: number; unite: string }>>({});

  // Fetch objectifs on mount
  useEffect(() => {
    if (!etab) return;
    fetch(`/api/pilotage/objectifs?etablissement_id=${etab.id}`)
      .then(r => r.json())
      .then(d => { if (d.objectifs) setObjectifs(d.objectifs); })
      .catch(() => {});
  }, [etab?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch last import date on first load (when no URL range provided)
  useEffect(() => {
    if (initialLoadDone.current || !etab) return;
    initialLoadDone.current = true;
    (async () => {
      const { data: row } = await supabase
        .from("ventes_lignes")
        .select("date_service")
        .eq("etablissement_id", etab.id)
        .order("date_service", { ascending: false })
        .limit(1)
        .single();
      if (row?.date_service) {
        setRange({ from: row.date_service, to: row.date_service });
      }
    })();
  }, [etab]);

  // Category trend state
  type CatTrendDaily = { date: string; qty: number; ca_ttc: number; ca_ht: number };
  // Trend range syncs with page range, but can be overridden in the tile
  const [catTrendRange, setCatTrendRange] = useState<DateRange>(range);
  const catTrendFrom = catTrendRange.from;
  const catTrendTo = catTrendRange.to;
  // Sync trend range when page range changes
  useEffect(() => { setCatTrendRange(range); }, [range.from, range.to]); // eslint-disable-line react-hooks/exhaustive-deps
  const [catTrendMetric] = useState<"qty" | "ca_ttc">("ca_ttc");
  const [catTrendData, setCatTrendData] = useState<Record<string, CatTrendDaily[]> | null>(null);
  const [, setCatTrendLoading] = useState(false);
  const catTrendChartRef = useRef<HTMLCanvasElement>(null);
  // Drill-down: optional category + product filter
  const [catTrendFilterCat] = useState<string | null>(null);
  const [catTrendFilterProd] = useState<string | null>(null);
  // Single-product trend data (when product is selected)
  const [prodTrendData, setProdTrendData] = useState<CatTrendDaily[] | null>(null);
  // Products list for the selected category (loaded from trend date range)
  const [, setTrendCatProducts] = useState<{ n: string; ca_ttc: number }[]>([]);

  // Compute date range from state
  const getRange = useCallback(() => {
    const { from, to } = range;
    if (from && to && from > to) return { from: to, to: from };
    return { from, to };
  }, [range]);

  // Load data — stats + meteo in parallel, with cache
  const loadData = useCallback(async () => {
    if (!etab) return;
    const { from, to } = getRange();
    const cacheKey = `ventes:${etab.id}:${from}:${to}`;

    // Try cache first — instant display
    const cached = getCached<{ json: Record<string, unknown>; meteo: Record<string, unknown> }>(cacheKey);
    if (cached) {
      const json = cached.json as Record<string, unknown>;
      if (!json.empty && json.stats) {
        setData(json.stats as WeekData);
        setPrev((json.prev as WeekData) ?? null);
        setPrevWeek((json.prevWeek as WeekData) ?? null);
        setDataSource((json.source as string) ?? "ventes_lignes");
      }
      setMeteo(cached.meteo as Record<string, { emoji: string; desc: string; temp: number }>);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [statsRes, meteoRes] = await Promise.all([
        fetch(`/api/ventes/stats?etablissement_id=${etab.id}&from=${from}&to=${to}`),
        fetch(`/api/meteo?from=${from}&to=${to}`).catch(() => null),
      ]);
      const json = await statsRes.json();
      if (json.empty || !json.stats) {
        setData(null); setPrev(null); setPrevWeek(null); setDataSource(null);
      } else {
        setData(json.stats);
        setPrev(json.prev ?? null);
        setPrevWeek(json.prevWeek ?? null);
        setDataSource(json.source ?? "ventes_lignes");
      }
      const meteoData: Record<string, { emoji: string; desc: string; temp: number }> = {};
      if (meteoRes) {
        try {
          const mJson = await meteoRes.json();
          for (const m of mJson.meteo ?? []) {
            meteoData[`${m.date_service}:${m.service}`] = { emoji: m.emoji, desc: m.description, temp: m.temp };
          }
          setMeteo(meteoData);
        } catch { setMeteo({}); }
      }
      // Cache for instant return
      setCache(cacheKey, { json, meteo: meteoData }, 5 * 60 * 1000);
    } catch {
      setData(null); setPrev(null); setPrevWeek(null);
    }
    setLoading(false);
  }, [etab, getRange]);

  useEffect(() => { loadData(); }, [loadData]);

  // Fetch products for selected trend category (uses trend date range, not page date)
  useEffect(() => {
    if (!etab || !catTrendFilterCat) { setTrendCatProducts([]); return; }
    let cancelled = false;
    fetch(`/api/ventes/stats?etablissement_id=${etab.id}&from=${catTrendFrom}&to=${catTrendTo}`)
      .then(r => r.json())
      .then(json => {
        if (cancelled || !json.stats?.cat_products) return;
        const cp = json.stats.cat_products as Record<string, { n: string; ca_ttc: number }[]>;
        const cpKey = Object.keys(cp).find(k => k.toLowerCase() === catTrendFilterCat.toLowerCase());
        setTrendCatProducts(cpKey ? cp[cpKey].sort((a, b) => b.ca_ttc - a.ca_ttc) : []);
      })
      .catch(() => { if (!cancelled) setTrendCatProducts([]); });
    return () => { cancelled = true; };
  }, [etab, catTrendFilterCat, catTrendFrom, catTrendTo]);

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

  useEffect(() => { loadCatTrend(); }, [loadCatTrend]);

  // Draw category trend chart
  useEffect(() => {
    if (!catTrendChartRef.current || !catTrendData || Object.keys(catTrendData).length === 0) return;
    const id = "catTrend";
    destroyChart(id);
    // Wait for canvas to be fully mounted (avoid race on conditional render)
    const raf = requestAnimationFrame(() => { renderCatTrendChart(); });
    return () => {
      cancelAnimationFrame(raf);
      destroyChart(id);
    };
    function renderCatTrendChart() {
      if (!catTrendChartRef.current || !catTrendData) return;

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
    }
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
      const bodyPayload = {
        stats: data, prev: activePrev, mode,
        viewTab: isSingleDay ? "jour" : "perso",
        rangeLabel,
        etabName: etab.nom ?? "Etablissement",
        briefing,
        exportType,
        objectifs,
      };
      const res = await fetch(`/api/ventes/pdf?type=${exportType}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload),
      });
      if (!res.ok) { const errText = await res.text().catch(() => ""); alert(`Erreur export PDF: ${res.status} ${errText.slice(0, 200)}`); setExporting(false); return; }
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
  const activePrevWeek = prevWeek;
  const ca = W ? (mode === "ttc" ? W.ca_ttc : W.ca_ht) : 0;

  // Date-ranker dans le bandeau du haut sur mobile (demande Paul 15/08) :
  // le header mobile rend ce contenu au centre, la barre sticky de page
  // est masquee en-dessous de 768px.
  const topBar = useTopBar();
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const atToday = range.to >= today;
    topBar.set({
      actions: (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button type="button" aria-label="Période précédente" onClick={() => setRange(shiftRange(range, -1))} style={{
            width: 28, height: 28, borderRadius: 8, border: "1px solid #e0d8ce",
            background: "#fff", color: accent, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, padding: 0,
          }}>
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <DateRangePicker value={range} onChange={(r) => setRange(r)} format="short" />
          <button type="button" aria-label="Période suivante" onClick={() => { if (!atToday) setRange(shiftRange(range, 1)); }} style={{
            width: 28, height: 28, borderRadius: 8, border: "1px solid #e0d8ce",
            background: atToday ? "#f0ebe3" : "#fff", color: atToday ? "#ccc" : accent,
            cursor: atToday ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, padding: 0,
          }}>
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        </div>
      ),
    });
    return () => topBar.clear();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to, accent]);

  // Register PDF action in the bottom tab bar FAB
  useBottomBarActions(() => [{
    key: "pdf", label: "PDF / Export", accent,
    onClick: () => setPdfDrawerOpen(true),
    icon: <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>,
  }], [accent]);

  return (
    <RequireRole permission="performances.view">
      <PilotageSwipeWrapper dateFrom={range.from} dateTo={range.to}>
      <div className={`ventes-container${showMoney ? "" : " no-money"}`} style={{ maxWidth: 1000, margin: "0 auto", padding: "16px 16px 120px" }}>

        {/* Barre de période sticky (style Zenchef) : toujours visible en scrollant,
            flèches au pas de la période affichée (jour, semaine, mois...) */}
        <div className="ventes-periodbar" style={{
          position: "sticky", top: 0, zIndex: 60,
          display: "flex", justifyContent: "center", alignItems: "center", gap: 8,
          margin: "-16px -16px 10px", padding: "10px 16px",
          background: "rgba(242,237,228,0.88)",
          backdropFilter: "blur(14px) saturate(160%)", WebkitBackdropFilter: "blur(14px) saturate(160%)",
          borderBottom: "1px solid rgba(0,0,0,0.05)",
        }}>
          <button type="button" aria-label="Période précédente" onClick={() => setRange(shiftRange(range, -1))} style={{
            width: 32, height: 32, borderRadius: 10, border: "1px solid #e0d8ce",
            background: "#fff", color: accent, fontSize: 14, fontWeight: 700,
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <DateRangePicker value={range} onChange={(r) => setRange(r)} format="short" />
          <button type="button" aria-label="Période suivante" onClick={() => {
            if (range.to >= new Date().toISOString().slice(0, 10)) return;
            setRange(shiftRange(range, 1));
          }} style={{
            width: 32, height: 32, borderRadius: 10, border: "1px solid #e0d8ce",
            background: range.to >= new Date().toISOString().slice(0, 10) ? "#f0ebe3" : "#fff",
            color: range.to >= new Date().toISOString().slice(0, 10) ? "#ccc" : accent,
            fontSize: 14, fontWeight: 700,
            cursor: range.to >= new Date().toISOString().slice(0, 10) ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        </div>

        {(<>

        {/* TTC/HT toggle + actions desktop */}
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          {showMoney && <div style={{ display: "flex", gap: 0, background: "#f0ebe2", border: "1px solid #e8e0d0", borderRadius: 999, padding: 2 }}>
            <button type="button" onClick={() => setMode("ttc")} style={{
              padding: "4px 14px", borderRadius: 999, border: "none", cursor: "pointer",
              background: mode === "ttc" ? accent : "transparent", color: mode === "ttc" ? "#fff" : "#999",
              fontSize: 11, fontWeight: 700, letterSpacing: ".03em",
            }}>TTC</button>
            <button type="button" onClick={() => setMode("ht")} style={{
              padding: "4px 14px", borderRadius: 999, border: "none", cursor: "pointer",
              background: mode === "ht" ? accent : "transparent", color: mode === "ht" ? "#fff" : "#999",
              fontSize: 11, fontWeight: 700, letterSpacing: ".03em",
            }}>HT</button>
          </div>}
          <label className="desktop-only" style={{
            padding: "6px 14px", borderRadius: 8, border: "none",
            background: accent, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer",
          }}>
            {importing ? "Import..." : "Import"}
            <input type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={e => {
              const f = e.target.files?.[0];
              if (f) handleImport(f);
              e.target.value = "";
            }} />
          </label>
          {data && (
            <button className="desktop-only" type="button" onClick={() => setPdfDrawerOpen(true)} disabled={exporting} style={{
              padding: "6px 14px", borderRadius: 8, border: "1px solid #e0d8ce",
              background: "#fff", color: "#1a1a1a", fontSize: 12, fontWeight: 700, cursor: "pointer",
              opacity: exporting ? 0.5 : 1,
            }}>
              {exporting ? "Export..." : "PDF"}
            </button>
          )}
        </div>

        {/* File actions drawer (import + export) */}
        <BottomSheet
          open={pdfDrawerOpen}
          onClose={() => setPdfDrawerOpen(false)}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {/* Import section */}
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#999", padding: "4px 4px 8px" }}>
              Importer fichier
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "14px 12px", border: "none", cursor: "pointer", borderRadius: 12, background: "rgba(255,255,255,0.55)", fontFamily: "inherit" }}>
              <input type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={(e) => {
                const f = e.target.files?.[0];
                setPdfDrawerOpen(false);
                if (f) handleImport(f);
                e.target.value = "";
              }} />
              <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#D4775A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>{etab?.slug?.includes("piccola") ? "Rapport de ventes" : "Rapport Popina"}</div>
                <div style={{ fontSize: 11, color: "#999", fontWeight: 400 }}>{importing ? "Import en cours..." : "Excel ou CSV"}</div>
              </div>
            </label>

            <div style={{ height: 1, background: "rgba(0,0,0,0.06)", margin: "8px 0" }} />

            {/* Export section */}
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#999", padding: "4px 4px 8px" }}>
              Exporter rapport
            </div>
            {[
              { key: "ventes" as const, label: "Ventes", sub: "Rapport detaille des ventes" },
              { key: "produits" as const, label: "Produits", sub: "Marges et food cost par produit" },
              { key: "complet" as const, label: "Complet", sub: "Ventes + Produits reunis" },
            ].map((opt) => (
              <button key={opt.key} type="button" onClick={() => handleExportPDF(opt.key)} disabled={exporting}
                style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2, width: "100%", padding: "14px 12px", border: "none", cursor: "pointer", borderRadius: 12, background: "rgba(255,255,255,0.55)", textAlign: "left", fontFamily: "inherit", opacity: exporting ? 0.5 : 1 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a" }}>{opt.label}</span>
                <span style={{ fontSize: 11, color: "#777" }}>{opt.sub}</span>
              </button>
            ))}
          </div>
        </BottomSheet>
        {importMsg && <div style={{ fontSize: 12, color: accent, marginBottom: 10 }}>{importMsg}</div>}

        {/* ── Loading / Empty ── */}
        {loading && <div style={{ textAlign: "center", padding: 60, color: "#999" }}>Chargement...</div>}

        {!loading && !W && (() => {
          const closed = isFullyClosed(range.from, range.to, etab?.jours_fermeture);
          if (closed) {
            const days = (etab?.jours_fermeture ?? [])
              .slice()
              .sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b))
              .map((d) => JOURS_LABELS[d])
              .join(" et ");
            return (
              <div style={{ ...S.card, textAlign: "center", padding: 60 }}>
                <div style={{ fontSize: 44, marginBottom: 12 }}>🌙</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#1a1a1a", marginBottom: 6 }}>
                  {etab?.nom ?? "L'établissement"} est fermé
                </div>
                <div style={{ fontSize: 12, color: "#777" }}>
                  Pas d&apos;activité le {days}.
                </div>
              </div>
            );
          }
          return (
            <div style={{ ...S.card, textAlign: "center", padding: 60 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#1a1a1a", marginBottom: 6 }}>Aucune donnee pour cette periode</div>
              <div style={{ fontSize: 12, color: "#777" }}>
                {etab?.slug?.includes("piccola")
                  ? "Importez un rapport de ventes pour alimenter cette periode."
                  : "Les ventes seront synchronisees automatiquement chaque matin depuis Popina."}
              </div>
            </div>
          );
        })()}

        {/* ── Dashboard ── */}
        {!loading && W && (
          <>
            {/* CA Hero card */}
            <div style={{ ...S.card, padding: 0, overflow: "hidden", marginBottom: 18 }}>
              <div style={{
                background: `linear-gradient(135deg, #b85a3a 0%, ${accent} 50%, #e09070 100%)`,
                padding: "24px 20px 20px", position: "relative",
              }}>
                {/* Title */}
                <div style={{ textAlign: "center", marginBottom: 12 }}>
                  <div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,.8)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 10 }}>
                    {rangeLabel}
                  </div>
                  {/* CA + deltas on same row */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
                    <div data-money style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 44, fontWeight: 700, color: "#fff", lineHeight: 1, letterSpacing: "-.02em", textShadow: "0 2px 8px rgba(0,0,0,.2)" }}>{fmt(ca)}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {activePrevWeek && (() => {
                        const prevCA = mode === "ttc" ? activePrevWeek.ca_ttc : activePrevWeek.ca_ht;
                        if (prevCA <= 0) return null;
                        const d = ca - prevCA;
                        const pct = (d / prevCA * 100);
                        return (
                          <div style={{ background: "rgba(255,255,255,.12)", borderRadius: 6, padding: "3px 10px", display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: d >= 0 ? "#a5d6a7" : "#fca5a5" }}>{d >= 0 ? "+" : ""}{pct.toFixed(1)}%</span>
                            <span style={{ fontSize: 9, color: "rgba(255,255,255,.5)" }}>vs S-1</span>
                          </div>
                        );
                      })()}
                      {activePrev && (() => {
                        const prevCA = mode === "ttc" ? activePrev.ca_ttc : activePrev.ca_ht;
                        if (prevCA <= 0) return null;
                        const d = ca - prevCA;
                        const pct = (d / prevCA * 100);
                        return (
                          <div style={{ background: "rgba(255,255,255,.12)", borderRadius: 6, padding: "3px 10px", display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: d >= 0 ? "#a5d6a7" : "#fca5a5" }}>{d >= 0 ? "+" : ""}{pct.toFixed(1)}%</span>
                            <span style={{ fontSize: 9, color: "rgba(255,255,255,.5)" }}>vs A-1</span>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                  {mode === "ttc" && <div data-money style={{ fontSize: 12, color: "rgba(255,255,255,.6)", marginTop: 6 }}>HT {fmt(W.ca_ht)}</div>}
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
                      {activePrev && activePrev.tickets > 0 && <DeltaBadge cur={ca / W.tickets} prev={(mode === "ttc" ? activePrev.ca_ttc : activePrev.ca_ht) / activePrev.tickets} decimals={1} suffix={"\u20AC"} />}
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
                      <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".12em", color: "rgba(255,255,255,.8)", fontWeight: 700, marginBottom: 4 }}>Ticket moyen sur place</div>
                      <div data-money style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 24, fontWeight: 700, color: "#fff", textShadow: "0 2px 6px rgba(0,0,0,.2)" }}>
                        {W.cov_sur > 0 ? ((mode === "ttc" ? W.place_sur_ttc : W.place_sur_ht) / W.cov_sur).toFixed(1) + "\u20AC" : "\u2014"}
                      </div>
                      {W.cov_emp > 0 && W.couverts > 0 && <div data-money style={{ fontSize: 10, color: "rgba(255,255,255,.85)", marginTop: 2 }}>Global <span style={{ color: "#fff", fontWeight: 700 }}>{(ca / W.couverts).toFixed(1) + "\u20AC"}</span></div>}
                      {activePrev && activePrev.cov_sur > 0 && W.cov_sur > 0 && (() => {
                        const curSP = (mode === "ttc" ? W.place_sur_ttc : W.place_sur_ht) / W.cov_sur;
                        const prevSP = (mode === "ttc" ? activePrev.place_sur_ttc : activePrev.place_sur_ht) / activePrev.cov_sur;
                        return <DeltaBadge cur={curSP} prev={prevSP} decimals={1} suffix={"\u20AC"} />;
                      })()}
                      {/* Ecart TM vs objectif */}
                      {(() => {
                        const objMidi = objectifs["tm_midi"]?.valeur;
                        const objSoir = objectifs["tm_soir"]?.valeur;
                        const tmSP = W.cov_sur > 0 ? (mode === "ttc" ? W.place_sur_ttc : W.place_sur_ht) / W.cov_sur : 0;
                        if (!objMidi && !objSoir) return null;
                        const covMidi = W.cov_midi ?? 0;
                        const covSoir = W.cov_soir ?? 0;
                        let manque = 0;
                        if (objMidi && covMidi > 0) {
                          const tmMidi = W.tickets_midi && W.tickets_midi > 0 && covMidi > 0 ? (mode === "ttc" ? W.place_sur_ttc : W.place_sur_ht) * (covMidi / (covMidi + covSoir)) / covMidi : tmSP;
                          manque += Math.max(0, (objMidi - tmMidi) * covMidi);
                        }
                        if (objSoir && covSoir > 0) {
                          const tmSoir2 = covSoir > 0 ? (mode === "ttc" ? W.place_sur_ttc : W.place_sur_ht) * (covSoir / (covMidi + covSoir)) / covSoir : tmSP;
                          manque += Math.max(0, (objSoir - tmSoir2) * covSoir);
                        }
                        if (manque <= 0) return null;
                        return <div style={{ fontSize: 10, color: "#fca5a5", marginTop: 3 }}>Potentiel : +{fmt(Math.round(manque))} si obj. TM atteint</div>;
                      })()}
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

            {/* Remises + Top serveurs */}
            {((W.remises_ttc ?? 0) > 0 || W.serveurs.length > 0) && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, marginBottom: 18 }}>

                {/* Remises */}
                {(W.remises_ttc ?? 0) > 0 && (() => {
                  const remises = W.remises_ttc ?? 0;
                  const caBrut = W.ca_ttc + remises;
                  const pctCA = caBrut > 0 ? (remises / caBrut * 100) : 0;
                  const prevR = activePrevWeek?.remises_ttc ?? 0;
                  return (
                    <div style={{ ...S.card, marginBottom: 0 }}>
                      <div style={S.sec}>Remises accordées</div>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
                        <div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 32, fontWeight: 700, color: "#c15f2e" }}>
                          {Math.round(remises).toLocaleString("fr-FR")}{"\u20AC"}
                        </div>
                        <div style={{ fontSize: 13, color: "#777" }}>
                          soit {pctCA.toFixed(1)}% du CA brut
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: "#999" }}>
                        CA brut (avant remise) : {Math.round(caBrut).toLocaleString("fr-FR")}{"\u20AC"}
                      </div>
                      {prevR > 0 && (
                        <div style={{ fontSize: 11, color: "#999", marginTop: 6 }}>
                          S-1 : {Math.round(prevR).toLocaleString("fr-FR")}{"\u20AC"} ({remises >= prevR ? "+" : ""}{prevR > 0 ? Math.round((remises - prevR) / prevR * 100) : 0}%)
                        </div>
                      )}
                      {/* Detail par operateur */}
                      {W.remises_detail && W.remises_detail.length > 0 && (
                        <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid #f0ebe3" }}>
                          <div style={{ fontSize: 9, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 6 }}>Detail par serveur</div>
                          {W.remises_detail.map((r) => (
                            <div key={r.operateur} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 0", fontSize: 12 }}>
                              <span style={{ fontWeight: 600, color: "#1a1a1a" }}>{r.operateur}</span>
                              <span style={{ color: "#777" }}>
                                <span style={{ fontWeight: 700, color: "#c15f2e" }}>{r.total.toLocaleString("fr-FR")}{"\u20AC"}</span>
                                {" "}
                                <span style={{ fontSize: 10, color: "#999" }}>({r.count} ticket{r.count > 1 ? "s" : ""})</span>
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Produits offerts */}
                      {W.produits_offerts && W.produits_offerts.length > 0 && (
                        <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid #f0ebe3" }}>
                          <div style={{ fontSize: 9, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 6 }}>Produits offerts</div>
                          {W.produits_offerts.map((p) => (
                            <div key={p.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "3px 0", fontSize: 12 }}>
                              <span style={{ color: "#1a1a1a" }}>{p.name}</span>
                              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ fontSize: 10, color: "#999" }}>x{p.qty}</span>
                                <span style={{ fontSize: 10, color: "#bbb" }}>{p.operateurs.join(", ")}</span>
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Top 3 serveurs */}
                {W.serveurs.length > 0 && (() => {
                  const ca = mode === "ttc" ? W.serv_ca_ttc : W.serv_ca_ht;
                  const trios = W.serveurs.map((name, i) => ({
                    name, ca: ca[i] ?? 0, cov: W.serv_cov[i] ?? 0, tickets: W.serv_tickets[i] ?? 0,
                  })).sort((a, b) => b.ca - a.ca).slice(0, 3);
                  const maxCA = trios[0]?.ca ?? 1;
                  return (
                    <div style={{ ...S.card, marginBottom: 0 }}>
                      <div style={S.sec}>Top 3 serveurs · CA {mode.toUpperCase()}</div>
                      <div style={{ display: "grid", gap: 10 }}>
                        {trios.map((s, i) => {
                          const cvtMoy = s.cov > 0 ? s.ca / s.cov : 0;
                          const barPct = maxCA > 0 ? Math.round(s.ca / maxCA * 100) : 0;
                          return (
                            <div key={s.name}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                                <div style={{ display: "flex", gap: 6, alignItems: "center", minWidth: 0 }}>
                                  <span style={{ fontSize: 10, fontWeight: 800, color: i === 0 ? accent : "#bbb", flexShrink: 0 }}>#{i + 1}</span>
                                  <span style={{ fontSize: 14, fontWeight: i === 0 ? 700 : 500, color: "#1a1a1a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                                </div>
                                <div style={{ fontSize: 13, fontWeight: 700, fontFamily: "var(--font-oswald), Oswald, sans-serif", color: i === 0 ? accent : "#1a1a1a", flexShrink: 0 }}>
                                  {Math.round(s.ca).toLocaleString("fr-FR")}{"\u20AC"}
                                </div>
                              </div>
                              <div style={{ height: 4, background: "#f0ebe3", borderRadius: 2, marginBottom: 3 }}>
                                <div style={{ width: `${barPct}%`, height: "100%", background: i === 0 ? accent : "#c9b99a", borderRadius: 2, transition: "width 0.5s" }} />
                              </div>
                              <div style={{ fontSize: 10, color: "#999" }}>
                                {s.cov} cvt · {s.tickets} tickets · CVT moy {cvtMoy.toFixed(1)}{"\u20AC"}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

              </div>
            )}

            {/* Hourly distribution */}
            {(() => {
              // Source ventes_lignes : utilise hourly_ttc (CA en €)
              // Source daily_sales : utilise hourly_totals (nb articles)
              const isCA = !!W.hourly_ttc && W.hourly_ttc.some(v => v > 0);
              const isArticles = !isCA && dataSource === "daily_sales" && W.hourly_totals && W.hourly_totals.some(v => v > 0);
              if (!isCA && !isArticles) return null;
              const h = (isCA ? W.hourly_ttc : W.hourly_totals) as number[];
              const unit = isCA ? "€" : " articles";
              const fmtVal = (v: number) => isCA ? `${Math.round(v)}${unit}` : `${Math.round(v)}${unit}`;
              const maxH = Math.max(...h, 1);
              let startH = h.findIndex(v => v > 0);
              let endH = h.length - 1 - [...h].reverse().findIndex(v => v > 0) + 1;
              if (startH < 0) { startH = 10; endH = 22; }
              startH = Math.max(0, startH - 1);
              endH = Math.min(24, endH + 1);
              return (
                <div style={S.card}>
                  <div style={S.sec}>Repartition horaire {isCA ? `du CA ${mode.toUpperCase()}` : "des ventes (articles)"}</div>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 120, padding: "0 4px" }}>
                    {Array.from({ length: endH - startH }, (_, i) => {
                      const hour = startH + i;
                      const val = h[hour] || 0;
                      const pct = maxH > 0 ? val / maxH * 100 : 0;
                      return (
                        <div key={hour} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: "flex-end" }}>
                          <div style={{ width: "100%", maxWidth: 32, height: `${Math.max(pct, 2)}%`, background: val > 0 ? accent : "#ddd6c8", borderRadius: "3px 3px 0 0", transition: "height .4s", minHeight: 2, opacity: val > 0 ? 0.4 + 0.6 * (pct / 100) : 0.3 }} title={`${hour}h: ${fmtVal(val)}`} />
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
              {/* Objectifs dynamiques (DB) avec fallback hardcode */}
              {(() => {
                const obj = (key: string, fallback: number) => objectifs[key]?.valeur ?? fallback;
                return (
              <div className="ventes-upsell-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 14 }}>
                <UpsellCard label="Antipasti" emoji="🥗" data={W.ratios.anti} totalTables={W.tickets} totalCov={W.couverts} color="#D4775A" targets={{ ok: obj("attache_antipasti", 30), good: obj("attache_antipasti", 30) + 20, avgPrice: 12 }} mode={mode} action="" onClick={() => setExpandedCat(expandedCat === "Antipasti" ? null : "Antipasti")} active={expandedCat === "Antipasti"} />
                <UpsellCard label="Pizzas" emoji="🍕" data={W.ratios.pizze} totalTables={W.tickets} totalCov={W.couverts} color="#c94c2c" targets={{ ok: obj("attache_pizzas", 50), good: obj("attache_pizzas", 50) + 20, avgPrice: 14 }} mode={mode} action="" onClick={() => setExpandedCat(expandedCat === "Pizze" ? null : "Pizze")} active={expandedCat === "Pizze"} />
                <UpsellCard label="Plats / Pasta" emoji="🍝" data={W.ratios.plats} totalTables={W.tickets} totalCov={W.couverts} color="#8a6b3e" targets={{ ok: obj("attache_plats", 40), good: obj("attache_plats", 40) + 20, avgPrice: 16 }} mode={mode} action="" onClick={() => setExpandedCat(expandedCat === "Plats" ? null : "Plats")} active={expandedCat === "Plats"} />
                <UpsellCard label="Desserts" emoji="🍮" data={W.ratios.dolci} totalTables={W.tickets} totalCov={W.couverts} color="#b5904a" targets={{ ok: obj("attache_desserts", 80), good: obj("attache_desserts", 80) + 20, avgPrice: 9 }} mode={mode} action="" onClick={() => setExpandedCat(expandedCat === "Dolci" ? null : "Dolci")} active={expandedCat === "Dolci"} />
                <UpsellCard label="Vins" emoji="🍷" data={W.ratios.vin} totalTables={W.tickets} totalCov={W.couverts} color="#7c5c3a" targets={{ ok: obj("attache_vins", 60), good: obj("attache_vins", 60) + 20, avgPrice: 6 }} mode={mode} action="" onClick={() => setExpandedCat(expandedCat === "Vins" ? null : "Vins")} active={expandedCat === "Vins"} />
                <UpsellCard label="Alcool" emoji="🍹" data={W.ratios.alcool} totalTables={W.tickets} totalCov={W.couverts} color="#c15f2e" targets={{ ok: obj("attache_alcool", 30), good: obj("attache_alcool", 30) + 20, avgPrice: 8 }} mode={mode} action="" onClick={() => setExpandedCat(expandedCat === "Alcool" ? null : "Alcool")} active={expandedCat === "Alcool"} />
                <UpsellCard label="Boissons" emoji="🥤" data={W.ratios.boissons} totalTables={W.tickets} totalCov={W.couverts} color="#5e7a8a" targets={{ ok: 70, good: 90, avgPrice: 5 }} mode={mode} action="" onClick={() => setExpandedCat(expandedCat === "Boissons" ? null : "Boissons")} active={expandedCat === "Boissons"} />
                <UpsellCard label="Cafe / Chaud" emoji="☕" data={W.ratios.cafe} totalTables={W.tickets} totalCov={W.couverts} color="#6f5c3a" targets={{ ok: 25, good: 40, avgPrice: 3 }} mode={mode} action="" onClick={() => setExpandedCat(expandedCat === "Boissons chaudes" ? null : "Boissons chaudes")} active={expandedCat === "Boissons chaudes"} />
                <UpsellCard label="Digestifs" emoji="🥃" data={W.ratios.digestif} totalTables={W.tickets} totalCov={W.couverts} color="#46655a" targets={{ ok: 10, good: 20, avgPrice: 6 }} mode={mode} action="" onClick={() => setExpandedCat(expandedCat === "Digestifs" ? null : "Digestifs")} active={expandedCat === "Digestifs"} />
              </div>
                );
              })()}
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

            {/* Attache midi vs soir */}
            {W.ratios_by_svc && W.ratios_by_svc["midi"] && W.ratios_by_svc["soir"] && (() => {
              const cats = [
                { key: "anti", label: "Antipasti" },
                { key: "pizze", label: "Pizze" },
                { key: "plats", label: "Plats" },
                { key: "dolci", label: "Desserts" },
                { key: "vin", label: "Vins" },
                { key: "alcool", label: "Alcool" },
              ];
              const midi = W.ratios_by_svc["midi"];
              const soir = W.ratios_by_svc["soir"];
              const hasMidi = Object.values(midi).some(v => v.total > 0);
              const hasSoir = Object.values(soir).some(v => v.total > 0);
              if (!hasMidi && !hasSoir) return null;
              return (
                <div style={S.card}>
                  <div style={S.sec}>Attache midi vs soir</div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                      <thead>
                        <tr style={{ borderBottom: "2px solid #ddd6c8" }}>
                          <th style={{ textAlign: "left", padding: "6px 0", fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase" }}></th>
                          {cats.map(c => (
                            <th key={c.key} style={{ textAlign: "center", padding: "6px 4px", fontSize: 9, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: ".04em" }}>{c.label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {hasMidi && (
                          <tr style={{ borderBottom: "1px solid #f0ebe3" }}>
                            <td style={{ padding: "6px 0", fontWeight: 600, fontSize: 11 }}>Midi</td>
                            {cats.map(c => {
                              const d = midi[c.key];
                              const pct = d && d.total > 0 ? Math.round(d.tables / d.total * 100) : 0;
                              return <td key={c.key} style={{ textAlign: "center", padding: "6px 4px", fontWeight: 700, color: pct >= 50 ? "#2e7d32" : pct >= 25 ? "#1a1a1a" : "#DC2626" }}>{pct}%</td>;
                            })}
                          </tr>
                        )}
                        {hasSoir && (
                          <tr>
                            <td style={{ padding: "6px 0", fontWeight: 600, fontSize: 11 }}>Soir</td>
                            {cats.map(c => {
                              const d = soir[c.key];
                              const pct = d && d.total > 0 ? Math.round(d.tables / d.total * 100) : 0;
                              return <td key={c.key} style={{ textAlign: "center", padding: "6px 4px", fontWeight: 700, color: pct >= 50 ? "#2e7d32" : pct >= 25 ? "#1a1a1a" : "#DC2626" }}>{pct}%</td>;
                            })}
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}

            {/* Duration & Rotation */}
            {W.duration && W.duration.totalOrders > 0 && (() => {
              const P = activePrev?.duration;
              const hasRotation = W.duration.avgRotation > 0;
              return (
              <div style={S.card}>
                <div style={S.sec}>{hasRotation ? "Duree & rotation des tables" : "Duree des tables"}</div>
                {/* KPIs row */}
                <div className="ventes-duration-kpis" style={{ display: "grid", gridTemplateColumns: hasRotation ? "1fr 1fr 1fr" : "1fr 1fr", gap: 10, marginBottom: 14 }}>
                  <div style={{ background: "#f9f6f0", borderRadius: 10, padding: "12px 14px", textAlign: "center" }}>
                    <div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 28, fontWeight: 700, color: "#D4775A" }}>{W.duration.avgDurMin}<span style={{ fontSize: 14, fontWeight: 500, color: "#777" }}>min</span></div>
                    <div style={{ fontSize: 10, color: "#777", marginTop: 4 }}>Duree moy. / table</div>
                    {P && P.avgDurMin > 0 && <DeltaBadgeSmall cur={W.duration.avgDurMin} prev={P.avgDurMin} suffix="min" inverse />}
                  </div>
                  {hasRotation && (
                    <div style={{ background: "#f9f6f0", borderRadius: 10, padding: "12px 14px", textAlign: "center" }}>
                      <div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 28, fontWeight: 700, color: "#46655a" }}>{W.duration.avgRotation}x</div>
                      <div style={{ fontSize: 10, color: "#777", marginTop: 4 }}>Rotation moy. / table</div>
                      {P && P.avgRotation > 0 && <DeltaBadgeSmall cur={W.duration.avgRotation} prev={P.avgRotation} suffix="x" />}
                    </div>
                  )}
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
                          {rot && rot.avgRotation > 0 && (
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 20, fontWeight: 700, color }}>{rot.avgRotation}x</div>
                              <div style={{ fontSize: 9, color: "#777" }}>rotation</div>
                            </div>
                          )}
                        </div>
                        <div style={{ fontSize: 10, color: "#777" }}>{z.tables} tables · {z.couverts} cvts</div>
                        {rot && rot.maxRotation > 1 && rot.avgRotation > 0 && (
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

            {/* Food vs Boissons */}
            {(W.food_ttc || W.drink_ttc) && (() => {
              const fCA = mode === "ttc" ? (W.food_ttc ?? 0) : (W.food_ht ?? 0);
              const dCA = mode === "ttc" ? (W.drink_ttc ?? 0) : (W.drink_ht ?? 0);
              const tot = fCA + dCA;
              if (tot <= 0) return null;
              const fPct = Math.round(fCA / tot * 100);
              const dPct = 100 - fPct;
              return (
                <div style={S.card}>
                  <div style={S.sec}>Food vs Boissons · CA {mode.toUpperCase()}</div>
                  {/* Progress bar */}
                  <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", marginBottom: 14 }}>
                    <div style={{ width: `${fPct}%`, background: "#8a6b3e", transition: "width .4s" }} />
                    <div style={{ width: `${dPct}%`, background: "#5e8278", transition: "width .4s" }} />
                  </div>
                  <div className="ventes-food-drink" style={{ display: "flex", gap: 0 }}>
                    <div style={{ flex: 1, textAlign: "center" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#8a6b3e", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 4 }}>Food</div>
                      <div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 22, fontWeight: 700, color: "#1a1a1a" }}>{fmt(fCA)}</div>
                      <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>{fPct} %</div>
                    </div>
                    <div style={{ width: 1, background: "rgba(0,0,0,.08)", margin: "0 20px", flexShrink: 0 }} />
                    <div style={{ flex: 1, textAlign: "center" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#5e8278", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 4 }}>Boissons</div>
                      <div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 22, fontWeight: 700, color: "#1a1a1a" }}>{fmt(dCA)}</div>
                      <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>{dPct} %</div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Taux de remplissage + Panier decompose midi/soir */}
            {(W.cov_midi || W.cov_soir) && W.dates.length > 0 && (() => {
              // Zone capacities (hors Salon = limonade uniquement)
              const ZONE_CAPS: Record<string, number> = { "Salle": 47, "Pergolas": 20, "Terrasse": 49, "Salon": 20 };
              const TOTAL_CAP = 116; // 47 + 20 + 49

              // Compute capacity based on which zones were active each day
              const nbDays = W.dates.length;
              // Check which zones had CA > 0 during the period
              const activeZones = Object.keys(W.zones_ttc).filter(z => {
                const vals = W.zones_ttc[z];
                return vals && vals.some(v => v > 0) && ZONE_CAPS[z] != null;
              });
              const activeCap = activeZones.length > 0
                ? activeZones.reduce((s, z) => s + (ZONE_CAPS[z] ?? 0), 0)
                : TOTAL_CAP;

              // Couverts SUR PLACE uniquement (exclure emporter)
              const midiSvcs = W.services.filter(s => s.svc === "midi");
              const soirSvcs = W.services.filter(s => s.svc !== "midi");
              const covMidiSP = midiSvcs.reduce((s, sv) => s + sv.sp_cov, 0);
              const covSoirSP = soirSvcs.reduce((s, sv) => s + sv.sp_cov, 0);
              const covMidiDay = nbDays > 0 ? covMidiSP / nbDays : 0;
              const covSoirDay = nbDays > 0 ? covSoirSP / nbDays : 0;
              const rempMidi = activeCap > 0 ? Math.round(covMidiDay / activeCap * 100) : null;
              const rempSoir = activeCap > 0 ? Math.round(covSoirDay / activeCap * 100) : null;
              const rempTotal = activeCap > 0 && nbDays > 0 ? Math.round(((covMidiSP + covSoirSP) / nbDays) / activeCap * 100) : null;
              const covMidiTotal = midiSvcs.reduce((s, sv) => s + sv.cov, 0) || 1;
              const covSoirTotal = soirSvcs.reduce((s, sv) => s + sv.cov, 0) || 1;
              const caMidi = midiSvcs.reduce((s, sv) => s + (mode === "ttc" ? sv.ttc : sv.ht), 0);
              const caSoir = soirSvcs.reduce((s, sv) => s + (mode === "ttc" ? sv.ttc : sv.ht), 0);
              const tmMidi = caMidi / covMidiTotal;
              const tmSoir = caSoir / covSoirTotal;

              // Food/drink per cover — use global food/drink ratio applied to midi/soir TM
              const totalCa = mode === "ttc" ? W.ca_ttc : W.ca_ht;
              const foodCa = mode === "ttc" ? (W.food_ttc ?? 0) : (W.food_ht ?? 0);
              const drinkCa = mode === "ttc" ? (W.drink_ttc ?? 0) : (W.drink_ht ?? 0);
              const foodRatio = totalCa > 0 ? foodCa / totalCa : 0;
              const drinkRatio = totalCa > 0 ? drinkCa / totalCa : 0;
              const covMidiT = midiSvcs.reduce((s, sv) => s + sv.cov, 0) || 1;
              const covSoirT = soirSvcs.reduce((s, sv) => s + sv.cov, 0) || 1;
              const foodMidiPerCvt = tmMidi * foodRatio;
              const drinkMidiPerCvt = tmMidi * drinkRatio;
              const foodSoirPerCvt = tmSoir * foodRatio;
              const drinkSoirPerCvt = tmSoir * drinkRatio;
              const hasFoodDrink = foodCa > 0 || drinkCa > 0;

              const rempColor = (pct: number) => pct >= 80 ? "#2e7d32" : pct >= 50 ? "#D97706" : "#DC2626";
              const OSWALD_F = "var(--font-oswald), Oswald, sans-serif";

              return (
                <div className="ventes-remp-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 6 }}>
                  {/* Remplissage */}
                  <div style={S.card}>
                    <div style={S.sec}>Taux de remplissage</div>
                    <div style={{ fontSize: 10, color: "#999", marginBottom: 8 }}>
                      Capacite : {activeCap} places ({activeZones.join(" + ") || "toutes zones"})
                    </div>
                    {rempMidi != null && (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                          <span style={{ fontSize: 11, color: "#777" }}>Midi</span>
                          <span style={{ fontSize: 12, fontWeight: 700, fontFamily: OSWALD_F, color: rempColor(rempMidi) }}>{rempMidi}%</span>
                        </div>
                        <div style={{ height: 6, background: "#f0ebe3", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${Math.min(100, rempMidi)}%`, background: rempColor(rempMidi), borderRadius: 3 }} />
                        </div>
                        <div style={{ fontSize: 10, color: "#999", marginTop: 2 }}>{covMidiDay.toFixed(0)} / {activeCap} cvt/j</div>
                      </div>
                    )}
                    {rempSoir != null && (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                          <span style={{ fontSize: 11, color: "#777" }}>Soir</span>
                          <span style={{ fontSize: 12, fontWeight: 700, fontFamily: OSWALD_F, color: rempColor(rempSoir) }}>{rempSoir}%</span>
                        </div>
                        <div style={{ height: 6, background: "#f0ebe3", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${Math.min(100, rempSoir)}%`, background: rempColor(rempSoir), borderRadius: 3 }} />
                        </div>
                        <div style={{ fontSize: 10, color: "#999", marginTop: 2 }}>{covSoirDay.toFixed(0)} / {activeCap} cvt/j</div>
                      </div>
                    )}
                    {rempTotal != null && (
                      <div style={{ borderTop: "1px solid #f0ebe3", paddingTop: 6 }}>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: "#555" }}>Total jour</span>
                          <span style={{ fontSize: 12, fontWeight: 700, fontFamily: OSWALD_F, color: rempColor(rempTotal) }}>{rempTotal}%</span>
                        </div>
                        <div style={{ fontSize: 10, color: "#999", marginTop: 2 }}>{((covMidiSP + covSoirSP) / nbDays).toFixed(0)} / {activeCap} cvt/j</div>
                      </div>
                    )}
                  </div>
                  {/* Panier moyen midi / soir + food/boissons */}
                  <div style={S.card}>
                    <div style={S.sec}>Panier moyen decompose</div>
                    {/* TM Midi / Soir */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, marginBottom: 10 }}>
                      <div style={{ textAlign: "center", borderRight: "1px solid #f0ebe3", paddingBottom: 8 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#5e8278", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4 }}>Midi</div>
                        <div style={{ fontFamily: OSWALD_F, fontSize: 22, fontWeight: 700, color: "#1a1a1a" }}>{tmMidi.toFixed(1)}{"\u20AC"}</div>
                        <div style={{ fontSize: 10, color: "#999" }}>{midiSvcs.reduce((s, sv) => s + sv.cov, 0)} cvt</div>
                      </div>
                      <div style={{ textAlign: "center", paddingBottom: 8 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#1a1a1a", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4 }}>Soir</div>
                        <div style={{ fontFamily: OSWALD_F, fontSize: 22, fontWeight: 700, color: "#1a1a1a" }}>{tmSoir.toFixed(1)}{"\u20AC"}</div>
                        <div style={{ fontSize: 10, color: "#999" }}>{soirSvcs.reduce((s, sv) => s + sv.cov, 0)} cvt</div>
                      </div>
                    </div>
                    {/* Food / Boissons par service */}
                    {hasFoodDrink && (
                      <div style={{ borderTop: "1px solid #f0ebe3", paddingTop: 10 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
                          {/* Food */}
                          <div style={{ borderRight: "1px solid #f0ebe3", paddingRight: 8 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: "#8a6b3e", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>Food /cvt</div>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                              <span style={{ color: "#5e8278", fontWeight: 600 }}>Midi</span>
                              <span style={{ fontFamily: OSWALD_F, fontWeight: 700 }}>{foodMidiPerCvt.toFixed(1)}{"\u20AC"}</span>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                              <span style={{ color: "#1a1a1a", fontWeight: 600 }}>Soir</span>
                              <span style={{ fontFamily: OSWALD_F, fontWeight: 700 }}>{foodSoirPerCvt.toFixed(1)}{"\u20AC"}</span>
                            </div>
                          </div>
                          {/* Boissons */}
                          <div style={{ paddingLeft: 8 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: "#5e8278", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>Boissons /cvt</div>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                              <span style={{ color: "#5e8278", fontWeight: 600 }}>Midi</span>
                              <span style={{ fontFamily: OSWALD_F, fontWeight: 700 }}>{drinkMidiPerCvt.toFixed(1)}{"\u20AC"}</span>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                              <span style={{ color: "#1a1a1a", fontWeight: 600 }}>Soir</span>
                              <span style={{ fontFamily: OSWALD_F, fontWeight: 700 }}>{drinkSoirPerCvt.toFixed(1)}{"\u20AC"}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

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

            {/* Projection fin de mois */}
            {(() => {
              const fromD = new Date(from + "T12:00:00");
              const toD = new Date(to + "T12:00:00");
              // Only show if range is within a single month and doesn't cover the full month
              if (fromD.getMonth() !== toD.getMonth()) return null;
              const y = fromD.getFullYear(), m2 = fromD.getMonth();
              const daysInMonth = new Date(y, m2 + 1, 0).getDate();
              const today = new Date();
              const daysCovered = Math.min(toD.getDate(), today.getDate());
              if (daysCovered >= daysInMonth) return null; // full month already
              if (daysCovered < 3) return null; // not enough data
              const ca = mode === "ttc" ? W.ca_ttc : W.ca_ht;
              if (ca <= 0) return null;
              const projected = Math.round(ca / daysCovered * daysInMonth);
              const prevMonthCA = activePrev ? (mode === "ttc" ? activePrev.ca_ttc : activePrev.ca_ht) : null;
              const monthLabel = fromD.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
              return (
                <div style={S.card}>
                  <div style={S.sec}>Projection fin {monthLabel}</div>
                  <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, color: "#999", fontWeight: 600, marginBottom: 4 }}>Cumul au {toD.getDate()}/{m2 + 1}</div>
                      <div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 24, fontWeight: 700, color: "#1a1a1a" }}>{fmt(ca)}</div>
                      <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>{daysCovered}j / {daysInMonth}j</div>
                    </div>
                    <div style={{ width: 1, height: 50, background: "rgba(0,0,0,.08)" }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, color: "#999", fontWeight: 600, marginBottom: 4 }}>Projection lineaire</div>
                      <div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 24, fontWeight: 700, color: accent }}>{fmt(projected)}</div>
                      {prevMonthCA != null && prevMonthCA > 0 && (() => {
                        const d = projected - prevMonthCA;
                        const pct = (d / prevMonthCA * 100).toFixed(1);
                        return <div style={{ fontSize: 11, color: d >= 0 ? "#2e7d32" : "#c62828", marginTop: 2, fontWeight: 600 }}>{d >= 0 ? "+" : ""}{pct}% vs A-1</div>;
                      })()}
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div style={{ marginTop: 12, height: 6, background: "#f0ebe3", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.round(daysCovered / daysInMonth * 100)}%`, background: accent, borderRadius: 3, transition: "width .4s" }} />
                  </div>
                </div>
              );
            })()}

            {/* Avant / Apres carte */}
            {(() => {
              const pivotRaw = objectifs["date_nouvelle_carte"]?.valeur;
              if (!pivotRaw) return null;
              const pivotStr = String(Math.round(pivotRaw));
              const pivotDate = `${pivotStr.slice(0, 4)}-${pivotStr.slice(4, 6)}-${pivotStr.slice(6, 8)}`;
              // Only show if the range spans at least 3 days and the pivot is within or near the range
              if (W.dates.length < 3) return null;
              const firstDate = W.dates[0];
              const lastDate = W.dates[W.dates.length - 1];
              if (pivotDate <= firstDate || pivotDate > lastDate) return null;

              // Split dates into before/after
              const beforeDates = W.dates.filter(d => d < pivotDate);
              const afterDates = W.dates.filter(d => d >= pivotDate);
              if (beforeDates.length === 0 || afterDates.length === 0) return null;

              // Compute per-period metrics from mix
              const beforeIdxs = beforeDates.map(d => W.dates.indexOf(d));
              const afterIdxs = afterDates.map(d => W.dates.indexOf(d));
              const sumIdxs = (arr: number[], idxs: number[]) => idxs.reduce((s, i) => s + (arr[i] ?? 0), 0);

              const bCA = sumIdxs(mode === "ttc" ? W.day_ttc : W.day_ht, beforeIdxs);
              const aCA = sumIdxs(mode === "ttc" ? W.day_ttc : W.day_ht, afterIdxs);
              const bCov = sumIdxs(W.day_cov, beforeIdxs);
              const aCov = sumIdxs(W.day_cov, afterIdxs);
              const bTM = bCov > 0 ? bCA / bCov : 0;
              const aTM = aCov > 0 ? aCA / aCov : 0;
              const bCADay = beforeDates.length > 0 ? bCA / beforeDates.length : 0;
              const aCADay = afterDates.length > 0 ? aCA / afterDates.length : 0;

              // Midi / Soir breakdown
              const svcBySvc = (svcName: string, dates: string[]) => {
                const svcs = W.services.filter(s => (svcName === "midi" ? s.svc === "midi" : s.svc !== "midi") && dates.includes(s.jour));
                const ca = svcs.reduce((s, sv) => s + (mode === "ttc" ? sv.ttc : sv.ht), 0);
                const cov = svcs.reduce((s, sv) => s + sv.cov, 0);
                return { ca, cov, tm: cov > 0 ? ca / cov : 0, caDay: dates.length > 0 ? ca / dates.length : 0, covDay: dates.length > 0 ? cov / dates.length : 0 };
              };
              const bMidi = svcBySvc("midi", beforeDates);
              const aMidi = svcBySvc("midi", afterDates);
              const bSoir = svcBySvc("soir", beforeDates);
              const aSoir = svcBySvc("soir", afterDates);

              const pivotLabel = new Date(pivotDate + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

              type CompRow = { label: string; before: string; after: string; delta: string; positive: boolean; bold?: boolean };
              const mkDelta = (b: number, a: number, suffix = "\u20AC") => `${a >= b ? "+" : ""}${suffix === "\u20AC" ? fmt(Math.round(a - b)) : (a - b).toFixed(1)}${suffix}`;
              const rows: CompRow[] = [
                { label: "CA / jour", before: `${fmt(bCADay)}`, after: `${fmt(aCADay)}`, delta: mkDelta(bCADay, aCADay), positive: aCADay >= bCADay, bold: true },
                { label: "   Midi", before: `${fmt(bMidi.caDay)}`, after: `${fmt(aMidi.caDay)}`, delta: mkDelta(bMidi.caDay, aMidi.caDay), positive: aMidi.caDay >= bMidi.caDay },
                { label: "   Soir", before: `${fmt(bSoir.caDay)}`, after: `${fmt(aSoir.caDay)}`, delta: mkDelta(bSoir.caDay, aSoir.caDay), positive: aSoir.caDay >= bSoir.caDay },
                { label: "Couverts / jour", before: `${(bCov / beforeDates.length).toFixed(0)}`, after: `${(aCov / afterDates.length).toFixed(0)}`, delta: `${aCov / afterDates.length >= bCov / beforeDates.length ? "+" : ""}${((aCov / afterDates.length) - (bCov / beforeDates.length)).toFixed(0)}`, positive: aCov / afterDates.length >= bCov / beforeDates.length, bold: true },
                { label: "   Midi", before: `${bMidi.covDay.toFixed(0)}`, after: `${aMidi.covDay.toFixed(0)}`, delta: `${aMidi.covDay >= bMidi.covDay ? "+" : ""}${(aMidi.covDay - bMidi.covDay).toFixed(0)}`, positive: aMidi.covDay >= bMidi.covDay },
                { label: "   Soir", before: `${bSoir.covDay.toFixed(0)}`, after: `${aSoir.covDay.toFixed(0)}`, delta: `${aSoir.covDay >= bSoir.covDay ? "+" : ""}${(aSoir.covDay - bSoir.covDay).toFixed(0)}`, positive: aSoir.covDay >= bSoir.covDay },
                { label: "Ticket moyen", before: `${bTM.toFixed(1)}\u20AC`, after: `${aTM.toFixed(1)}\u20AC`, delta: mkDelta(bTM, aTM, "\u20AC"), positive: aTM >= bTM, bold: true },
                { label: "   Midi", before: `${bMidi.tm.toFixed(1)}\u20AC`, after: `${aMidi.tm.toFixed(1)}\u20AC`, delta: mkDelta(bMidi.tm, aMidi.tm, "\u20AC"), positive: aMidi.tm >= bMidi.tm },
                { label: "   Soir", before: `${bSoir.tm.toFixed(1)}\u20AC`, after: `${aSoir.tm.toFixed(1)}\u20AC`, delta: mkDelta(bSoir.tm, aSoir.tm, "\u20AC"), positive: aSoir.tm >= bSoir.tm },
              ];

              return (
                <div style={{ ...S.card, borderLeft: `4px solid ${accent}` }}>
                  <div style={S.sec}>Nouvelle carte · avant / apres le {pivotLabel}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 70px", gap: 0, fontSize: 11 }}>
                    <div style={{ fontWeight: 700, color: "#999", padding: "6px 0", fontSize: 10, textTransform: "uppercase", letterSpacing: ".06em" }}></div>
                    <div style={{ fontWeight: 700, color: "#999", padding: "6px 0", fontSize: 10, textTransform: "uppercase", letterSpacing: ".06em", textAlign: "right" }}>Avant</div>
                    <div style={{ fontWeight: 700, color: "#999", padding: "6px 0", fontSize: 10, textTransform: "uppercase", letterSpacing: ".06em", textAlign: "right" }}>Apres</div>
                    <div style={{ fontWeight: 700, color: "#999", padding: "6px 0", fontSize: 10, textTransform: "uppercase", letterSpacing: ".06em", textAlign: "right" }}>Delta</div>
                    {rows.map((r, i) => (<>
                      <div key={`l${i}`} style={{ padding: "5px 0", fontWeight: r.bold ? 600 : 400, fontSize: r.bold ? 11 : 10, color: r.bold ? "#1a1a1a" : "#888", borderTop: r.bold ? "1px solid #e0d8ce" : "none" }}>{r.label}</div>
                      <div key={`b${i}`} style={{ padding: "5px 0", textAlign: "right", color: "#777", fontSize: r.bold ? 11 : 10, borderTop: r.bold ? "1px solid #e0d8ce" : "none" }}>{r.before}</div>
                      <div key={`a${i}`} style={{ padding: "5px 0", textAlign: "right", fontWeight: r.bold ? 700 : 500, fontSize: r.bold ? 11 : 10, borderTop: r.bold ? "1px solid #e0d8ce" : "none" }}>{r.after}</div>
                      <div key={`d${i}`} style={{ padding: "5px 0", textAlign: "right", fontWeight: 700, fontSize: r.bold ? 11 : 10, color: r.positive ? "#2e7d32" : "#c62828", borderTop: r.bold ? "1px solid #e0d8ce" : "none" }}>{r.delta}</div>
                    </>))}
                  </div>
                  <div style={{ fontSize: 10, color: "#999", marginTop: 8 }}>
                    Avant : {beforeDates.length}j ({beforeDates[0]} au {beforeDates[beforeDates.length - 1]}) · Apres : {afterDates.length}j ({afterDates[0]} au {afterDates[afterDates.length - 1]})
                  </div>
                </div>
              );
            })()}

            {/* Recap table */}
            {W.services.length > 0 && (
              <div style={S.card}>
                <div style={S.sec}>Par service · {mode.toUpperCase()} · couverts</div>
                {/* Desktop: table classique */}
                <div className="desktop-only" style={{ overflow: "hidden", borderRadius: 8, border: "1px solid #e0d8ce" }}>
                  <RecapTable services={W.services} mode={mode} meteo={meteo} dates={W.dates} days={W.days} useWeeks={W.dates.length > 14} />
                </div>
                {/* Mobile: transposed table (rows=zones, cols=midi/soir) per day */}
                <div className="mobile-only" style={{ flexDirection: "column", gap: 10 }}>
                  {(() => {
                    const byDay: Record<string, typeof W.services> = {};
                    const dayOrder: string[] = [];
                    for (const s of W.services) {
                      if (!byDay[s.jour]) { byDay[s.jour] = []; dayOrder.push(s.jour); }
                      byDay[s.jour].push(s);
                    }
                    // Find dayToDate for meteo
                    const dayToDate: Record<string, string> = {};
                    for (let i = 0; i < W.days.length; i++) {
                      if (W.days[i] && W.dates[i]) dayToDate[W.days[i]] = W.dates[i];
                    }
                    const cellSt = { padding: "10px 8px", textAlign: "center" as const, fontSize: 13, fontWeight: 600 as const, borderBottom: "1px solid rgba(0,0,0,0.04)" };
                    const labelSt = { padding: "10px 12px", textAlign: "left" as const, fontSize: 12, fontWeight: 600 as const, color: "#777", borderBottom: "1px solid rgba(0,0,0,0.04)" };
                    return dayOrder.map(jour => {
                      const svcs = byDay[jour];
                      const midi = svcs.find(s => s.svc === "midi");
                      const soir = svcs.find(s => s.svc !== "midi");
                      const zM = midi ? (mode === "ttc" ? midi.z_ttc : midi.z_ht) : null;
                      const zS = soir ? (mode === "ttc" ? soir.z_ttc : soir.z_ht) : null;
                      const dateKey = dayToDate[jour];
                      const meteoM = dateKey ? meteo[`${dateKey}:midi`] : null;
                      const meteoS = dateKey ? meteo[`${dateKey}:soir`] : null;
                      const dash = <span style={{ color: "#ddd" }}>—</span>;
                      const fmtCell = (v: number | undefined, color?: string) => v && v > 0
                        ? <span style={{ color: color ?? "#1a1a1a" }}>{fmt(v)}</span>
                        : dash;
                      return (
                        <div key={jour} style={{
                          background: "#fff", borderRadius: 14, border: "1px solid #e8e0d0",
                          overflow: "hidden",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                        }}>
                          <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead>
                              <tr style={{ background: "linear-gradient(180deg, #faf7f2 0%, #f5f0e8 100%)" }}>
                                <th style={{
                                  padding: "12px 12px", textAlign: "left",
                                  fontSize: 14, fontWeight: 800, color: "#1a1a1a",
                                  fontFamily: "var(--font-oswald), Oswald, sans-serif",
                                  textTransform: "uppercase", letterSpacing: "0.04em",
                                  borderBottom: "1px solid rgba(0,0,0,0.06)",
                                }}>{jour}</th>
                                <th style={{
                                  padding: "12px 8px", textAlign: "center",
                                  fontSize: 10, fontWeight: 700, color: "#5e8278",
                                  textTransform: "uppercase", letterSpacing: "0.12em",
                                  borderBottom: "1px solid rgba(0,0,0,0.06)",
                                }}>Midi</th>
                                <th style={{
                                  padding: "12px 8px", textAlign: "center",
                                  fontSize: 10, fontWeight: 700, color: "#1a1a1a",
                                  textTransform: "uppercase", letterSpacing: "0.12em",
                                  borderBottom: "1px solid rgba(0,0,0,0.06)",
                                }}>Soir</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                <td style={labelSt}>Meteo</td>
                                <td style={{ ...cellSt, fontSize: 18 }}>{meteoM ? <span title={`${meteoM.desc} ${meteoM.temp}°`}>{meteoM.emoji}</span> : dash}</td>
                                <td style={{ ...cellSt, fontSize: 18 }}>{meteoS ? <span title={`${meteoS.desc} ${meteoS.temp}°`}>{meteoS.emoji}</span> : dash}</td>
                              </tr>
                              <tr style={{ background: "rgba(94,130,120,0.03)" }}>
                                <td style={{ ...labelSt, color: ZC.Salle }}>Salle</td>
                                <td style={cellSt}>{fmtCell(zM?.Salle, ZC.Salle)}</td>
                                <td style={cellSt}>{fmtCell(zS?.Salle, ZC.Salle)}</td>
                              </tr>
                              <tr>
                                <td style={{ ...labelSt, color: ZC.Pergolas }}>Pergolas</td>
                                <td style={cellSt}>{fmtCell(zM?.Pergolas, ZC.Pergolas)}</td>
                                <td style={cellSt}>{fmtCell(zS?.Pergolas, ZC.Pergolas)}</td>
                              </tr>
                              <tr style={{ background: "rgba(196,168,130,0.04)" }}>
                                <td style={{ ...labelSt, color: ZC.Terrasse }}>Terrasse</td>
                                <td style={cellSt}>{fmtCell(zM?.Terrasse, ZC.Terrasse)}</td>
                                <td style={cellSt}>{fmtCell(zS?.Terrasse, ZC.Terrasse)}</td>
                              </tr>
                              <tr>
                                <td style={{ ...labelSt, color: ZC.emp }}>Emporter</td>
                                <td style={cellSt}>{fmtCell(zM?.emp, ZC.emp)}</td>
                                <td style={cellSt}>{fmtCell(zS?.emp, ZC.emp)}</td>
                              </tr>
                              <tr style={{ background: "rgba(212,119,90,0.08)" }}>
                                <td style={{ ...labelSt, fontWeight: 800, color: accent, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em" }}>Total</td>
                                <td style={{ ...cellSt, fontWeight: 800, color: accent, fontSize: 15, fontFamily: "var(--font-oswald), Oswald, sans-serif" }}>{midi ? fmt(mode === "ttc" ? midi.ttc : midi.ht) : dash}</td>
                                <td style={{ ...cellSt, fontWeight: 800, color: accent, fontSize: 15, fontFamily: "var(--font-oswald), Oswald, sans-serif" }}>{soir ? fmt(mode === "ttc" ? soir.ttc : soir.ht) : dash}</td>
                              </tr>
                              <tr>
                                <td style={labelSt}>Cvts</td>
                                <td style={{ ...cellSt, fontWeight: 700, color: "#1a1a1a" }}>{midi?.cov ?? dash}</td>
                                <td style={{ ...cellSt, fontWeight: 700, color: "#1a1a1a" }}>{soir?.cov ?? dash}</td>
                              </tr>
                              <tr>
                                <td style={{ ...labelSt, color: "#46655a" }}>SP</td>
                                <td style={{ ...cellSt, fontWeight: 600, color: "#46655a" }}>{midi?.sp_cov || dash}</td>
                                <td style={{ ...cellSt, fontWeight: 600, color: "#46655a" }}>{soir?.sp_cov || dash}</td>
                              </tr>
                              <tr>
                                <td style={{ ...labelSt, color: "#46655a" }}>CVT M SP</td>
                                <td style={{ ...cellSt, color: "#46655a" }}>{midi ? `${(mode === "ttc" ? midi.tm_sp_ttc : midi.tm_sp_ht).toFixed(2)}€` : dash}</td>
                                <td style={{ ...cellSt, color: "#46655a" }}>{soir ? `${(mode === "ttc" ? soir.tm_sp_ttc : soir.tm_sp_ht).toFixed(2)}€` : dash}</td>
                              </tr>
                              <tr>
                                <td style={{ ...labelSt, color: "#D4775A" }}>EMP</td>
                                <td style={{ ...cellSt, fontWeight: 600, color: "#D4775A" }}>{midi ? (midi.cov - midi.sp_cov > 0 ? midi.cov - midi.sp_cov : dash) : dash}</td>
                                <td style={{ ...cellSt, fontWeight: 600, color: "#D4775A" }}>{soir ? (soir.cov - soir.sp_cov > 0 ? soir.cov - soir.sp_cov : dash) : dash}</td>
                              </tr>
                              <tr style={{ background: "rgba(0,0,0,0.015)" }}>
                                <td style={{ ...labelSt, borderBottom: "none", color: "#D4775A" }}>CVT M EMP</td>
                                <td style={{ ...cellSt, borderBottom: "none", color: "#D4775A" }}>{(() => { if (!midi) return dash; const ec = midi.cov - midi.sp_cov; if (ec <= 0) return dash; const empCa = mode === "ttc" ? midi.emp_ttc : midi.emp_ht; return `${Math.round(empCa / ec)}€`; })()}</td>
                                <td style={{ ...cellSt, borderBottom: "none", color: "#D4775A" }}>{(() => { if (!soir) return dash; const ec = soir.cov - soir.sp_cov; if (ec <= 0) return dash; const empCa = mode === "ttc" ? soir.emp_ttc : soir.emp_ht; return `${Math.round(empCa / ec)}€`; })()}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      );
                    });
                  })()}
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
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                        <span style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".1em", color: getCategoryColor(cat.cat, ci), fontWeight: 600 }}>{cat.cat}</span>
                        {cat.total_qty != null && (
                          <span style={{ fontSize: 10, color: "#999" }}>
                            {cat.total_qty}x · {(mode === "ttc" ? cat.total_ca_ttc : cat.total_ca_ht)?.toLocaleString("fr-FR")}{"\u20AC"}
                          </span>
                        )}
                      </div>
                      {cat.rows.map((r, ri) => (
                        <div key={ri} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: "1px solid rgba(0,0,0,.04)", fontSize: 11 }}>
                          <span><span style={{ fontSize: 9, color: "#bbb", marginRight: 4 }}>{ri + 1}</span>{r.n}</span>
                          <span style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                            {r.qty != null && <span style={{ fontSize: 9, color: "#999" }}>{r.qty}x</span>}
                            <span style={{ fontFamily: "var(--font-cormorant), Cormorant Garamond, serif", fontSize: 13, fontWeight: 600, color: accent }}>{mode === "ttc" ? r.ca_ttc : r.ca_ht}</span>
                          </span>
                        </div>
                      ))}
                      {cat.flop && (
                        <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0 2px", marginTop: 4, borderTop: "1px dashed rgba(0,0,0,.08)", fontSize: 11 }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ fontSize: 9, color: "#c62828", fontWeight: 600 }}>▼</span><span style={{ color: "#777" }}>{cat.flop.n}</span></span>
                          <span style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                            <span style={{ fontSize: 9, color: "#999" }}>{cat.flop.qty}x</span>
                            <span style={{ fontFamily: "var(--font-cormorant), Cormorant Garamond, serif", fontSize: 13, fontWeight: 600, color: "#777" }}>{mode === "ttc" ? cat.flop.ca_ttc : cat.flop.ca_ht}</span>
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Plats qui dorment */}
            {W.bottom5 && W.bottom5.length > 0 && (
              <div style={S.card}>
                <div style={S.sec}>Plats qui dorment · a valoriser</div>
                {W.bottom5.map((p, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: i < W.bottom5!.length - 1 ? "1px solid #f0ebe3" : "none" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, overflow: "hidden" }}>
                      <span style={{ fontSize: 9, color: "#c62828", fontWeight: 600 }}>▼</span>
                      <span style={{ fontSize: 12, color: "#555", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.n}</span>
                    </span>
                    <span style={{ fontSize: 11, color: "#999", marginLeft: 8, flexShrink: 0 }}>x{p.qty}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#999", marginLeft: 12, flexShrink: 0, fontFamily: "var(--font-oswald), Oswald, sans-serif" }}>{fmt(mode === "ttc" ? p.ca_ttc : p.ca_ht)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Ventes par categorie */}
            {W.mix_labels.length > 0 && <div style={S.card}>
              <div style={{ ...S.sec, marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Ventes par categorie · CA {mode.toUpperCase()}</span>
                <span style={{ fontSize: 10, color: "#777", fontStyle: "italic", textTransform: "none", letterSpacing: 0 }}>Cliquer une barre pour le detail</span>
              </div>
              <ChartCanvas id="mix" height={Math.max(220, W.mix_labels.length * 32)} data={W} mode={mode} type="mix" onBarClick={(label, color) => setMixDDOpen({ label, color })} />
              {mixDDOpen && W.cat_products[mixDDOpen.label] && (
                <MixDropdown label={mixDDOpen.label} color={mixDDOpen.color} products={W.cat_products[mixDDOpen.label]} onClose={() => setMixDDOpen(null)} mode={mode} />
              )}
            </div>}


            {/* Serveurs — equipiers voient uniquement leur propre performance */}
            {W.serveurs.length > 0 && !isEquipier && (
              <div style={S.card}>
                <div style={S.sec}>Performance serveurs · CA {mode.toUpperCase()}</div>
                <ChartCanvas id="serv" height={Math.max(120, W.serveurs.length * 38)} data={W} mode={mode} type="serv" />
              </div>
            )}
            {isEquipier && displayName && (() => {
              const myIdx = W.serveurs.findIndex(s => s.toLowerCase() === displayName.toLowerCase());
              if (myIdx < 0) return null;
              const myCa = mode === "ttc" ? W.serv_ca_ttc[myIdx] : W.serv_ca_ht[myIdx];
              const myTickets = W.serv_tickets?.[myIdx] ?? 0;
              const myCov = W.serv_cov?.[myIdx] ?? 0;
              const myTm = myCov > 0 ? myCa / myCov : 0;
              return (
                <div style={S.card}>
                  <div style={S.sec}>Ma performance</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, textAlign: "center" }}>
                    <div>
                      <div style={{ fontSize: 10, color: "#999", fontWeight: 600 }}>Tickets</div>
                      <div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 20, fontWeight: 700 }}>{myTickets}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: "#999", fontWeight: 600 }}>Couverts</div>
                      <div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 20, fontWeight: 700 }}>{myCov}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: "#999", fontWeight: 600 }}>TM</div>
                      <div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 20, fontWeight: 700 }}>{myTm.toFixed(1)}{"\u20AC"}</div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Paiements — masque pour equipiers */}
            {!isEquipier && W.pay && W.pay.length > 0 && (
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

          </>
        )}
      </>
      )}
      </div>

      <style>{`
        @media (max-width: 767px) {
          .ventes-periodbar { display: none !important; }
        }
        .ventes-nav-btn:hover, .ventes-nav-btn:active {
          background: rgba(0,0,0,0.06) !important;
        }
        ${!showMoney ? `
          .no-money [data-money] { filter: blur(8px); pointer-events: none; user-select: none; }
          .no-money .money-hide { display: none !important; }
        ` : ""}
      `}</style>
      </PilotageSwipeWrapper>
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
  const ca = mode === "ttc" ? data.ca_ttc : data.ca_ht;
  void action;

  // Ratio couverts lisible
  const covRatio = data.coverts > 0 && totalCov > 0 ? (() => {
    const r = data.coverts / totalCov;
    if (r >= 0.9) return "9 cvt sur 10";
    if (r >= 0.8) return "4 cvt sur 5";
    if (r >= 0.65) return "2 cvt sur 3";
    if (r >= 0.45) return "1 cvt sur 2";
    if (r >= 0.3) return "1 cvt sur 3";
    if (r >= 0.2) return "1 cvt sur 5";
    return `1 cvt sur ${Math.round(1 / r)}`;
  })() : null;

  // Arrow vs objectif
  const aboveObj = pct >= targets.ok;
  const arrowColor = aboveObj ? "#2e7d32" : "#DC2626";
  const arrow = aboveObj ? "↑" : "↓";
  const diff = pct - targets.ok;

  return (
    <div onClick={onClick} style={{ padding: "12px 14px", background: active ? `${color}10` : "#f9f6f0", borderRadius: 10, cursor: onClick ? "pointer" : "default", border: active ? `1.5px solid ${color}30` : "1.5px solid transparent", transition: "all 0.15s" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 14 }}>{emoji}</span>
        <span style={{ fontSize: 11, fontWeight: 600 }}>{label}</span>
        {pct > 0 && (
          <span style={{ fontSize: 10, fontWeight: 700, color: arrowColor, marginLeft: "auto" }}>
            {arrow} {diff > 0 ? "+" : ""}{diff}%
          </span>
        )}
      </div>
      <div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 24, fontWeight: 700, color, lineHeight: 1, marginBottom: 2 }}>{pct}%</div>
      {covRatio && <div style={{ fontSize: 10, color: "#555", marginBottom: 2 }}>{covRatio}</div>}
      <div style={{ fontSize: 10, color: "#999", marginBottom: 6 }}>
        {data.tables}/{totalTables} tables
      </div>
      <div style={{ position: "relative", height: 6, background: "rgba(0,0,0,.07)", borderRadius: 3, overflow: "hidden", marginBottom: 4 }}>
        <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: `${Math.min(100, pct)}%`, background: color, borderRadius: 3, transition: "width .5s" }} />
        <div style={{ position: "absolute", top: 0, left: `${targets.ok}%`, height: "100%", width: 1.5, background: "rgba(0,0,0,.15)" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color }}>{fmt(ca)}</span>
        <span style={{ fontSize: 9, color: "#bbb" }}>obj. {targets.ok}%</span>
      </div>
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
          <th style={{ ...thSt(), color: "#46655a" }}>SP</th>
          <th style={{ ...thSt(), color: "#46655a" }}>CVT M SP</th>
          <th style={{ ...thSt(), color: "#D4775A" }}>EMP</th>
          <th style={{ ...thSt(), color: "#D4775A" }}>CVT M EMP</th>
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
                <td style={{ ...tdSt, fontSize: 11, fontWeight: 600, color: "#46655a" }}>{s.sp_cov || "\u2014"}</td>
                <td style={tdSt}><span style={{ background: "#46655a18", color: "#46655a", padding: "3px 9px", borderRadius: 5, fontSize: 11, fontWeight: 700 }}>{tmSp.toFixed(0)}{"\u20AC"}</span></td>
                {(() => {
                  const empCov = s.cov - s.sp_cov;
                  const empCa = mode === "ttc" ? s.emp_ttc : s.emp_ht;
                  const tmEmp = empCov > 0 ? empCa / empCov : 0;
                  return <>
                    <td style={{ ...tdSt, fontSize: 11, fontWeight: 600, color: "#D4775A" }}>{empCov > 0 ? empCov : "\u2014"}</td>
                    <td style={tdSt}>{empCov > 0 ? <span style={{ background: "#FFF0EB", color: "#D4775A", padding: "3px 9px", borderRadius: 5, fontSize: 11, fontWeight: 700 }}>{tmEmp.toFixed(0)}{"\u20AC"}</span> : "\u2014"}</td>
                  </>;
                })()}
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
        {/* Total row */}
        {groups.length > 1 && (() => {
          const allSvcs = groups.flatMap(g => g.services);
          const midiSvcs = allSvcs.filter(s => s.svc === "midi");
          const soirSvcs = allSvcs.filter(s => s.svc !== "midi");
          const sumZ = (svcs: typeof allSvcs, key: "z_ttc" | "z_ht") => {
            const r: Record<string, number> = {};
            for (const s of svcs) for (const [k, v] of Object.entries(s[key] ?? {})) r[k] = (r[k] ?? 0) + v;
            return r;
          };
          const totalRows = [
            { label: "Midi", svcs: midiSvcs },
            { label: "Soir", svcs: soirSvcs },
          ];
          return totalRows.map((tr, ti) => {
            const ca = tr.svcs.reduce((s, x) => s + (mode === "ttc" ? x.ttc : x.ht), 0);
            const cov = tr.svcs.reduce((s, x) => s + x.cov, 0);
            const spCov = tr.svcs.reduce((s, x) => s + x.sp_cov, 0);
            const spCa = tr.svcs.reduce((s, x) => s + (mode === "ttc" ? x.sp_ttc : x.sp_ht), 0);
            const empCov = cov - spCov;
            const empCa = tr.svcs.reduce((s, x) => s + (mode === "ttc" ? x.emp_ttc : x.emp_ht), 0);
            const tmSp = spCov > 0 ? spCa / spCov : 0;
            const tmEmp = empCov > 0 ? empCa / empCov : 0;
            const z = sumZ(tr.svcs, mode === "ttc" ? "z_ttc" : "z_ht");
            return (
              <tr key={`total-${tr.label}`} style={{ background: "#f5f0e8", borderTop: ti === 0 ? "2px solid #d4c8b4" : "1px solid rgba(0,0,0,.05)", fontWeight: 700 }}>
                {ti === 0 && <td rowSpan={2} style={{ padding: "0 16px", fontWeight: 800, fontSize: 11, verticalAlign: "middle", borderRight: "1px solid #e0d8ce", textTransform: "uppercase", letterSpacing: ".06em", color: "#555" }}>Total</td>}
                <td style={tdSt}><span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: tr.label === "Midi" ? ZC.Pergolas : "#1a1a1a" }}>{tr.label}</span></td>
                {zCell(z.Salle, ZC.Salle)}
                {zCell(z.Pergolas, ZC.Pergolas)}
                {zCell(z.Terrasse, ZC.Terrasse)}
                {zCell(z.emp, ZC.emp)}
                <td style={{ ...tdSt, fontWeight: 700, fontSize: 13, color: "#D4775A" }}>{fmt(ca)}</td>
                <td style={{ ...tdSt, fontWeight: 700 }}>{cov}</td>
                <td style={{ ...tdSt, fontSize: 11, fontWeight: 700, color: "#46655a" }}>{spCov || "\u2014"}</td>
                <td style={tdSt}><span style={{ background: "#46655a18", color: "#46655a", padding: "3px 9px", borderRadius: 5, fontSize: 11, fontWeight: 700 }}>{tmSp.toFixed(0)}{"\u20AC"}</span></td>
                <td style={{ ...tdSt, fontSize: 11, fontWeight: 700, color: "#D4775A" }}>{empCov > 0 ? empCov : "\u2014"}</td>
                <td style={tdSt}>{empCov > 0 ? <span style={{ background: "#FFF0EB", color: "#D4775A", padding: "3px 9px", borderRadius: 5, fontSize: 11, fontWeight: 700 }}>{tmEmp.toFixed(0)}{"\u20AC"}</span> : "\u2014"}</td>
                <td style={{ ...tdSt, textAlign: "center" }}></td>
              </tr>
            );
          });
        })()}
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
        data: { labels: data.mix_labels, datasets: [{
          data: vals,
          backgroundColor: getCategoryColors(data.mix_labels),
          borderRadius: 4, borderSkipped: false,
          barPercentage: 0.7, categoryPercentage: 0.85,
        }] },
        options: {
          indexAxis: "y", responsive: true, maintainAspectRatio: false,
          layout: { padding: { right: 100 } },
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${fmt(ctx.raw as number)} — ${((ctx.raw as number) / total * 100).toFixed(1)}%` } } },
          scales: {
            x: { display: false },
            y: { grid: { display: false }, ticks: { color: "#444", font: { size: 12, weight: "bold" as const }, padding: 4 }, border: { display: false } },
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
                ctx.font = "600 11px DM Sans, sans-serif";
                ctx.fillStyle = "#777";
                ctx.textAlign = "left";
                ctx.textBaseline = "middle";
                ctx.fillText(`${Math.round(val).toLocaleString("fr-FR")}\u20AC  ${pct}%`, bar.x + 8, bar.y);
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
