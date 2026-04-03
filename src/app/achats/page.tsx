"use client";

import React, { useEffect, useState, useMemo, useRef, useCallback, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { RequireRole } from "@/components/RequireRole";
import { useEtablissement } from "@/lib/EtablissementContext";
import { supabase } from "@/lib/supabaseClient";
import { getSupplierColor } from "@/lib/supplierColors";
import Chart from "chart.js/auto";
import { FloatingActions, FAIconUpload } from "@/components/layout/FloatingActions";

/* ── Types ── */

type InvoiceRow = {
  id: string;
  invoice_number: string | null;
  invoice_date: string | null;
  total_ht: number | null;
  total_ttc: number | null;
  supplier_id: string | null;
  suppliers: { name: string } | null;
};

type InvoiceLine = {
  id: string;
  name: string | null;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  total_price: number | null;
};

type ViewMode = "mois" | "semaine";

/* ── Helpers ── */

const fmt = (n: number | null) =>
  n == null ? "\u2014" : n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "\u2014";

const MONTH_NAMES = ["Janvier", "Fevrier", "Mars", "Avril", "Mai", "Juin", "Juillet", "Aout", "Septembre", "Octobre", "Novembre", "Decembre"];

/** Get the fiscal year a date belongs to (Oct 1 start). Returns the year the fiscal year starts in. */
function getFiscalYear(date: Date): number {
  return date.getMonth() >= 9 ? date.getFullYear() : date.getFullYear() - 1;
}

/** Get the current fiscal year start year */
function currentFiscalYearStart(): number {
  return getFiscalYear(new Date());
}

/** Build ordered months for a fiscal year starting in October */
function fiscalMonths(fyStart: number): { year: number; month: number; label: string }[] {
  const months: { year: number; month: number; label: string }[] = [];
  for (let i = 0; i < 12; i++) {
    const m = (9 + i) % 12; // Oct=9, Nov=10, ... Sep=8
    const y = m >= 9 ? fyStart : fyStart + 1;
    months.push({ year: y, month: m, label: `${MONTH_NAMES[m]} ${y}` });
  }
  return months;
}

/** Get Monday of the week containing a date */
function getMonday(d: Date): Date {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = copy.getDay() || 7;
  copy.setDate(copy.getDate() - dow + 1);
  return copy;
}

/** Get Sunday of the week containing a date */
function getSunday(d: Date): Date {
  const mon = getMonday(d);
  return new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
}

/** Format date range for a week */
function formatWeekRange(d: Date): string {
  const mon = getMonday(d);
  const sun = getSunday(d);
  const dFmt = (dt: Date) => dt.getDate();
  const mFmt = (dt: Date) => MONTH_NAMES[dt.getMonth()].toLowerCase();
  if (mon.getMonth() === sun.getMonth()) {
    return `Semaine du ${dFmt(mon)} au ${dFmt(sun)} ${mFmt(sun)} ${sun.getFullYear()}`;
  }
  return `Semaine du ${dFmt(mon)} ${mFmt(mon)} au ${dFmt(sun)} ${mFmt(sun)} ${sun.getFullYear()}`;
}

/** Get {from, to} date range based on viewMode and selectedDate */
function getRange(viewMode: ViewMode, selectedDate: string): { from: Date; to: Date } {
  const d = new Date(selectedDate + "T12:00:00");
  if (viewMode === "mois") {
    const from = new Date(d.getFullYear(), d.getMonth(), 1);
    const to = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
    return { from, to };
  }
  // semaine
  const mon = getMonday(d);
  const sun = getSunday(d);
  sun.setHours(23, 59, 59);
  return { from: mon, to: sun };
}

/** Navigate date forward or backward */
function navigateDate(viewMode: ViewMode, selectedDate: string, direction: -1 | 1): string {
  const d = new Date(selectedDate + "T12:00:00");
  if (viewMode === "mois") {
    d.setMonth(d.getMonth() + direction);
  } else {
    d.setDate(d.getDate() + direction * 7);
  }
  return d.toISOString().slice(0, 10);
}

/** Format display for the current selection */
function formatPeriodLabel(viewMode: ViewMode, selectedDate: string): string {
  const d = new Date(selectedDate + "T12:00:00");
  if (viewMode === "mois") {
    return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
  }
  return formatWeekRange(d);
}

/* ── Supplier Categories ── */

const SUPPLIER_CATEGORIES: Record<string, string> = {
  // Alimentaire
  metro: "Alimentaire", mael: "Alimentaire", cozigou: "Alimentaire",
  carniato: "Alimentaire", masse: "Alimentaire", sdpf: "Alimentaire",
  elien: "Alimentaire", terreazur: "Alimentaire",
  // Boissons
  vinoflo: "Boissons", barspirits: "Boissons", lmdw: "Boissons",
  // Services & charges
  elis: "Services", generali: "Services",
};

const CATEGORY_COLORS: Record<string, string> = {
  "Alimentaire": "#46655a",
  "Boissons": "#D4775A",
  "Services": "#2563EB",
  "Autre": "#999",
};

function getSupplierCategory(supplierName: string): string {
  const key = supplierName.toLowerCase().trim().split(/\s+/)[0];
  return SUPPLIER_CATEGORIES[key] ?? "Autre";
}

/* ── Styles ── */

const S = {
  card: { background: "#fff", borderRadius: 12, padding: "18px 20px", border: "1px solid #e0d8ce" } as CSSProperties,
  sec: { fontSize: 9, textTransform: "uppercase" as const, letterSpacing: ".12em", color: "#777", fontWeight: 500, marginBottom: 12 } as CSSProperties,
  kpiValue: { fontFamily: "var(--font-oswald), Oswald, sans-serif", fontWeight: 700, fontSize: 26, color: "#1a1a1a" } as CSSProperties,
  kpiLabel: { fontFamily: "DM Sans, sans-serif", fontSize: 10, textTransform: "uppercase" as const, letterSpacing: ".08em", color: "#999", marginBottom: 8 } as CSSProperties,
};

/* ── Component ── */

export default function AchatsPage() {
  const router = useRouter();
  const etab = useEtablissement();
  const etabId = etab.current?.id ?? null;

  // ── View mode & date navigation ──
  const [viewMode, setViewMode] = useState<ViewMode>("mois");
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date();
    return now.toISOString().slice(0, 10);
  });

  // ── All invoices ──
  const [allInvoices, setAllInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Accordion state ──
  const [openDashMonth, setOpenDashMonth] = useState<string | null>(null);
  const [dashOpenSupplier, setDashOpenSupplier] = useState<string | null>(null);
  const [dashSelectedInvoice, setDashSelectedInvoice] = useState<string | null>(null);
  const [dashLines, setDashLines] = useState<InvoiceLine[]>([]);
  const [dashLinesLoading, setDashLinesLoading] = useState(false);
  const [archivesOpen, setArchivesOpen] = useState(false);
  const [archiveYearOpen, setArchiveYearOpen] = useState<number | null>(null);
  const [evoArchivesOpen, setEvoArchivesOpen] = useState(false);
  const [evoView, setEvoView] = useState<"supplier" | "category">("supplier");

  // ── Top products state ──
  type TopProduct = { name: string; supplier: string; totalPrice: number; quantity: number; unit: string; lastUnitPrice: number };
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [topProductsLoading, setTopProductsLoading] = useState(false);
  const [topProductsLimit, setTopProductsLimit] = useState(20);
  const [topSupplierFilter, setTopSupplierFilter] = useState("");

  // ── Chart refs ──
  const evoChartRef = useRef<HTMLCanvasElement>(null);
  const evoChartInstance = useRef<Chart | null>(null);
  const supplierBarRef = useRef<HTMLCanvasElement>(null);
  const supplierBarInstance = useRef<Chart | null>(null);

  // ── Load ALL invoices ──
  useEffect(() => {
    if (!etabId) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("supplier_invoices")
        .select("id, invoice_number, invoice_date, total_ht, total_ttc, supplier_id, suppliers(name)")
        .eq("etablissement_id", etabId)
        .order("invoice_date", { ascending: false });
      setAllInvoices((data ?? []) as unknown as InvoiceRow[]);
      setLoading(false);
    })();
  }, [etabId]);

  // ══════════════════════════════════════════════════════
  //  DATE RANGE
  // ══════════════════════════════════════════════════════

  const range = useMemo(() => getRange(viewMode, selectedDate), [viewMode, selectedDate]);
  const periodLabel = useMemo(() => formatPeriodLabel(viewMode, selectedDate), [viewMode, selectedDate]);

  const handleNav = useCallback((dir: -1 | 1) => {
    setSelectedDate((prev) => navigateDate(viewMode, prev, dir));
  }, [viewMode]);

  // ── Filtered invoices for selected range ──
  const rangeInvoices = useMemo(() => {
    return allInvoices.filter((inv) => {
      if (!inv.invoice_date) return false;
      const d = new Date(inv.invoice_date);
      return d >= range.from && d <= range.to;
    });
  }, [allInvoices, range]);

  // ── Load top products for range ──
  useEffect(() => {
    if (!etabId || loading) return;
    const ids = rangeInvoices.map((i) => i.id);
    if (ids.length === 0) { setTopProducts([]); return; }
    (async () => {
      setTopProductsLoading(true);
      const chunkSize = 200;
      const allLines: { name: string | null; quantity: number | null; unit: string | null; unit_price: number | null; total_price: number | null; invoice_id: string }[] = [];
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        const { data } = await supabase
          .from("supplier_invoice_lines")
          .select("name, quantity, unit, unit_price, total_price, invoice_id")
          .in("invoice_id", chunk);
        if (data) allLines.push(...(data as typeof allLines));
      }
      const invSupplierMap: Record<string, string> = {};
      for (const inv of rangeInvoices) {
        invSupplierMap[inv.id] = inv.suppliers?.name ?? "Inconnu";
      }
      const agg: Record<string, { name: string; supplier: string; totalPrice: number; quantity: number; unit: string; lastUnitPrice: number }> = {};
      for (const l of allLines) {
        const pName = (l.name ?? "").trim();
        if (!pName) continue;
        const supplier = invSupplierMap[l.invoice_id] ?? "Inconnu";
        const key = `${pName.toLowerCase()}||${supplier.toLowerCase()}`;
        if (!agg[key]) agg[key] = { name: pName, supplier, totalPrice: 0, quantity: 0, unit: l.unit ?? "", lastUnitPrice: l.unit_price ?? 0 };
        agg[key].totalPrice += l.total_price ?? 0;
        agg[key].quantity += l.quantity ?? 0;
        if (l.unit_price != null) agg[key].lastUnitPrice = l.unit_price;
        if (l.unit) agg[key].unit = l.unit;
      }
      const sorted = Object.values(agg).sort((a, b) => b.totalPrice - a.totalPrice);
      setTopProducts(sorted);
      setTopProductsLoading(false);
    })();
  }, [rangeInvoices, etabId, loading]);

  // ── Unique supplier names for filter dropdown ──
  const topProductSuppliers = useMemo(() => {
    const set = new Set(topProducts.map((p) => p.supplier));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "fr"));
  }, [topProducts]);

  // ── Filtered top products ──
  const filteredTopProducts = useMemo(() => {
    let result = topProducts;
    if (topSupplierFilter) result = result.filter((p) => p.supplier === topSupplierFilter);
    return result;
  }, [topProducts, topSupplierFilter]);

  // ══════════════════════════════════════════════════════
  //  COMPUTED DATA
  // ══════════════════════════════════════════════════════

  const now = new Date();
  const curMonth = now.getMonth();
  const curYear = now.getFullYear();
  const curFY = currentFiscalYearStart();

  // ── KPIs (based on selected range) ──
  const dashKpis = useMemo(() => {
    const thisRange = rangeInvoices;

    // Previous period for comparison
    let prevFrom: Date;
    let prevTo: Date;
    if (viewMode === "mois") {
      const d = new Date(selectedDate + "T12:00:00");
      prevFrom = new Date(d.getFullYear(), d.getMonth() - 1, 1);
      prevTo = new Date(d.getFullYear(), d.getMonth(), 0, 23, 59, 59);
    } else {
      prevFrom = new Date(range.from);
      prevFrom.setDate(prevFrom.getDate() - 7);
      prevTo = new Date(range.to);
      prevTo.setDate(prevTo.getDate() - 7);
    }

    const prevRange = allInvoices.filter((inv) => {
      if (!inv.invoice_date) return false;
      const d = new Date(inv.invoice_date);
      return d >= prevFrom && d <= prevTo;
    });

    const totalHT = thisRange.reduce((s, r) => s + (r.total_ht ?? 0), 0);
    const prevTotalHT = prevRange.reduce((s, r) => s + (r.total_ht ?? 0), 0);
    const nbFactures = thisRange.length;

    const variationPct = prevTotalHT > 0 ? ((totalHT - prevTotalHT) / prevTotalHT) * 100 : null;

    // Monthly average across fiscal year
    const fyStart = new Date(curFY, 9, 1); // Oct 1
    const monthEnd = new Date(curYear, curMonth + 1, 0, 23, 59, 59);
    const fyInvoices = allInvoices.filter((inv) => {
      if (!inv.invoice_date) return false;
      const d = new Date(inv.invoice_date);
      return d >= fyStart && d <= monthEnd;
    });
    const fyTotal = fyInvoices.reduce((s, r) => s + (r.total_ht ?? 0), 0);
    const elapsedMonths = Math.max(1, (curYear - curFY) * 12 + curMonth - 9 + 1);
    const monthlyAvg = fyTotal / Math.max(1, Math.min(elapsedMonths, 12));

    return { totalHT, nbFactures, variationPct, monthlyAvg };
  }, [allInvoices, rangeInvoices, viewMode, selectedDate, range, curMonth, curYear, curFY]);

  // ── Monthly breakdown for evolution chart ──
  type MonthBreakdown = {
    key: string;
    label: string;
    year: number;
    month: number;
    totalHT: number;
    suppliers: { name: string; total: number; color: string }[];
    categories: { name: string; total: number; color: string }[];
  };

  const monthlyBreakdown = useMemo(() => {
    const map: Record<string, { year: number; month: number; invoices: InvoiceRow[] }> = {};
    for (const inv of allInvoices) {
      if (!inv.invoice_date) continue;
      const d = new Date(inv.invoice_date);
      const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
      if (!map[key]) map[key] = { year: d.getFullYear(), month: d.getMonth(), invoices: [] };
      map[key].invoices.push(inv);
    }

    const result: MonthBreakdown[] = [];
    for (const [key, { year, month, invoices }] of Object.entries(map)) {
      const totalHT = invoices.reduce((s, i) => s + (i.total_ht ?? 0), 0);
      const bySupp: Record<string, { name: string; total: number }> = {};
      const byCat: Record<string, number> = {};
      for (const inv of invoices) {
        const name = inv.suppliers?.name ?? "Inconnu";
        const k = name.toLowerCase().trim();
        if (!bySupp[k]) bySupp[k] = { name, total: 0 };
        bySupp[k].total += inv.total_ht ?? 0;
        const cat = getSupplierCategory(name);
        byCat[cat] = (byCat[cat] ?? 0) + (inv.total_ht ?? 0);
      }
      const suppliers = Object.entries(bySupp)
        .map(([k, v]) => ({ name: v.name, total: v.total, color: getSupplierColor(k) }))
        .sort((a, b) => b.total - a.total);

      const categories = Object.entries(byCat)
        .map(([cat, total]) => ({ name: cat, total, color: CATEGORY_COLORS[cat] ?? "#999" }))
        .sort((a, b) => b.total - a.total);

      result.push({ key, label: `${MONTH_NAMES[month]} ${year}`, year, month, totalHT, suppliers, categories });
    }
    result.sort((a, b) => a.key.localeCompare(b.key));
    return result;
  }, [allInvoices]);

  // Split into current FY months and archive FY months
  const curFYMonths = useMemo(() => {
    const fyMonthKeys = fiscalMonths(curFY).map((m) => `${m.year}-${String(m.month).padStart(2, "0")}`);
    return monthlyBreakdown.filter((m) => fyMonthKeys.includes(m.key));
  }, [monthlyBreakdown, curFY]);

  const archiveFYs = useMemo(() => {
    const fyMonthKeys = new Set(fiscalMonths(curFY).map((m) => `${m.year}-${String(m.month).padStart(2, "0")}`));
    const archiveMonths = monthlyBreakdown.filter((m) => !fyMonthKeys.has(m.key));

    // Group by fiscal year
    const byFY: Record<number, MonthBreakdown[]> = {};
    for (const m of archiveMonths) {
      const fy = getFiscalYear(new Date(m.year, m.month, 1));
      if (!byFY[fy]) byFY[fy] = [];
      byFY[fy].push(m);
    }
    return Object.entries(byFY)
      .map(([fy, months]) => ({ fyStart: Number(fy), label: `${fy}/${Number(fy) + 1}`, months }))
      .sort((a, b) => b.fyStart - a.fyStart);
  }, [monthlyBreakdown, curFY]);

  // ── Invoices grouped by month for bottom section ──
  type MonthGroup = {
    key: string;
    label: string;
    year: number;
    month: number;
    totalHT: number;
    nbInvoices: number;
    bySupplier: { name: string; color: string; invoices: InvoiceRow[] }[];
  };

  const invoicesByMonth = useMemo(() => {
    const map: Record<string, { year: number; month: number; invoices: InvoiceRow[] }> = {};
    for (const inv of allInvoices) {
      if (!inv.invoice_date) continue;
      const d = new Date(inv.invoice_date);
      const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
      if (!map[key]) map[key] = { year: d.getFullYear(), month: d.getMonth(), invoices: [] };
      map[key].invoices.push(inv);
    }

    const result: MonthGroup[] = [];
    for (const [key, { year, month, invoices }] of Object.entries(map)) {
      const totalHT = invoices.reduce((s, i) => s + (i.total_ht ?? 0), 0);
      const bySupp: Record<string, { name: string; color: string; invoices: InvoiceRow[] }> = {};
      for (const inv of invoices) {
        const name = inv.suppliers?.name ?? "Inconnu";
        const k = name.toLowerCase().trim();
        if (!bySupp[k]) bySupp[k] = { name, color: getSupplierColor(k), invoices: [] };
        bySupp[k].invoices.push(inv);
      }
      const bySupplier = Object.values(bySupp).sort((a, b) =>
        b.invoices.reduce((s, i) => s + (i.total_ht ?? 0), 0) - a.invoices.reduce((s, i) => s + (i.total_ht ?? 0), 0)
      );
      result.push({ key, label: `${MONTH_NAMES[month]} ${year}`, year, month, totalHT, nbInvoices: invoices.length, bySupplier });
    }
    result.sort((a, b) => b.key.localeCompare(a.key));
    return result;
  }, [allInvoices]);

  const curFYInvoiceMonths = useMemo(() => {
    const fyMonthKeys = new Set(fiscalMonths(curFY).map((m) => `${m.year}-${String(m.month).padStart(2, "0")}`));
    return invoicesByMonth.filter((m) => fyMonthKeys.has(m.key));
  }, [invoicesByMonth, curFY]);

  const archiveInvoiceFYs = useMemo(() => {
    const fyMonthKeys = new Set(fiscalMonths(curFY).map((m) => `${m.year}-${String(m.month).padStart(2, "0")}`));
    const archiveMonths = invoicesByMonth.filter((m) => !fyMonthKeys.has(m.key));
    const byFY: Record<number, MonthGroup[]> = {};
    for (const m of archiveMonths) {
      const fy = getFiscalYear(new Date(m.year, m.month, 1));
      if (!byFY[fy]) byFY[fy] = [];
      byFY[fy].push(m);
    }
    return Object.entries(byFY)
      .map(([fy, months]) => ({ fyStart: Number(fy), label: `${fy}/${Number(fy) + 1}`, months: months.sort((a, b) => b.key.localeCompare(a.key)) }))
      .sort((a, b) => b.fyStart - a.fyStart);
  }, [invoicesByMonth, curFY]);

  // ── Supplier totals for bar chart (selected range) ──
  const supplierTotalsRange = useMemo(() => {
    const bySupp: Record<string, { name: string; total: number }> = {};
    for (const inv of rangeInvoices) {
      const name = inv.suppliers?.name ?? "Inconnu";
      const k = name.toLowerCase().trim();
      if (!bySupp[k]) bySupp[k] = { name, total: 0 };
      bySupp[k].total += inv.total_ht ?? 0;
    }
    const sorted = Object.entries(bySupp)
      .map(([k, v]) => ({ key: k, name: v.name, total: v.total, color: getSupplierColor(k) }))
      .sort((a, b) => b.total - a.total);

    // Max 10 suppliers, group rest as "Autres"
    if (sorted.length > 10) {
      const top = sorted.slice(0, 10);
      const rest = sorted.slice(10).reduce((s, r) => s + r.total, 0);
      if (rest > 0) top.push({ key: "autres", name: "Autres", total: rest, color: "#999" });
      return top;
    }
    return sorted;
  }, [rangeInvoices]);

  // ── Invoices grouped for accordion (selected range) ──
  const rangeInvoiceGroups = useMemo(() => {
    // Group range invoices by supplier
    const bySupp: Record<string, { name: string; color: string; invoices: InvoiceRow[] }> = {};
    for (const inv of rangeInvoices) {
      const name = inv.suppliers?.name ?? "Inconnu";
      const k = name.toLowerCase().trim();
      if (!bySupp[k]) bySupp[k] = { name, color: getSupplierColor(k), invoices: [] };
      bySupp[k].invoices.push(inv);
    }
    return Object.values(bySupp).sort((a, b) =>
      b.invoices.reduce((s, i) => s + (i.total_ht ?? 0), 0) - a.invoices.reduce((s, i) => s + (i.total_ht ?? 0), 0)
    );
  }, [rangeInvoices]);

  // ══════════════════════════════════════════════════════
  //  CHART.JS — Evolution mensuelle (VERTICAL stacked bar)
  // ══════════════════════════════════════════════════════

  const evoChartData = useMemo(() => {
    const months = curFYMonths;
    const labels = months.map((m) => MONTH_NAMES[m.month].slice(0, 3));

    if (evoView === "category") {
      const cats = ["Alimentaire", "Boissons", "Services", "Autre"];
      const datasets = cats.map((cat) => ({
        label: cat,
        data: months.map((m) => {
          const found = m.categories.find((c) => c.name === cat);
          return found ? found.total : 0;
        }),
        backgroundColor: CATEGORY_COLORS[cat] ?? "#999",
        borderRadius: 3,
      }));
      return { labels, datasets };
    } else {
      // Collect all unique suppliers across months
      const allSuppliers = new Map<string, { name: string; color: string }>();
      for (const m of months) {
        for (const s of m.suppliers) {
          const k = s.name.toLowerCase().trim();
          if (!allSuppliers.has(k)) allSuppliers.set(k, { name: s.name, color: s.color });
        }
      }
      const datasets = Array.from(allSuppliers.entries()).map(([k, { name, color }]) => ({
        label: name,
        data: months.map((m) => {
          const found = m.suppliers.find((s) => s.name.toLowerCase().trim() === k);
          return found ? found.total : 0;
        }),
        backgroundColor: color,
        borderRadius: 3,
      }));
      return { labels, datasets };
    }
  }, [curFYMonths, evoView]);

  useEffect(() => {
    if (!evoChartRef.current || loading || curFYMonths.length === 0) return;
    if (evoChartInstance.current) evoChartInstance.current.destroy();
    evoChartInstance.current = new Chart(evoChartRef.current, {
      type: "bar",
      data: evoChartData,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ${fmt(ctx.parsed.y)}`,
            },
          },
        },
        scales: {
          x: {
            stacked: true,
            ticks: { font: { size: 10 }, color: "#999" },
            grid: { display: false },
          },
          y: {
            stacked: true,
            ticks: {
              callback: (v) => {
                const n = typeof v === "number" ? v : parseFloat(String(v));
                return n >= 1000 ? Math.round(n / 1000) + "k" : String(Math.round(n));
              },
              font: { size: 10 },
              color: "#999",
            },
            grid: { color: "#f2ede4" },
          },
        },
      },
    });
    return () => { evoChartInstance.current?.destroy(); evoChartInstance.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evoChartData, loading]);

  // ══════════════════════════════════════════════════════
  //  CHART.JS — Horizontal bar (suppliers, selected range)
  // ══════════════════════════════════════════════════════

  useEffect(() => {
    if (!supplierBarRef.current || loading || supplierTotalsRange.length === 0) return;
    if (supplierBarInstance.current) supplierBarInstance.current.destroy();
    supplierBarInstance.current = new Chart(supplierBarRef.current, {
      type: "bar",
      data: {
        labels: supplierTotalsRange.map((s) => s.name),
        datasets: [{
          data: supplierTotalsRange.map((s) => s.total),
          backgroundColor: supplierTotalsRange.map((s) => s.color),
          borderRadius: 4,
          barThickness: 18,
        }],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => fmt(ctx.parsed.x),
            },
          },
        },
        scales: {
          x: {
            ticks: {
              callback: (v) => {
                const n = typeof v === "number" ? v : parseFloat(String(v));
                return n >= 1000 ? Math.round(n / 1000) + "k" : String(Math.round(n));
              },
              font: { size: 10 },
              color: "#999",
            },
            grid: { color: "#f2ede4" },
          },
          y: {
            ticks: { font: { size: 11, family: "DM Sans, sans-serif" }, color: "#555" },
            grid: { display: false },
          },
        },
      },
    });
    return () => { supplierBarInstance.current?.destroy(); supplierBarInstance.current = null; };
  }, [supplierTotalsRange, loading]);

  // ══════════════════════════════════════════════════════
  //  ACTIONS
  // ══════════════════════════════════════════════════════

  const loadDashLines = async (invoiceId: string) => {
    if (dashSelectedInvoice === invoiceId) { setDashSelectedInvoice(null); setDashLines([]); return; }
    setDashSelectedInvoice(invoiceId);
    setDashLinesLoading(true);
    const { data } = await supabase
      .from("supplier_invoice_lines")
      .select("id, name, quantity, unit, unit_price, total_price")
      .eq("invoice_id", invoiceId)
      .order("name");
    setDashLines((data ?? []) as InvoiceLine[]);
    setDashLinesLoading(false);
  };

  const thStyle: React.CSSProperties = { padding: "8px 10px", fontWeight: 600, color: "#999", fontSize: 11, textAlign: "left" };
  const tdStyle: React.CSSProperties = { padding: "8px 10px", fontSize: 13 };
  const tdR: React.CSSProperties = { ...tdStyle, textAlign: "right" };

  const pillStyle = (active: boolean): CSSProperties => ({
    fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 12, fontWeight: 700,
    padding: "6px 16px", borderRadius: 20, cursor: "pointer",
    border: active ? "1.5px solid #D4775A" : "1px solid #ddd6c8",
    background: active ? "#D4775A" : "#fff",
    color: active ? "#fff" : "#777",
    textTransform: "uppercase", letterSpacing: "0.06em",
  });

  const navBtnStyle: CSSProperties = {
    background: "#fff", border: "1px solid #ddd6c8", borderRadius: 8,
    width: 32, height: 32, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 16, color: "#777", fontWeight: 700,
  };

  // ── Render helper: invoice lines table ──
  const renderLinesTable = (lns: InvoiceLine[], isLoading: boolean) => (
    <div style={{ background: "#faf6ef", padding: "12px 16px" }}>
      {isLoading ? (
        <p style={{ color: "#999", fontSize: 12, margin: 0 }}>Chargement...</p>
      ) : lns.length === 0 ? (
        <p style={{ color: "#999", fontSize: 12, margin: 0 }}>Aucune ligne importee pour cette facture.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #ddd6c8" }}>
              <th style={{ ...thStyle, fontSize: 10 }}>Article</th>
              <th style={{ ...thStyle, fontSize: 10, textAlign: "right" }}>Qte</th>
              <th style={{ ...thStyle, fontSize: 10 }}>Unite</th>
              <th style={{ ...thStyle, fontSize: 10, textAlign: "right" }}>PU</th>
              <th style={{ ...thStyle, fontSize: 10, textAlign: "right" }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {lns.map((l) => (
              <tr key={l.id} style={{ borderBottom: "1px solid #eee6d8" }}>
                <td style={{ padding: "6px 10px", fontSize: 12 }}>{l.name ?? "\u2014"}</td>
                <td style={{ padding: "6px 10px", fontSize: 12, textAlign: "right" }}>{l.quantity ?? "\u2014"}</td>
                <td style={{ padding: "6px 10px", fontSize: 12, color: "#999" }}>{l.unit ?? ""}</td>
                <td style={{ padding: "6px 10px", fontSize: 12, textAlign: "right" }}>{fmt(l.unit_price)}</td>
                <td style={{ padding: "6px 10px", fontSize: 12, textAlign: "right" }}>{fmt(l.total_price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );

  // ── Render helper: month accordion for invoices ──
  const renderMonthAccordion = (mg: MonthGroup) => {
    const isOpen = openDashMonth === mg.key;
    return (
      <div key={mg.key} style={{ border: "1px solid #ddd6c8", borderRadius: 10, overflow: "hidden" }}>
        <div
          onClick={() => { setOpenDashMonth(isOpen ? null : mg.key); setDashOpenSupplier(null); setDashSelectedInvoice(null); setDashLines([]); }}
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "12px 16px", cursor: "pointer",
            background: isOpen ? "#f5f0e8" : "#fff", transition: "background 0.15s",
          }}
          onMouseEnter={(e) => { if (!isOpen) e.currentTarget.style.background = "#faf6ef"; }}
          onMouseLeave={(e) => { if (!isOpen) e.currentTarget.style.background = isOpen ? "#f5f0e8" : "#fff"; }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12, color: "#999", transition: "transform 0.2s", transform: isOpen ? "rotate(90deg)" : "rotate(0deg)" }}>&#9654;</span>
            <span style={{ fontFamily: "DM Sans, sans-serif", fontWeight: 600, fontSize: 14, color: "#1a1a1a" }}>{mg.label}</span>
            <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 11, color: "#999", background: "#f2ede4", borderRadius: 8, padding: "2px 8px" }}>
              {mg.nbInvoices} facture{mg.nbInvoices > 1 ? "s" : ""}
            </span>
          </div>
          <span style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 14, fontWeight: 700, color: "#1a1a1a" }}>{fmt(mg.totalHT)} HT</span>
        </div>

        {isOpen && (
          <div style={{ borderTop: "1px solid #ddd6c8", padding: "0" }}>
            {mg.bySupplier.map((sup) => {
              const suppKey = sup.name.toLowerCase().trim();
              const isSuppOpen = dashOpenSupplier === `${mg.key}-${suppKey}`;
              const suppTotal = sup.invoices.reduce((s, i) => s + (i.total_ht ?? 0), 0);
              return (
                <div key={suppKey}>
                  <div
                    onClick={() => { setDashOpenSupplier(isSuppOpen ? null : `${mg.key}-${suppKey}`); setDashSelectedInvoice(null); setDashLines([]); }}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "10px 16px 10px 32px", cursor: "pointer", borderBottom: "1px solid #eee6d8",
                      background: isSuppOpen ? "#faf6ef" : "transparent",
                    }}
                    onMouseEnter={(e) => { if (!isSuppOpen) e.currentTarget.style.background = "#faf6ef"; }}
                    onMouseLeave={(e) => { if (!isSuppOpen) e.currentTarget.style.background = isSuppOpen ? "#faf6ef" : "transparent"; }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: sup.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: "#999", transition: "transform 0.2s", transform: isSuppOpen ? "rotate(90deg)" : "rotate(0deg)" }}>&#9654;</span>
                      <span style={{ fontFamily: "DM Sans, sans-serif", fontWeight: 600, fontSize: 13, color: "#1a1a1a" }}>{sup.name}</span>
                      <span style={{ fontSize: 10, color: "#999" }}>{sup.invoices.length} fact.</span>
                    </div>
                    <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 12, fontWeight: 600, color: "#1a1a1a" }}>{fmt(suppTotal)} HT</span>
                  </div>

                  {isSuppOpen && (
                    <div style={{ borderTop: "1px solid #eee6d8" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "DM Sans, sans-serif" }}>
                        <thead>
                          <tr style={{ borderBottom: "1px solid #eee6d8" }}>
                            <th style={{ ...thStyle, paddingLeft: 48 }}>Date</th>
                            <th style={thStyle}>N facture</th>
                            <th style={thStyle}>Fournisseur</th>
                            <th style={{ ...thStyle, textAlign: "right" }}>Total HT</th>
                            <th style={{ ...thStyle, textAlign: "right" }}>Total TTC</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sup.invoices.map((inv) => {
                            const isSelected = dashSelectedInvoice === inv.id;
                            return (
                              <React.Fragment key={inv.id}>
                                <tr
                                  onClick={() => loadDashLines(inv.id)}
                                  style={{ borderBottom: "1px solid #eee6d8", cursor: "pointer", background: isSelected ? "#f5f0e8" : "transparent" }}
                                  onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "#faf6ef"; }}
                                  onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = isSelected ? "#f5f0e8" : "transparent"; }}
                                >
                                  <td style={{ ...tdStyle, paddingLeft: 48 }}>{fmtDate(inv.invoice_date)}</td>
                                  <td style={{ ...tdStyle, color: "#666" }}>{inv.invoice_number ?? "\u2014"}</td>
                                  <td style={tdStyle}>{inv.suppliers?.name ?? "Inconnu"}</td>
                                  <td style={tdR}>{fmt(inv.total_ht)}</td>
                                  <td style={tdR}>{fmt(inv.total_ttc)}</td>
                                </tr>
                                {isSelected && (
                                  <tr>
                                    <td colSpan={5} style={{ padding: 0 }}>
                                      {renderLinesTable(dashLines, dashLinesLoading)}
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px 40px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h1 style={{
            fontFamily: "var(--font-oswald), Oswald, sans-serif", fontWeight: 700, fontSize: 24,
            color: "#1a1a1a", margin: 0, textTransform: "uppercase", letterSpacing: "0.04em",
          }}>
            Achats
          </h1>
          <button
            onClick={() => router.push("/invoices")}
            style={{
              fontFamily: "DM Sans, sans-serif", fontSize: 12, fontWeight: 600,
              background: "#D4775A", color: "#fff", border: "none", borderRadius: 20,
              padding: "8px 18px", cursor: "pointer",
            }}
          >
            Importer une facture
          </button>
        </div>

        {/* ══════════════════════════════════════════════════ */}
        {/*  VIEW TABS + DATE NAVIGATION                     */}
        {/* ══════════════════════════════════════════════════ */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
          {/* View mode pills + page nav pills */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ display: "flex", gap: 6 }}>
              {(["mois", "semaine"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  style={pillStyle(viewMode === mode)}
                >
                  {mode === "mois" ? "Mensuel" : "Hebdo"}
                </button>
              ))}
            </div>
            {/* Page nav pills: Factures / Commandes */}
            <div style={{ display: "inline-flex", background: "#fff", border: "1px solid rgba(0,0,0,.08)", borderRadius: 20, padding: 3 }}>
              <span style={{
                padding: "5px 16px", borderRadius: 16, fontSize: 11, fontWeight: 600, cursor: "default",
                background: "#D4775A", color: "#fff",
                fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
              }}>Factures</span>
              <button type="button" onClick={() => router.push("/commandes")} style={{
                padding: "5px 16px", borderRadius: 16, fontSize: 11, fontWeight: 600, cursor: "pointer",
                background: "transparent", color: "#777", border: "none",
                fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
              }}>Commandes</button>
            </div>
          </div>

          {/* Date navigation */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={() => handleNav(-1)} style={navBtnStyle}>&larr;</button>
            <div style={{
              fontFamily: "var(--font-oswald), Oswald, sans-serif", fontWeight: 700, fontSize: 16,
              color: "#1a1a1a", textTransform: "capitalize", minWidth: 200, textAlign: "center",
            }}>
              {periodLabel}
            </div>
            <button onClick={() => handleNav(1)} style={navBtnStyle}>&rarr;</button>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => { if (e.target.value) setSelectedDate(e.target.value); }}
              style={{
                fontFamily: "DM Sans, sans-serif", fontSize: 12, padding: "5px 10px",
                border: "1px solid #ddd6c8", borderRadius: 8, color: "#777", background: "#fff",
                marginLeft: 4,
              }}
            />
          </div>
        </div>

        {loading ? (
          <p style={{ color: "#999", fontSize: 14, textAlign: "center", marginTop: 40 }}>Chargement...</p>
        ) : (
          <>
            {/* ══════════════════════════════════════════════════ */}
            {/*  A) HERO — 5 KPI CARDS                           */}
            {/* ══════════════════════════════════════════════════ */}
            <div style={S.sec}>Synthese — {periodLabel}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 32 }}>
              {/* Total achats HT */}
              <div style={{ ...S.card, flex: "1 1 160px", minWidth: 140 }}>
                <div style={S.kpiLabel}>Total achats (HT)</div>
                <div style={S.kpiValue}>{fmt(dashKpis.totalHT)}</div>
                {dashKpis.variationPct !== null && (
                  <div style={{ fontSize: 11, color: dashKpis.variationPct <= 0 ? "#166534" : "#991b1b", marginTop: 4, fontFamily: "DM Sans, sans-serif", fontWeight: 600 }}>
                    {dashKpis.variationPct > 0 ? "+" : ""}{dashKpis.variationPct.toFixed(1)}% vs {viewMode === "mois" ? "mois" : "sem."} prec.
                  </div>
                )}
              </div>

              {/* Nb factures */}
              <div style={{ ...S.card, flex: "1 1 140px", minWidth: 120 }}>
                <div style={S.kpiLabel}>Factures</div>
                <div style={S.kpiValue}>{dashKpis.nbFactures}</div>
              </div>

              {/* Moyenne mensuelle */}
              <div style={{ ...S.card, flex: "1 1 160px", minWidth: 140 }}>
                <div style={S.kpiLabel}>Moy. mensuelle (exercice)</div>
                <div style={S.kpiValue}>{fmt(dashKpis.monthlyAvg)}</div>
              </div>
            </div>

            {/* ══════════════════════════════════════════════════ */}
            {/*  B) CHARTS — Evolution + Doughnut side by side   */}
            {/* ══════════════════════════════════════════════════ */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ ...S.sec, marginBottom: 0 }}>Analyse — Exercice {curFY}/{curFY + 1}</div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 14, marginBottom: 14 }}>
              {/* Left: VERTICAL stacked bar chart */}
              <div style={S.card}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 12, fontWeight: 600, color: "#777" }}>Evolution mensuelle</span>
                  <div style={{ display: "flex", gap: 4 }}>
                    {(["supplier", "category"] as const).map((v) => (
                      <button
                        key={v}
                        onClick={() => setEvoView(v)}
                        style={{
                          fontFamily: "DM Sans, sans-serif", fontSize: 10, fontWeight: 600,
                          padding: "3px 10px", borderRadius: 14, cursor: "pointer",
                          border: evoView === v ? "1.5px solid #D4775A" : "1px solid #ddd6c8",
                          background: evoView === v ? "#D4775A" : "#fff",
                          color: evoView === v ? "#fff" : "#777",
                        }}
                      >
                        {v === "supplier" ? "Par fournisseur" : "Par categorie"}
                      </button>
                    ))}
                  </div>
                </div>
                {curFYMonths.length === 0 ? (
                  <p style={{ color: "#999", fontSize: 13, margin: 0 }}>Aucune donnee pour cet exercice.</p>
                ) : (
                  <div style={{ height: 300, position: "relative" }}>
                    <canvas ref={evoChartRef} />
                  </div>
                )}
                {/* Legend */}
                {curFYMonths.length > 0 && evoView === "supplier" && (() => {
                  const allSuppliers = new Map<string, { name: string; color: string }>();
                  for (const m of curFYMonths) {
                    for (const s of m.suppliers) {
                      const k = s.name.toLowerCase().trim();
                      if (!allSuppliers.has(k)) allSuppliers.set(k, { name: s.name, color: s.color });
                    }
                  }
                  return (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 14, paddingTop: 10, borderTop: "1px solid #eee6d8" }}>
                      {Array.from(allSuppliers.values()).map((s) => (
                        <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0 }} />
                          <span style={{ fontSize: 10, color: "#999", fontFamily: "DM Sans, sans-serif" }}>{s.name}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
                {curFYMonths.length > 0 && evoView === "category" && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 14, paddingTop: 10, borderTop: "1px solid #eee6d8" }}>
                    {Object.entries(CATEGORY_COLORS).map(([name, color]) => (
                      <div key={name} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
                        <span style={{ fontSize: 10, color: "#999", fontFamily: "DM Sans, sans-serif" }}>{name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Right: supplier breakdown */}
              <div style={S.card}>
                <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 12, fontWeight: 600, color: "#777", marginBottom: 14 }}>
                  Repartition par fournisseur
                </div>
                {supplierTotalsRange.length === 0 ? (
                  <p style={{ color: "#999", fontSize: 13, margin: 0 }}>Aucune donnee.</p>
                ) : (
                  <>
                    {/* Summary table */}
                    <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 14, fontSize: 11, fontFamily: "DM Sans, sans-serif" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid #eee6d8" }}>
                          <th style={{ padding: "4px 6px", fontWeight: 600, color: "#999", fontSize: 10, textAlign: "left" }}></th>
                          <th style={{ padding: "4px 6px", fontWeight: 600, color: "#999", fontSize: 10, textAlign: "left" }}>Fournisseur</th>
                          <th style={{ padding: "4px 6px", fontWeight: 600, color: "#999", fontSize: 10, textAlign: "right" }}>Total</th>
                          <th style={{ padding: "4px 6px", fontWeight: 600, color: "#999", fontSize: 10, textAlign: "right" }}>%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const grandTotal = supplierTotalsRange.reduce((s, r) => s + r.total, 0);
                          return supplierTotalsRange.map((sup) => (
                            <tr key={sup.key} style={{ borderBottom: "1px solid #f2ede4" }}>
                              <td style={{ padding: "4px 6px", width: 16 }}>
                                <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: sup.color }} />
                              </td>
                              <td style={{ padding: "4px 6px", color: "#1a1a1a", fontSize: 11 }}>{sup.name}</td>
                              <td style={{ padding: "4px 6px", textAlign: "right", fontWeight: 600, color: "#1a1a1a", fontSize: 11 }}>{fmt(sup.total)}</td>
                              <td style={{ padding: "4px 6px", textAlign: "right", color: "#999", fontSize: 11 }}>{grandTotal > 0 ? ((sup.total / grandTotal) * 100).toFixed(1) : "0"}%</td>
                            </tr>
                          ));
                        })()}
                      </tbody>
                    </table>
                    {/* Horizontal bar chart */}
                    <div style={{ height: Math.max(supplierTotalsRange.length * 28, 120), position: "relative" }}>
                      <canvas ref={supplierBarRef} />
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Archive FY evolution */}
            {archiveFYs.length > 0 && (
              <div style={{ marginBottom: 28 }}>
                <div
                  onClick={() => setEvoArchivesOpen(!evoArchivesOpen)}
                  style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "8px 0" }}
                >
                  <span style={{ fontSize: 11, color: "#999", transition: "transform 0.2s", transform: evoArchivesOpen ? "rotate(90deg)" : "rotate(0deg)" }}>&#9654;</span>
                  <span style={{ ...S.sec, marginBottom: 0 }}>Archives</span>
                </div>
                {evoArchivesOpen && archiveFYs.map((afy) => (
                  <div key={afy.fyStart} style={{ ...S.card, marginBottom: 10, marginTop: 6, padding: "14px 20px" }}>
                    <div style={{ fontFamily: "DM Sans, sans-serif", fontWeight: 600, fontSize: 12, color: "#999", marginBottom: 10 }}>
                      Exercice {afy.label}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      {afy.months.map((mb) => {
                        const archiveMax = Math.max(...afy.months.map((m) => m.totalHT), 1);
                        const barW = (mb.totalHT / archiveMax) * 100;
                        return (
                          <div key={mb.key} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
                            <div style={{ width: 100, flexShrink: 0, fontFamily: "DM Sans, sans-serif", fontSize: 11, color: "#999", textAlign: "right" }}>
                              {MONTH_NAMES[mb.month].slice(0, 3)} {mb.year}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: "flex", height: 18, borderRadius: 4, overflow: "hidden", width: `${Math.max(barW, 2)}%` }}>
                                {mb.suppliers.map((sup, i) => {
                                  const pct = (sup.total / mb.totalHT) * 100;
                                  return <div key={i} title={`${sup.name}: ${fmt(sup.total)}`} style={{ width: `${pct}%`, background: sup.color, minWidth: pct > 0 ? 2 : 0 }} />;
                                })}
                              </div>
                            </div>
                            <div style={{ width: 80, flexShrink: 0, fontFamily: "var(--font-oswald), Oswald, sans-serif", fontWeight: 700, fontSize: 12, color: "#1a1a1a", textAlign: "right" }}>
                              {fmt(mb.totalHT)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ══════════════════════════════════════════════════ */}
            {/*  C2) TOP ACHATS — products table                   */}
            {/* ══════════════════════════════════════════════════ */}
            <div style={{ ...S.sec, marginBottom: 12 }}>Top achats — {periodLabel}</div>
            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e0d8ce", padding: "18px 20px", marginBottom: 28 }}>
              {topProductsLoading ? (
                <p style={{ color: "#999", fontSize: 13, margin: 0 }}>Chargement...</p>
              ) : topProducts.length === 0 ? (
                <p style={{ color: "#999", fontSize: 13, margin: 0 }}>Aucune ligne de facture pour cette periode.</p>
              ) : (
                <>
                  {/* Filter row */}
                  <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
                    <select
                      value={topSupplierFilter}
                      onChange={(e) => { setTopSupplierFilter(e.target.value); setTopProductsLimit(20); }}
                      style={{
                        fontFamily: "DM Sans, sans-serif", fontSize: 12, padding: "6px 10px",
                        border: "1px solid #ddd6c8", borderRadius: 8, background: "#fff", color: "#1a1a1a",
                        cursor: "pointer", minWidth: 160,
                      }}
                    >
                      <option value="">Tous les fournisseurs</option>
                      {topProductSuppliers.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "DM Sans, sans-serif" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #ddd6c8" }}>
                        <th style={thStyle}>Produit</th>
                        <th style={thStyle}>Fournisseur</th>
                        <th style={{ ...thStyle, textAlign: "right" }}>Total achats</th>
                        <th style={{ ...thStyle, textAlign: "right" }}>Quantite</th>
                        <th style={{ ...thStyle, textAlign: "right" }}>Dernier PU</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTopProducts.slice(0, topProductsLimit).map((p, idx) => (
                        <tr key={idx} style={{ borderBottom: "1px solid #f2ede4" }}>
                          <td style={{ ...tdStyle, fontWeight: 600, color: "#1a1a1a" }}>{p.name}</td>
                          <td style={{ ...tdStyle, color: "#777" }}>{p.supplier}</td>
                          <td style={{ ...tdR, fontWeight: 600 }}>{fmt(p.totalPrice)}</td>
                          <td style={tdR}>{p.quantity % 1 === 0 ? p.quantity : p.quantity.toFixed(2)} {p.unit}</td>
                          <td style={tdR}>{fmt(p.lastUnitPrice)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredTopProducts.length > topProductsLimit && (
                    <div style={{ textAlign: "center", marginTop: 12 }}>
                      <button
                        onClick={() => setTopProductsLimit((prev) => prev + 20)}
                        style={{
                          fontFamily: "DM Sans, sans-serif", fontSize: 12, fontWeight: 600,
                          color: "#D4775A", background: "transparent", border: "1px solid #D4775A",
                          borderRadius: 20, padding: "6px 20px", cursor: "pointer",
                        }}
                      >
                        Voir plus ({filteredTopProducts.length - topProductsLimit} restants)
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* ══════════════════════════════════════════════════ */}
            {/*  D) FACTURES — filtered by range, by supplier     */}
            {/* ══════════════════════════════════════════════════ */}
            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e0d8ce", padding: "18px 20px", marginBottom: 20 }}>
              <div style={{ marginBottom: 14 }}>
                <div style={{ ...S.sec, marginBottom: 0 }}>Factures — {periodLabel}</div>
              </div>

              {rangeInvoiceGroups.length === 0 ? (
                <p style={{ color: "#999", fontSize: 13, margin: 0 }}>Aucune facture pour cette periode.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  {rangeInvoiceGroups.map((sup, idx) => {
                    const suppKey = sup.name.toLowerCase().trim();
                    const isSuppOpen = dashOpenSupplier === suppKey;
                    const suppTotal = sup.invoices.reduce((s, i) => s + (i.total_ht ?? 0), 0);
                    const isLast = idx === rangeInvoiceGroups.length - 1;
                    return (
                      <div key={suppKey} style={{ borderBottom: isLast ? "none" : "1px solid #eee6d8" }}>
                        <div
                          onClick={() => { setDashOpenSupplier(isSuppOpen ? null : suppKey); setDashSelectedInvoice(null); setDashLines([]); }}
                          style={{
                            display: "flex", alignItems: "center", justifyContent: "space-between",
                            padding: "11px 8px", cursor: "pointer", borderRadius: 8,
                            background: isSuppOpen ? "#f5f0e8" : "transparent",
                            transition: "background 0.15s",
                          }}
                          onMouseEnter={(e) => { if (!isSuppOpen) e.currentTarget.style.background = "#faf6ef"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = isSuppOpen ? "#f5f0e8" : "transparent"; }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: sup.color, flexShrink: 0 }} />
                            <span style={{ fontSize: 11, color: "#bbb", transition: "transform 0.2s", transform: isSuppOpen ? "rotate(90deg)" : "rotate(0deg)" }}>&#9654;</span>
                            <span style={{ fontFamily: "DM Sans, sans-serif", fontWeight: 600, fontSize: 13, color: "#1a1a1a" }}>{sup.name}</span>
                            <span style={{ fontSize: 10, color: "#999", background: "#f2ede4", borderRadius: 8, padding: "2px 8px" }}>{sup.invoices.length} facture{sup.invoices.length > 1 ? "s" : ""}</span>
                          </div>
                          <span style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 13, fontWeight: 700, color: "#1a1a1a" }}>{fmt(suppTotal)} HT</span>
                        </div>

                        {isSuppOpen && (
                          <div style={{ padding: "0 0 8px 26px" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "DM Sans, sans-serif" }}>
                              <thead>
                                <tr style={{ borderBottom: "1px solid #eee6d8" }}>
                                  <th style={{ ...thStyle, paddingLeft: 12 }}>Date</th>
                                  <th style={thStyle}>N facture</th>
                                  <th style={{ ...thStyle, textAlign: "right" }}>Total HT</th>
                                  <th style={{ ...thStyle, textAlign: "right" }}>Total TTC</th>
                                </tr>
                              </thead>
                              <tbody>
                                {sup.invoices.map((inv) => {
                                  const isSelected = dashSelectedInvoice === inv.id;
                                  return (
                                    <React.Fragment key={inv.id}>
                                      <tr
                                        onClick={() => loadDashLines(inv.id)}
                                        style={{ borderBottom: "1px solid #f2ede4", cursor: "pointer", background: isSelected ? "#f5f0e8" : "transparent", borderRadius: 6 }}
                                        onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "#faf6ef"; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.background = isSelected ? "#f5f0e8" : "transparent"; }}
                                      >
                                        <td style={{ ...tdStyle, paddingLeft: 12 }}>{fmtDate(inv.invoice_date)}</td>
                                        <td style={{ ...tdStyle, color: "#666" }}>{inv.invoice_number ?? "\u2014"}</td>
                                        <td style={tdR}>{fmt(inv.total_ht)}</td>
                                        <td style={tdR}>{fmt(inv.total_ttc)}</td>
                                      </tr>
                                      {isSelected && (
                                        <tr>
                                          <td colSpan={4} style={{ padding: 0 }}>
                                            {renderLinesTable(dashLines, dashLinesLoading)}
                                          </td>
                                        </tr>
                                      )}
                                    </React.Fragment>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ══════════════════════════════════════════════════ */}
            {/*  E) FACTURES PAR MOIS — accordion (all data)     */}
            {/* ══════════════════════════════════════════════════ */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ ...S.sec, marginBottom: 0 }}>Historique — Exercice {curFY}/{curFY + 1}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
              {curFYInvoiceMonths.length === 0 ? (
                <p style={{ color: "#999", fontSize: 13 }}>Aucune facture pour cet exercice.</p>
              ) : (
                curFYInvoiceMonths.map(renderMonthAccordion)
              )}
            </div>

            {/* Archive invoice months */}
            {archiveInvoiceFYs.length > 0 && (
              <>
                <div
                  onClick={() => setArchivesOpen(!archivesOpen)}
                  style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "8px 0", marginBottom: 6 }}
                >
                  <span style={{ fontSize: 11, color: "#999", transition: "transform 0.2s", transform: archivesOpen ? "rotate(90deg)" : "rotate(0deg)" }}>&#9654;</span>
                  <span style={{ ...S.sec, marginBottom: 0 }}>Archives</span>
                </div>
                {archivesOpen && archiveInvoiceFYs.map((afy) => {
                  const isYearOpen = archiveYearOpen === afy.fyStart;
                  return (
                    <div key={afy.fyStart} style={{ marginBottom: 6 }}>
                      <div
                        onClick={() => setArchiveYearOpen(isYearOpen ? null : afy.fyStart)}
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: "10px 16px", cursor: "pointer", borderRadius: 10,
                          border: "1px solid #ddd6c8", background: isYearOpen ? "#f5f0e8" : "#fff",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 11, color: "#999", transition: "transform 0.2s", transform: isYearOpen ? "rotate(90deg)" : "rotate(0deg)" }}>&#9654;</span>
                          <span style={{ fontFamily: "DM Sans, sans-serif", fontWeight: 600, fontSize: 13, color: "#1a1a1a" }}>
                            Exercice {afy.label}
                          </span>
                          <span style={{ fontSize: 10, color: "#999" }}>
                            {afy.months.reduce((s, m) => s + m.nbInvoices, 0)} factures
                          </span>
                        </div>
                        <span style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontWeight: 700, fontSize: 13, color: "#1a1a1a" }}>
                          {fmt(afy.months.reduce((s, m) => s + m.totalHT, 0))} HT
                        </span>
                      </div>
                      {isYearOpen && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6, paddingLeft: 12 }}>
                          {afy.months.map(renderMonthAccordion)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </>
        )}

        <FloatingActions actions={[
          { icon: <FAIconUpload size={22} color="#fff" />, label: "Importer facture", onClick: () => router.push("/invoices"), primary: true },
        ]} />
      </div>
    </RequireRole>
  );
}
