"use client";

import React, { useEffect, useState, useMemo, useRef, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { RequireRole } from "@/components/RequireRole";
import { useEtablissement } from "@/lib/EtablissementContext";
import { supabase } from "@/lib/supabaseClient";
import { getSupplierColor } from "@/lib/supplierColors";
import Chart from "chart.js/auto";

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
  "Alimentaire": "#4a6741",
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

  // ── Chart refs ──
  const evoChartRef = useRef<HTMLCanvasElement>(null);
  const evoChartInstance = useRef<Chart | null>(null);
  const doughnutRef = useRef<HTMLCanvasElement>(null);
  const doughnutInstance = useRef<Chart | null>(null);

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
  //  COMPUTED DATA
  // ══════════════════════════════════════════════════════

  const now = new Date();
  const curMonth = now.getMonth();
  const curYear = now.getFullYear();
  const curFY = currentFiscalYearStart();

  // ── KPIs ──
  const dashKpis = useMemo(() => {
    const monthStart = new Date(curYear, curMonth, 1);
    const monthEnd = new Date(curYear, curMonth + 1, 0, 23, 59, 59);
    const prevMonthStart = new Date(curYear, curMonth - 1, 1);
    const prevMonthEnd = new Date(curYear, curMonth, 0, 23, 59, 59);

    const thisMonth = allInvoices.filter((inv) => {
      if (!inv.invoice_date) return false;
      const d = new Date(inv.invoice_date);
      return d >= monthStart && d <= monthEnd;
    });
    const prevMonth = allInvoices.filter((inv) => {
      if (!inv.invoice_date) return false;
      const d = new Date(inv.invoice_date);
      return d >= prevMonthStart && d <= prevMonthEnd;
    });

    const totalHT = thisMonth.reduce((s, r) => s + (r.total_ht ?? 0), 0);
    const prevTotalHT = prevMonth.reduce((s, r) => s + (r.total_ht ?? 0), 0);
    const nbFactures = thisMonth.length;
    const ticketMoyen = nbFactures > 0 ? totalHT / nbFactures : 0;

    const bySupplier: Record<string, { name: string; total: number }> = {};
    for (const r of thisMonth) {
      const sid = r.supplier_id ?? "?";
      const name = r.suppliers?.name ?? "Inconnu";
      if (!bySupplier[sid]) bySupplier[sid] = { name, total: 0 };
      bySupplier[sid].total += r.total_ht ?? 0;
    }
    const sorted = Object.values(bySupplier).sort((a, b) => b.total - a.total);
    const topSupplier = sorted[0] ?? null;
    const topSupplierName = topSupplier?.name ?? "\u2014";
    const topSupplierTotal = topSupplier?.total ?? 0;

    const variationPct = prevTotalHT > 0 ? ((totalHT - prevTotalHT) / prevTotalHT) * 100 : null;

    // Active suppliers this month
    const activeSuppliers = new Set(thisMonth.map((inv) => inv.supplier_id).filter(Boolean)).size;

    // Monthly average across fiscal year
    const fyStart = new Date(curFY, 9, 1); // Oct 1
    const fyInvoices = allInvoices.filter((inv) => {
      if (!inv.invoice_date) return false;
      const d = new Date(inv.invoice_date);
      return d >= fyStart && d <= monthEnd;
    });
    const fyTotal = fyInvoices.reduce((s, r) => s + (r.total_ht ?? 0), 0);
    // Number of months elapsed in fiscal year
    const elapsedMonths = Math.max(1, (curYear - curFY) * 12 + curMonth - 9 + 1);
    const monthlyAvg = fyTotal / Math.max(1, Math.min(elapsedMonths, 12));

    return { totalHT, nbFactures, ticketMoyen, topSupplierName, topSupplierTotal, variationPct, prevTotalHT, activeSuppliers, monthlyAvg };
  }, [allInvoices, curMonth, curYear, curFY]);

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

  // ── Category totals for doughnut (current FY) ──
  const categoryTotalsFY = useMemo(() => {
    const byCat: Record<string, number> = {};
    const fyMonthKeys = new Set(fiscalMonths(curFY).map((m) => `${m.year}-${String(m.month).padStart(2, "0")}`));
    for (const inv of allInvoices) {
      if (!inv.invoice_date) continue;
      const d = new Date(inv.invoice_date);
      const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
      if (!fyMonthKeys.has(key)) continue;
      const cat = getSupplierCategory(inv.suppliers?.name ?? "Inconnu");
      byCat[cat] = (byCat[cat] ?? 0) + (inv.total_ht ?? 0);
    }
    const cats = ["Alimentaire", "Boissons", "Services", "Autre"];
    return cats
      .map((name) => ({ name, total: byCat[name] ?? 0, color: CATEGORY_COLORS[name] ?? "#999" }))
      .filter((c) => c.total > 0);
  }, [allInvoices, curFY]);

  // ── Top 5 suppliers for current month ──
  const top5Suppliers = useMemo(() => {
    const monthStart = new Date(curYear, curMonth, 1);
    const monthEnd = new Date(curYear, curMonth + 1, 0, 23, 59, 59);

    const thisMonth = allInvoices.filter((inv) => {
      if (!inv.invoice_date) return false;
      const d = new Date(inv.invoice_date);
      return d >= monthStart && d <= monthEnd;
    });

    const totalHT = thisMonth.reduce((s, r) => s + (r.total_ht ?? 0), 0);

    const bySupp: Record<string, { name: string; total: number }> = {};
    for (const inv of thisMonth) {
      const name = inv.suppliers?.name ?? "Inconnu";
      const k = name.toLowerCase().trim();
      if (!bySupp[k]) bySupp[k] = { name, total: 0 };
      bySupp[k].total += inv.total_ht ?? 0;
    }

    return Object.values(bySupp)
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)
      .map((s) => ({ ...s, pct: totalHT > 0 ? (s.total / totalHT) * 100 : 0, color: getSupplierColor(s.name.toLowerCase().trim()) }));
  }, [allInvoices, curMonth, curYear]);

  // ══════════════════════════════════════════════════════
  //  CHART.JS — Evolution mensuelle (stacked bar)
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
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ${fmt(ctx.parsed.x)}`,
            },
          },
        },
        scales: {
          x: {
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
          y: {
            stacked: true,
            ticks: { font: { size: 11 }, color: "#999" },
            grid: { display: false },
          },
        },
      },
    });
    return () => { evoChartInstance.current?.destroy(); evoChartInstance.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evoChartData, loading]);

  // ══════════════════════════════════════════════════════
  //  CHART.JS — Doughnut (category)
  // ══════════════════════════════════════════════════════

  useEffect(() => {
    if (!doughnutRef.current || loading || categoryTotalsFY.length === 0) return;
    if (doughnutInstance.current) doughnutInstance.current.destroy();
    doughnutInstance.current = new Chart(doughnutRef.current, {
      type: "doughnut",
      data: {
        labels: categoryTotalsFY.map((c) => c.name),
        datasets: [{
          data: categoryTotalsFY.map((c) => c.total),
          backgroundColor: categoryTotalsFY.map((c) => c.color),
          borderWidth: 2,
          borderColor: "#fff",
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "60%",
        plugins: {
          legend: {
            position: "bottom",
            labels: { font: { size: 11, family: "DM Sans, sans-serif" }, color: "#777", padding: 14, usePointStyle: true, pointStyleWidth: 10 },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const total = categoryTotalsFY.reduce((s, c) => s + c.total, 0);
                const pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : "0";
                return `${ctx.label}: ${fmt(ctx.parsed)} (${pct}%)`;
              },
            },
          },
        },
      },
    });
    return () => { doughnutInstance.current?.destroy(); doughnutInstance.current = null; };
  }, [categoryTotalsFY, loading]);

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
        <h1 style={{
          fontFamily: "var(--font-oswald), Oswald, sans-serif", fontWeight: 700, fontSize: 24,
          color: "#1a1a1a", margin: "0 0 24px", textTransform: "uppercase", letterSpacing: "0.04em",
        }}>
          Achats
        </h1>

        {loading ? (
          <p style={{ color: "#999", fontSize: 14, textAlign: "center", marginTop: 40 }}>Chargement...</p>
        ) : (
          <>
            {/* ══════════════════════════════════════════════════ */}
            {/*  A) HERO — 6 KPI CARDS                           */}
            {/* ══════════════════════════════════════════════════ */}
            <div style={S.sec}>Synthese du mois</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 32 }}>
              {/* Total achats HT */}
              <div style={S.card}>
                <div style={S.kpiLabel}>Total achats (HT)</div>
                <div style={S.kpiValue}>{fmt(dashKpis.totalHT)}</div>
                {dashKpis.variationPct !== null && (
                  <div style={{ fontSize: 11, color: dashKpis.variationPct <= 0 ? "#166534" : "#991b1b", marginTop: 4, fontFamily: "DM Sans, sans-serif", fontWeight: 600 }}>
                    {dashKpis.variationPct > 0 ? "+" : ""}{dashKpis.variationPct.toFixed(1)}% vs mois prec.
                  </div>
                )}
              </div>

              {/* Nb factures */}
              <div style={S.card}>
                <div style={S.kpiLabel}>Factures ce mois</div>
                <div style={S.kpiValue}>{dashKpis.nbFactures}</div>
              </div>

              {/* Ticket moyen */}
              <div style={S.card}>
                <div style={S.kpiLabel}>Ticket moyen</div>
                <div style={S.kpiValue}>{fmt(dashKpis.ticketMoyen)}</div>
              </div>

              {/* Top fournisseur */}
              <div style={S.card}>
                <div style={S.kpiLabel}>Top fournisseur</div>
                <div style={{ ...S.kpiValue, fontSize: 18 }}>{dashKpis.topSupplierName}</div>
                {dashKpis.topSupplierTotal > 0 && (
                  <div style={{ fontSize: 11, color: "#999", marginTop: 4, fontFamily: "DM Sans, sans-serif" }}>{fmt(dashKpis.topSupplierTotal)}</div>
                )}
              </div>

              {/* Moyenne mensuelle */}
              <div style={S.card}>
                <div style={S.kpiLabel}>Moy. mensuelle (exercice)</div>
                <div style={S.kpiValue}>{fmt(dashKpis.monthlyAvg)}</div>
              </div>

              {/* Fournisseurs actifs */}
              <div style={S.card}>
                <div style={S.kpiLabel}>Fournisseurs actifs</div>
                <div style={S.kpiValue}>{dashKpis.activeSuppliers}</div>
              </div>
            </div>

            {/* ══════════════════════════════════════════════════ */}
            {/*  B) CHARTS — Evolution + Doughnut side by side   */}
            {/* ══════════════════════════════════════════════════ */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ ...S.sec, marginBottom: 0 }}>Analyse — Exercice {curFY}/{curFY + 1}</div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 14, marginBottom: 14 }}>
              {/* Left: stacked bar chart */}
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
                  <div style={{ height: Math.max(curFYMonths.length * 32, 200), position: "relative" }}>
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

              {/* Right: doughnut chart */}
              <div style={S.card}>
                <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 12, fontWeight: 600, color: "#777", marginBottom: 14 }}>
                  Repartition par categorie
                </div>
                {categoryTotalsFY.length === 0 ? (
                  <p style={{ color: "#999", fontSize: 13, margin: 0 }}>Aucune donnee.</p>
                ) : (
                  <div style={{ height: 240, position: "relative" }}>
                    <canvas ref={doughnutRef} />
                  </div>
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
            {/*  C) TOP 5 FOURNISSEURS                           */}
            {/* ══════════════════════════════════════════════════ */}
            {top5Suppliers.length > 0 && (
              <>
                <div style={S.sec}>Top fournisseurs — {MONTH_NAMES[curMonth]} {curYear}</div>
                <div style={{ ...S.card, marginBottom: 32, padding: "18px 20px" }}>
                  {top5Suppliers.map((sup, i) => (
                    <div key={sup.name} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: i < top5Suppliers.length - 1 ? 10 : 0 }}>
                      <div style={{ width: 20, fontFamily: "var(--font-oswald), Oswald, sans-serif", fontWeight: 700, fontSize: 14, color: "#999", textAlign: "center", flexShrink: 0 }}>
                        {i + 1}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
                          <span style={{ fontFamily: "DM Sans, sans-serif", fontWeight: 600, fontSize: 13, color: "#1a1a1a" }}>{sup.name}</span>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 11, color: "#999", fontFamily: "DM Sans, sans-serif" }}>{sup.pct.toFixed(1)}%</span>
                            <span style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontWeight: 700, fontSize: 13, color: "#1a1a1a" }}>{fmt(sup.total)}</span>
                          </div>
                        </div>
                        <div style={{ height: 6, borderRadius: 3, background: "#f2ede4", overflow: "hidden" }}>
                          <div style={{ height: "100%", borderRadius: 3, background: sup.color, width: `${sup.pct}%`, transition: "width 0.3s" }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* ══════════════════════════════════════════════════ */}
            {/*  D) FACTURES PAR MOIS — accordion                */}
            {/* ══════════════════════════════════════════════════ */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ ...S.sec, marginBottom: 0 }}>Factures par mois — Exercice {curFY}/{curFY + 1}</div>
              <button
                onClick={() => router.push("/invoices")}
                style={{
                  fontFamily: "DM Sans, sans-serif", fontSize: 12, fontWeight: 600,
                  background: "#D4775A", color: "#fff", border: "none", borderRadius: 20,
                  padding: "7px 16px", cursor: "pointer",
                }}
              >
                Importer une facture
              </button>
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

      </div>
    </RequireRole>
  );
}
