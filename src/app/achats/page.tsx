"use client";

import React, { Suspense, useEffect, useState, useMemo, type CSSProperties } from "react";
import { styleBarreCategorie, styleChevronBarre, stylePastilleBarre, styleSousCategorie, styleTitreCategorie, couleurTexteSur } from "@/lib/styleCategories";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { RequireRole } from "@/components/RequireRole";
import { useEtablissement } from "@/lib/EtablissementContext";
import { supabase } from "@/lib/supabaseClient";
import { cachedSupplierColor, loadSupplierColors } from "@/lib/supplierColors";
import { DateRangePicker, type DateRange } from "@/components/ui/DateRangePicker";
import { useSearchParams } from "next/navigation";
import { StatsAchatsContent } from "@/components/achats/StatsAchatsContent";
import { useBureau } from "@/hooks/useBureau";
import { TableauMobile } from "@/components/ui/TableauMobile";

// Chart.js chargé à la demande, hors du bundle initial de la page
const EvolutionChart = dynamic(() => import("./EvolutionChart"), { ssr: false });
const SupplierBarChart = dynamic(() => import("./SupplierBarChart"), { ssr: false });

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

/** Convert ISO date string to Date at noon (timezone-safe) */
function isoToDate(iso: string, endOfDay = false): Date {
  const d = new Date(iso + "T12:00:00");
  if (endOfDay) d.setHours(23, 59, 59);
  return d;
}

/** Format display for a range */
function formatRangeLabel(fromIso: string, toIso: string): string {
  if (!fromIso || !toIso) return "";
  const f = isoToDate(fromIso);
  const t = isoToDate(toIso);
  const isSame = fromIso === toIso;
  if (isSame) {
    return f.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }
  // Full month?
  const isFullMonth = f.getDate() === 1
    && t.getDate() === new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate()
    && f.getMonth() === t.getMonth()
    && f.getFullYear() === t.getFullYear();
  if (isFullMonth) {
    return `${MONTH_NAMES[f.getMonth()]} ${f.getFullYear()}`;
  }
  return `Du ${f.getDate()} ${MONTH_NAMES[f.getMonth()].toLowerCase()} au ${t.getDate()} ${MONTH_NAMES[t.getMonth()].toLowerCase()} ${t.getFullYear()}`;
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
  card: { background: "#fff", borderRadius: 14, padding: "18px 20px", border: "1px solid #e0d8ce" } as CSSProperties,
  sec: { fontSize: 9, textTransform: "uppercase" as const, letterSpacing: ".12em", color: "#777", fontWeight: 500, marginBottom: 12 } as CSSProperties,
  kpiValue: { fontFamily: "var(--font-oswald), Oswald, sans-serif", fontWeight: 700, fontSize: 26, color: "#1a1a1a" } as CSSProperties,
  kpiLabel: { fontFamily: "DM Sans, sans-serif", fontSize: 10, textTransform: "uppercase" as const, letterSpacing: ".08em", color: "#999", marginBottom: 8 } as CSSProperties,
};

/* ── Component ── */

export default function AchatsPage() {
  return <Suspense><AchatsContent /></Suspense>;
}

function AchatsContent() {
  const router = useRouter();
  const bureau = useBureau();
  const searchParams = useSearchParams();
  const etab = useEtablissement();
  const etabId = etab.current?.id ?? null;
  const [activeTab, setActiveTab] = useState<"factures" | "stats">(() => {
    return searchParams.get("tab") === "stats" ? "stats" : "factures";
  });

  // ── Date range (default: current month) ──
  const [range, setRange] = useState<DateRange>(() => {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) };
  });

  // ── All invoices ──
  const [allInvoices, setAllInvoices] = useState<InvoiceRow[]>([]);
  // importDrawerOpen removed — FAB opens iOS picker directly
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

  // ── Load ALL invoices ──
  useEffect(() => {
    if (!etabId) return;
    (async () => {
      setLoading(true);
      await loadSupplierColors(supabase);
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

  const rangeDates = useMemo(() => ({
    from: isoToDate(range.from),
    to: isoToDate(range.to, true),
  }), [range]);
  const periodLabel = useMemo(() => formatRangeLabel(range.from, range.to), [range]);

  // ── Filtered invoices for selected range ──
  const rangeInvoices = useMemo(() => {
    return allInvoices.filter((inv) => {
      if (!inv.invoice_date) return false;
      const d = new Date(inv.invoice_date);
      return d >= rangeDates.from && d <= rangeDates.to;
    });
  }, [allInvoices, rangeDates]);

  // ── Load top products for range ──
  useEffect(() => {
    if (!etabId || loading) return;
    const ids = rangeInvoices.map((i) => i.id);
    (async () => {
      if (ids.length === 0) { setTopProducts([]); return; }
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

    // Previous period for comparison: shift range back by its own length
    const rangeLenMs = rangeDates.to.getTime() - rangeDates.from.getTime();
    const prevTo = new Date(rangeDates.from.getTime() - 86_400_000); // day before current start
    const prevFrom = new Date(prevTo.getTime() - rangeLenMs);

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
  }, [allInvoices, rangeInvoices, rangeDates, curMonth, curYear, curFY]);

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
        .map(([k, v]) => ({ name: v.name, total: v.total, color: cachedSupplierColor(k) }))
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
        if (!bySupp[k]) bySupp[k] = { name, color: cachedSupplierColor(k), invoices: [] };
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
      .map(([k, v]) => ({ key: k, name: v.name, total: v.total, color: cachedSupplierColor(k) }))
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
      if (!bySupp[k]) bySupp[k] = { name, color: cachedSupplierColor(k), invoices: [] };
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

  const thStyle: React.CSSProperties = { textAlign: "left", fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase", color: "#a39d92", padding: "8px 14px", borderBottom: "1px solid #ddd6c8", fontWeight: 600, whiteSpace: "nowrap" };
  const tdStyle: React.CSSProperties = { padding: "9px 14px", fontSize: 13, borderBottom: "1px solid #f0ebe2", verticalAlign: "middle" };
  const tdR: React.CSSProperties = { ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };

  // ── Tableau des factures d'un fournisseur (gabarit commun) : bande de couleur, date, numéro, totaux, flèche ; les lignes de la facture choisie dessous ──
  const tableauFactures = (invoices: InvoiceRow[], couleur: string) => !bureau ? (
    <TableauMobile sansCadre colonnes={[{ libelle: "Facture" }, { libelle: "Total HT", align: "right", largeur: 100 }, { largeur: 22 }]}>
      {invoices.map((inv) => {
        const isSelected = dashSelectedInvoice === inv.id;
        const fond = isSelected ? "rgba(212,119,90,0.08)" : undefined;
        return (
          <React.Fragment key={inv.id}>
            <tr className="ac-ligne" onClick={() => loadDashLines(inv.id)} style={{ cursor: "pointer" }}>
              <td style={{ ...tdStyle, padding: 0, width: 4, background: couleur }} />
              <td style={{ ...tdStyle, padding: "10px 8px 10px 10px", background: fond }}>
                <div style={{ fontWeight: 600 }}>{fmtDate(inv.invoice_date)}</div>
                <div style={{ fontSize: 11.5, color: "#6f6a61", marginTop: 2 }}>{inv.invoice_number ?? "\u2014"}{inv.total_ttc != null ? ` · ${fmt(inv.total_ttc)} TTC` : ""}</div>
              </td>
              <td style={{ ...tdR, padding: "10px 4px 10px 0", background: fond, fontWeight: 700 }}>{fmt(inv.total_ht)}</td>
              <td style={{ ...tdStyle, padding: "10px 10px 10px 2px", background: fond, color: "#a39d92", fontSize: 18, textAlign: "right" }} aria-hidden><span style={{ display: "inline-block", transform: isSelected ? "rotate(90deg)" : "none", transition: "transform .15s" }}>›</span></td>
            </tr>
            {isSelected && (
              <tr><td style={{ padding: 0, width: 4, background: couleur }} /><td colSpan={3} style={{ padding: 0 }}>{renderLinesTable(dashLines, dashLinesLoading)}</td></tr>
            )}
          </React.Fragment>
        );
      })}
    </TableauMobile>
  ) : (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
        <thead><tr>
          <th style={{ ...thStyle, padding: 0, width: 4 }} /><th style={thStyle}>Date</th><th style={thStyle}>N° facture</th>
          <th style={{ ...thStyle, textAlign: "right" }}>Total HT</th><th style={{ ...thStyle, textAlign: "right" }}>Total TTC</th><th style={thStyle} />
        </tr></thead>
        <tbody>
          {invoices.map((inv) => {
            const isSelected = dashSelectedInvoice === inv.id;
            const fond = isSelected ? "rgba(212,119,90,0.08)" : undefined;
            return (
              <React.Fragment key={inv.id}>
                <tr className="ac-ligne" onClick={() => loadDashLines(inv.id)} style={{ cursor: "pointer" }}>
                  <td style={{ ...tdStyle, padding: 0, width: 4, background: couleur }} />
                  <td style={{ ...tdStyle, background: fond, whiteSpace: "nowrap" }}>{fmtDate(inv.invoice_date)}</td>
                  <td style={{ ...tdStyle, background: fond, color: "#666" }}>{inv.invoice_number ?? "\u2014"}</td>
                  <td style={{ ...tdR, background: fond, fontWeight: 600 }}>{fmt(inv.total_ht)}</td>
                  <td style={{ ...tdR, background: fond }}>{fmt(inv.total_ttc)}</td>
                  <td style={{ ...tdR, background: fond, width: 40, color: "#a39d92", fontWeight: 700, transform: isSelected ? "rotate(90deg)" : "none" }}>→</td>
                </tr>
                {isSelected && (
                  <tr><td style={{ padding: 0, width: 4, background: couleur }} /><td colSpan={5} style={{ padding: 0 }}>{renderLinesTable(dashLines, dashLinesLoading)}</td></tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );

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
            <tr>
              <th style={thStyle}>Article</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Qté</th>
              <th style={thStyle}>Unité</th>
              <th style={{ ...thStyle, textAlign: "right" }}>PU</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {lns.map((l) => (
              <tr key={l.id}>
                <td style={{ padding: "6px 14px", fontSize: 12, borderBottom: "1px solid #eee6d8" }}>{l.name ?? "\u2014"}</td>
                <td style={{ padding: "6px 14px", fontSize: 12, textAlign: "right", borderBottom: "1px solid #eee6d8" }}>{l.quantity ?? "\u2014"}</td>
                <td style={{ padding: "6px 14px", fontSize: 12, color: "#999", borderBottom: "1px solid #eee6d8" }}>{l.unit ?? ""}</td>
                <td style={{ padding: "6px 14px", fontSize: 12, textAlign: "right", borderBottom: "1px solid #eee6d8" }}>{fmt(l.unit_price)}</td>
                <td style={{ padding: "6px 14px", fontSize: 12, textAlign: "right", borderBottom: "1px solid #eee6d8" }}>{fmt(l.total_price)}</td>
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
    const gris = "#939597";
    return (
      <div key={mg.key}>
        <button type="button" aria-expanded={isOpen} className={`barre-categorie${isOpen ? " ouverte" : ""}`}
          onClick={() => { setOpenDashMonth(isOpen ? null : mg.key); setDashOpenSupplier(null); setDashSelectedInvoice(null); setDashLines([]); }}
          style={{ ...styleBarreCategorie(gris), minHeight: 46, gap: 12, padding: "0 16px", boxShadow: "none", borderRadius: isOpen ? "14px 14px 0 0" : 14 }}>
          <span style={styleTitreCategorie(gris)}>{mg.label} <span style={{ opacity: 0.75, fontWeight: 400 }}>({mg.nbInvoices})</span></span>
          <span style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 14, fontWeight: 700, color: couleurTexteSur(gris) }}>{fmt(mg.totalHT)} HT</span>
          <span style={styleChevronBarre(gris, isOpen)}>▼</span>
        </button>
        {isOpen && (
          <div style={{ background: "#fff", border: "1px solid #ddd6c8", borderTop: "none", borderRadius: "0 0 14px 14px", overflow: "hidden" }}>
            {mg.bySupplier.map((sup) => {
              const suppKey = sup.name.toLowerCase().trim();
              const isSuppOpen = dashOpenSupplier === `${mg.key}-${suppKey}`;
              const suppTotal = sup.invoices.reduce((t, i) => t + (i.total_ht ?? 0), 0);
              return (
                <div key={suppKey}>
                  <button type="button" aria-expanded={isSuppOpen}
                    onClick={() => { setDashOpenSupplier(isSuppOpen ? null : `${mg.key}-${suppKey}`); setDashSelectedInvoice(null); setDashLines([]); }}
                    style={{ ...styleSousCategorie(sup.color, isSuppOpen), borderRadius: 0 }}>
                    <span>{sup.name} <span style={{ fontWeight: 500, opacity: 0.8 }}>({sup.invoices.length})</span></span>
                    <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontWeight: 700 }}>{fmt(suppTotal)} HT</span>
                      <span style={{ fontSize: 10, transition: "transform 0.2s", transform: isSuppOpen ? "rotate(0)" : "rotate(-90deg)" }}>▼</span>
                    </span>
                  </button>
                  {isSuppOpen && tableauFactures(sup.invoices, sup.color)}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const accentColor = etab.current?.couleur ?? "#D4775A";

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px 120px" }}>

        {/* ══════════════════════════════════════════════════ */}
        {/*  TABS — Factures / Stats prix                    */}
        {/* ══════════════════════════════════════════════════ */}
        <div style={{ display: "flex", gap: 4, padding: 4, background: "#f0ebe2", borderRadius: 12, marginBottom: 18, border: "1px solid #e8e0d0" }}>
          {([["factures", "Factures"], ["stats", "Stats prix"]] as const).map(([key, label]) => (
            <button key={key} type="button" onClick={() => setActiveTab(key)} style={{
              flex: 1, padding: "8px 10px", borderRadius: 10, border: "none",
              background: activeTab === key ? "#fff" : "transparent",
              color: activeTab === key ? "#1a1a1a" : "#777",
              fontSize: 12, fontWeight: 700, cursor: "pointer",
              boxShadow: activeTab === key ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
              whiteSpace: "nowrap",
            }}>
              {label}
            </button>
          ))}
        </div>

        {/* Date picker — shared between tabs */}
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <DateRangePicker value={range} onChange={(r) => setRange(r)} />
        </div>

        {activeTab === "stats" ? (
          <StatsAchatsContent />
        ) : (<>

        {/* ══════════════════════════════════════════════════ */}
        {/*  HEADER — import button                          */}
        {/* ══════════════════════════════════════════════════ */}
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <button
            type="button"
            onClick={() => router.push("/invoices")}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "8px 16px", borderRadius: 20, border: "none",
              background: accentColor, color: "#fff",
              fontSize: 13, fontWeight: 700, cursor: "pointer",
              whiteSpace: "nowrap", flexShrink: 0,
            }}
          >
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Nouvelle facture
          </button>
          <button
            type="button"
            onClick={() => router.push("/achats/en-attente")}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "8px 16px", borderRadius: 20, border: "1px solid #ddd",
              background: "#fff", color: "#333",
              fontSize: 13, fontWeight: 700, cursor: "pointer",
              whiteSpace: "nowrap", flexShrink: 0,
            }}
          >
            Lignes en attente
          </button>
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
                    {dashKpis.variationPct > 0 ? "+" : ""}{dashKpis.variationPct.toFixed(1)}% vs periode prec.
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

            <div className="achats-charts-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 340px", gap: 14, marginBottom: 14 }}>
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
                    <EvolutionChart labels={evoChartData.labels} datasets={evoChartData.datasets} />
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
                      <SupplierBarChart
                        labels={supplierTotalsRange.map((s) => s.name)}
                        data={supplierTotalsRange.map((s) => s.total)}
                        colors={supplierTotalsRange.map((s) => s.color)}
                      />
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
            <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e0d8ce", padding: "18px 20px", marginBottom: 28 }}>
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
                  {!bureau ? (
                    <TableauMobile colonnes={[{ libelle: "Produit" }, { libelle: "Total", align: "right", largeur: 92 }]}>
                      {filteredTopProducts.slice(0, topProductsLimit).map((p, idx) => (
                        <tr key={idx}>
                          <td style={{ ...tdStyle, padding: 0, width: 4, background: cachedSupplierColor(p.supplier) }} />
                          <td style={{ ...tdStyle, padding: "9px 8px 9px 10px" }}>
                            <div style={{ fontWeight: 600, color: "#1a1a1a", lineHeight: 1.25 }}>{p.name}</div>
                            <div style={{ fontSize: 11.5, color: "#6f6a61", marginTop: 2 }}>{p.supplier} · {p.quantity % 1 === 0 ? p.quantity : p.quantity.toFixed(2)} {p.unit} · dernier PU {fmt(p.lastUnitPrice)}</div>
                          </td>
                          <td style={{ ...tdR, padding: "9px 10px 9px 0", fontWeight: 700 }}>{fmt(p.totalPrice)}</td>
                        </tr>
                      ))}
                    </TableauMobile>
                  ) : (
                  <div className="achats-top-table-scroll" style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "DM Sans, sans-serif", minWidth: 560 }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid #ddd6c8" }}>
                          <th style={thStyle}>Produit</th>
                          <th style={thStyle}>Fournisseur</th>
                          <th style={{ ...thStyle, textAlign: "right" }}>Total achats</th>
                          <th className="achats-col-hide-mobile" style={{ ...thStyle, textAlign: "right" }}>Quantite</th>
                          <th className="achats-col-hide-mobile" style={{ ...thStyle, textAlign: "right" }}>Dernier PU</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredTopProducts.slice(0, topProductsLimit).map((p, idx) => (
                          <tr key={idx} style={{ borderBottom: "1px solid #f2ede4" }}>
                            <td style={{ ...tdStyle, fontWeight: 600, color: "#1a1a1a" }}>{p.name}</td>
                            <td style={{ ...tdStyle, color: "#777" }}>{p.supplier}</td>
                            <td style={{ ...tdR, fontWeight: 600 }}>{fmt(p.totalPrice)}</td>
                            <td className="achats-col-hide-mobile" style={tdR}>{p.quantity % 1 === 0 ? p.quantity : p.quantity.toFixed(2)} {p.unit}</td>
                            <td className="achats-col-hide-mobile" style={tdR}>{fmt(p.lastUnitPrice)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  )}
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
            <div style={{ ...S.sec, marginBottom: 12 }}>Factures — {periodLabel}</div>
            <style>{`.ac-ligne:hover td { background: #f7f3ec; }`}</style>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
              {rangeInvoiceGroups.length === 0 ? (
                <p style={{ color: "#999", fontSize: 13, margin: 0 }}>Aucune facture pour cette periode.</p>
              ) : rangeInvoiceGroups.map((sup) => {
                const suppKey = sup.name.toLowerCase().trim();
                const isSuppOpen = dashOpenSupplier === suppKey;
                const suppTotal = sup.invoices.reduce((t, i) => t + (i.total_ht ?? 0), 0);
                return (
                  <div key={suppKey}>
                    <button type="button" aria-expanded={isSuppOpen} className={`barre-categorie${isSuppOpen ? " ouverte" : ""}`}
                      onClick={() => { setDashOpenSupplier(isSuppOpen ? null : suppKey); setDashSelectedInvoice(null); setDashLines([]); }}
                      style={{ ...styleBarreCategorie(sup.color), minHeight: 46, gap: 12, padding: "0 16px", boxShadow: "none", borderRadius: isSuppOpen ? "14px 14px 0 0" : 14 }}>
                      <span style={styleTitreCategorie(sup.color)}>{sup.name} <span style={{ opacity: 0.75, fontWeight: 400 }}>({sup.invoices.length})</span></span>
                      <span style={stylePastilleBarre(sup.color)}>{fmt(suppTotal)} HT</span>
                      <span style={styleChevronBarre(sup.color, isSuppOpen)}>▼</span>
                    </button>
                    {isSuppOpen && (
                      <div style={{ background: "#fff", border: "1px solid #ddd6c8", borderTop: "none", borderRadius: "0 0 14px 14px", overflow: "hidden" }}>
                        {tableauFactures(sup.invoices, sup.color)}
                      </div>
                    )}
                  </div>
                );
              })}
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

        </>)}
      </div>
    </RequireRole>
  );
}

