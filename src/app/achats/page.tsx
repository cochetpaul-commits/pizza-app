"use client";

import React, { useEffect, useState, useMemo, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { RequireRole } from "@/components/RequireRole";
import { useEtablissement } from "@/lib/EtablissementContext";
import { supabase } from "@/lib/supabaseClient";
import { getSupplierColor } from "@/lib/supplierColors";

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

type Tab = "dashboard" | "factures" | "imports";

/* ── Helpers ── */

const fmt = (n: number | null) =>
  n == null ? "—" : n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

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

/* ── Styles ── */

const S = {
  card: { background: "#fff", borderRadius: 12, padding: "18px 20px", border: "1px solid #e0d8ce" } as CSSProperties,
  sec: { fontSize: 9, textTransform: "uppercase" as const, letterSpacing: ".12em", color: "#777", fontWeight: 500, marginBottom: 12 } as CSSProperties,
};

/* ── Component ── */

export default function AchatsPage() {
  const router = useRouter();
  const etab = useEtablissement();
  const etabId = etab.current?.id ?? null;

  const [tab, setTab] = useState<Tab>("dashboard");

  // ── All invoices (shared between dashboard & factures) ──
  const [allInvoices, setAllInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Factures state ──
  const [openFolder, setOpenFolder] = useState<string | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<string | null>(null);
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [linesLoading, setLinesLoading] = useState(false);

  // ── Dashboard state ──
  const [openDashMonth, setOpenDashMonth] = useState<string | null>(null);
  const [dashOpenSupplier, setDashOpenSupplier] = useState<string | null>(null);
  const [dashSelectedInvoice, setDashSelectedInvoice] = useState<string | null>(null);
  const [dashLines, setDashLines] = useState<InvoiceLine[]>([]);
  const [dashLinesLoading, setDashLinesLoading] = useState(false);
  const [archivesOpen, setArchivesOpen] = useState(false);
  const [archiveYearOpen, setArchiveYearOpen] = useState<number | null>(null);
  const [evoArchivesOpen, setEvoArchivesOpen] = useState(false);

  // ── Auto-imports state ──
  type AutoImport = { id: string; created_at: string; fournisseur: string | null; invoice_number: string | null; nb_lignes: number; status: string; error_detail: string | null; invoice_id: string | null; gmail_message_id: string | null };
  const [autoImports, setAutoImports] = useState<AutoImport[]>([]);
  const [autoLoading, setAutoLoading] = useState(false);
  const [autoFilter, setAutoFilter] = useState<string>("all");
  const [autoExpandedId, setAutoExpandedId] = useState<string | null>(null);
  const [autoLines, setAutoLines] = useState<InvoiceLine[]>([]);
  const [autoLinesLoading, setAutoLinesLoading] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);

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

  // ── Load auto-imports ──
  useEffect(() => {
    if (tab !== "imports") return;
    (async () => {
      setAutoLoading(true);
      let q = supabase
        .from("email_imports")
        .select("id,created_at,fournisseur,invoice_number,nb_lignes,status,error_detail,invoice_id,gmail_message_id")
        .order("created_at", { ascending: false })
        .limit(100);
      if (etabId) q = q.eq("etablissement_id", etabId);
      const { data } = await q;
      setAutoImports((data ?? []) as AutoImport[]);
      setAutoLoading(false);
    })();
  }, [tab, etabId]);

  // ══════════════════════════════════════════════════════
  //  DASHBOARD COMPUTED DATA
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
    const topSupplier = sorted[0]?.name ?? "—";

    const variationPct = prevTotalHT > 0 ? ((totalHT - prevTotalHT) / prevTotalHT) * 100 : null;

    return { totalHT, nbFactures, ticketMoyen, topSupplier, variationPct, prevTotalHT };
  }, [allInvoices, curMonth, curYear]);

  // ── Monthly breakdown for evolution chart ──
  type MonthBreakdown = {
    key: string;
    label: string;
    year: number;
    month: number;
    totalHT: number;
    suppliers: { name: string; total: number; color: string }[];
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
      for (const inv of invoices) {
        const name = inv.suppliers?.name ?? "Inconnu";
        const k = name.toLowerCase().trim();
        if (!bySupp[k]) bySupp[k] = { name, total: 0 };
        bySupp[k].total += inv.total_ht ?? 0;
      }
      const suppliers = Object.entries(bySupp)
        .map(([k, v]) => ({ name: v.name, total: v.total, color: getSupplierColor(k) }))
        .sort((a, b) => b.total - a.total);

      result.push({ key, label: `${MONTH_NAMES[month]} ${year}`, year, month, totalHT, suppliers });
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

  // ── Max total for bar scaling ──
  const maxMonthTotal = useMemo(() => {
    return Math.max(...curFYMonths.map((m) => m.totalHT), 1);
  }, [curFYMonths]);

  // ══════════════════════════════════════════════════════
  //  FACTURES TAB LOGIC (existing)
  // ══════════════════════════════════════════════════════

  const folders = useMemo(() => {
    const grouped: Record<string, { name: string; invoices: InvoiceRow[] }> = {};
    for (const inv of allInvoices) {
      const rawName = inv.suppliers?.name ?? "Inconnu";
      const key = rawName.toLowerCase().trim();
      if (!grouped[key]) grouped[key] = { name: rawName, invoices: [] };
      grouped[key].invoices.push(inv);
    }
    return Object.entries(grouped).sort((a, b) => {
      const totalA = a[1].invoices.reduce((s, i) => s + (i.total_ht ?? 0), 0);
      const totalB = b[1].invoices.reduce((s, i) => s + (i.total_ht ?? 0), 0);
      return totalB - totalA;
    });
  }, [allInvoices]);

  const folderColorMap = useMemo(() => {
    const m = new Map<string, string>();
    folders.forEach(([key]) => { m.set(key, getSupplierColor(key)); });
    return m;
  }, [folders]);

  const loadLines = async (invoiceId: string) => {
    if (selectedInvoice === invoiceId) { setSelectedInvoice(null); setLines([]); return; }
    setSelectedInvoice(invoiceId);
    setLinesLoading(true);
    const { data } = await supabase
      .from("supplier_invoice_lines")
      .select("id, name, quantity, unit, unit_price, total_price")
      .eq("invoice_id", invoiceId)
      .order("name");
    setLines((data ?? []) as InvoiceLine[]);
    setLinesLoading(false);
  };

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

  const tabBtn = (key: Tab, label: string) => (
    <button
      key={key}
      onClick={() => setTab(key)}
      style={{
        fontFamily: "DM Sans, sans-serif", fontSize: 13, fontWeight: 600,
        padding: "7px 18px", borderRadius: 20, cursor: "pointer",
        border: tab === key ? "2px solid #D4775A" : "1px solid #ddd6c8",
        background: tab === key ? "#D4775A" : "#fff",
        color: tab === key ? "#fff" : "#1a1a1a",
        transition: "all 0.15s",
      }}
    >
      {label}
    </button>
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
                <td style={{ padding: "6px 10px", fontSize: 12 }}>{l.name ?? "—"}</td>
                <td style={{ padding: "6px 10px", fontSize: 12, textAlign: "right" }}>{l.quantity ?? "—"}</td>
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

  // ── Render helper: stacked horizontal bar ──
  const renderStackedBar = (mb: MonthBreakdown) => {
    if (mb.totalHT <= 0) return null;
    const barWidth = (mb.totalHT / maxMonthTotal) * 100;
    return (
      <div key={mb.key} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
        <div style={{ width: 100, flexShrink: 0, fontFamily: "DM Sans, sans-serif", fontSize: 11, color: "#999", textAlign: "right" }}>
          {MONTH_NAMES[mb.month].slice(0, 3)} {mb.year}
        </div>
        <div style={{ flex: 1, position: "relative" }}>
          <div style={{ display: "flex", height: 22, borderRadius: 4, overflow: "hidden", width: `${Math.max(barWidth, 2)}%` }}>
            {mb.suppliers.map((sup, i) => {
              const pct = (sup.total / mb.totalHT) * 100;
              return (
                <div
                  key={i}
                  title={`${sup.name}: ${fmt(sup.total)}`}
                  style={{ width: `${pct}%`, background: sup.color, minWidth: pct > 0 ? 2 : 0, transition: "width 0.3s" }}
                />
              );
            })}
          </div>
        </div>
        <div style={{ width: 80, flexShrink: 0, fontFamily: "var(--font-oswald), Oswald, sans-serif", fontWeight: 700, fontSize: 13, color: "#1a1a1a", textAlign: "right" }}>
          {fmt(mb.totalHT)}
        </div>
      </div>
    );
  };

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
                                  <td style={{ ...tdStyle, color: "#666" }}>{inv.invoice_number ?? "—"}</td>
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
          color: "#1a1a1a", margin: "0 0 20px", textTransform: "uppercase", letterSpacing: "0.04em",
        }}>
          Achats
        </h1>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 24 }}>
          {tabBtn("dashboard", "Tableau de bord")}
          {tabBtn("factures", "Factures")}
          {tabBtn("imports", "Import auto")}
        </div>

        {/* ═══ TAB: DASHBOARD ═══ */}
        {tab === "dashboard" && (
          loading ? (
            <p style={{ color: "#999", fontSize: 14, textAlign: "center", marginTop: 40 }}>Chargement...</p>
          ) : (
            <>
              {/* ── Hero KPIs ── */}
              <div style={S.sec}>Synthese du mois</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 28 }}>
                <div style={S.card}>
                  <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 12, color: "#999", marginBottom: 8 }}>Total achats du mois (HT)</div>
                  <div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontWeight: 700, fontSize: 22, color: "#1a1a1a" }}>
                    {fmt(dashKpis.totalHT)}
                  </div>
                  {dashKpis.variationPct !== null && (
                    <div style={{ fontSize: 11, color: dashKpis.variationPct <= 0 ? "#166534" : "#991b1b", marginTop: 4, fontFamily: "DM Sans, sans-serif" }}>
                      {dashKpis.variationPct > 0 ? "+" : ""}{dashKpis.variationPct.toFixed(1)}% vs mois precedent
                    </div>
                  )}
                </div>

                <div style={S.card}>
                  <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 12, color: "#999", marginBottom: 8 }}>Factures ce mois</div>
                  <div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontWeight: 700, fontSize: 22, color: "#1a1a1a" }}>
                    {dashKpis.nbFactures}
                  </div>
                </div>

                <div style={S.card}>
                  <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 12, color: "#999", marginBottom: 8 }}>Ticket moyen par facture</div>
                  <div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontWeight: 700, fontSize: 22, color: "#1a1a1a" }}>
                    {fmt(dashKpis.ticketMoyen)}
                  </div>
                </div>

                <div style={S.card}>
                  <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 12, color: "#999", marginBottom: 8 }}>Top fournisseur</div>
                  <div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontWeight: 700, fontSize: 18, color: "#1a1a1a" }}>
                    {dashKpis.topSupplier}
                  </div>
                </div>
              </div>

              {/* ── Monthly Evolution ── */}
              <div style={S.sec}>Evolution mensuelle — Exercice {curFY}/{curFY + 1}</div>
              <div style={{ ...S.card, marginBottom: 14, padding: "18px 20px" }}>
                {curFYMonths.length === 0 ? (
                  <p style={{ color: "#999", fontSize: 13, margin: 0 }}>Aucune donnee pour cet exercice.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {curFYMonths.map(renderStackedBar)}
                  </div>
                )}

                {/* Supplier legend */}
                {curFYMonths.length > 0 && (() => {
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

              {/* ── Invoices by month ── */}
              <div style={S.sec}>Factures par mois — Exercice {curFY}/{curFY + 1}</div>
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
          )
        )}

        {/* ═══ TAB: FACTURES ═══ */}
        {tab === "factures" && (
          loading ? (
            <p style={{ color: "#999", fontSize: 14, textAlign: "center", marginTop: 40 }}>Chargement...</p>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 24 }}>
                {[
                  { label: "Total achats ce mois", value: fmt(dashKpis.totalHT) },
                  { label: "Factures ce mois", value: String(dashKpis.nbFactures) },
                  { label: "Fournisseur principal", value: dashKpis.topSupplier },
                ].map((k) => (
                  <div key={k.label} style={{
                    background: "#fff", borderRadius: 12, padding: "18px 20px",
                    border: "1px solid #e5ddd0", boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                  }}>
                    <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 12, color: "#999", marginBottom: 8 }}>{k.label}</div>
                    <div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontWeight: 700, fontSize: 22, color: "#1a1a1a" }}>{k.value}</div>
                  </div>
                ))}
              </div>

              <div style={{ marginBottom: 24 }}>
                <button
                  onClick={() => router.push("/invoices")}
                  style={{
                    fontFamily: "DM Sans, sans-serif", fontSize: 14, fontWeight: 600,
                    background: "#D4775A", color: "#fff", border: "none", borderRadius: 20,
                    padding: "9px 20px", cursor: "pointer",
                  }}
                >
                  Importer une facture
                </button>
              </div>

              <h2 style={{
                fontFamily: "var(--font-oswald), Oswald, sans-serif", fontWeight: 700, fontSize: 16,
                color: "#1a1a1a", margin: "0 0 12px", letterSpacing: "0.04em", textTransform: "uppercase",
              }}>
                Factures par fournisseur
              </h2>

              {folders.length === 0 ? (
                <p style={{ color: "#999", fontSize: 14 }}>Aucune facture importee.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {folders.map(([key, folder]) => {
                    const isOpen = openFolder === key;
                    const folderTotal = folder.invoices.reduce((s, i) => s + (i.total_ht ?? 0), 0);
                    const color = folderColorMap.get(key) ?? "#999";
                    return (
                      <div key={key} style={{ border: "1px solid #ddd6c8", borderLeft: `3px solid ${color}`, borderRadius: 10, overflow: "hidden" }}>
                        <div
                          onClick={() => setOpenFolder(isOpen ? null : key)}
                          style={{
                            display: "flex", alignItems: "center", justifyContent: "space-between",
                            padding: "12px 16px", cursor: "pointer",
                            background: isOpen ? "#f5f0e8" : "#fff", transition: "background 0.15s",
                          }}
                          onMouseEnter={(e) => { if (!isOpen) e.currentTarget.style.background = "#faf6ef"; }}
                          onMouseLeave={(e) => { if (!isOpen) e.currentTarget.style.background = "#fff"; }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0 }} />
                            <span style={{ fontSize: 12, color: "#999", transition: "transform 0.2s", transform: isOpen ? "rotate(90deg)" : "rotate(0deg)" }}>&#9654;</span>
                            <span style={{ fontFamily: "DM Sans, sans-serif", fontWeight: 600, fontSize: 14, color: "#1a1a1a" }}>{folder.name}</span>
                            <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 11, color: "#999", background: "#f2ede4", borderRadius: 8, padding: "2px 8px" }}>
                              {folder.invoices.length} facture{folder.invoices.length > 1 ? "s" : ""}
                            </span>
                          </div>
                          <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>{fmt(folderTotal)} HT</span>
                        </div>
                        {isOpen && (
                          <div style={{ borderTop: "1px solid #ddd6c8" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "DM Sans, sans-serif" }}>
                              <thead>
                                <tr style={{ borderBottom: "1px solid #eee6d8" }}>
                                  <th style={thStyle}>Date</th>
                                  <th style={thStyle}>N facture</th>
                                  <th style={{ ...thStyle, textAlign: "right" }}>Total HT</th>
                                  <th style={{ ...thStyle, textAlign: "right" }}>Total TTC</th>
                                </tr>
                              </thead>
                              <tbody>
                                {folder.invoices.map((inv) => {
                                  const isSelected = selectedInvoice === inv.id;
                                  return (
                                    <React.Fragment key={inv.id}>
                                      <tr
                                        onClick={() => loadLines(inv.id)}
                                        style={{ borderBottom: "1px solid #eee6d8", cursor: "pointer", background: isSelected ? "#f5f0e8" : "transparent" }}
                                        onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "#faf6ef"; }}
                                        onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = isSelected ? "#f5f0e8" : "transparent"; }}
                                      >
                                        <td style={tdStyle}>{fmtDate(inv.invoice_date)}</td>
                                        <td style={{ ...tdStyle, color: "#666" }}>{inv.invoice_number ?? "—"}</td>
                                        <td style={tdR}>{fmt(inv.total_ht)}</td>
                                        <td style={tdR}>{fmt(inv.total_ttc)}</td>
                                      </tr>
                                      {isSelected && (
                                        <tr>
                                          <td colSpan={4} style={{ padding: 0 }}>
                                            {renderLinesTable(lines, linesLoading)}
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
            </>
          )
        )}

        {/* ═══ TAB: IMPORTS AUTO ═══ */}
        {tab === "imports" && (
          autoLoading ? (
            <p style={{ color: "#999", fontSize: 14, textAlign: "center", marginTop: 40 }}>Chargement...</p>
          ) : (
            <>
              {/* Filter pills */}
              <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
                {([
                  { key: "all", label: "Tous", count: autoImports.length },
                  { key: "ok", label: "Importees", count: autoImports.filter((i) => i.status === "ok").length },
                  { key: "error", label: "Erreurs", count: autoImports.filter((i) => i.status === "error" || i.status === "no_match").length },
                  { key: "duplicate", label: "Doublons", count: autoImports.filter((i) => i.status === "duplicate").length },
                ] as const).map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setAutoFilter(f.key)}
                    style={{
                      padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer",
                      fontFamily: "DM Sans, sans-serif",
                      border: autoFilter === f.key ? "1.5px solid #D4775A" : "1px solid #ddd6c8",
                      background: autoFilter === f.key ? "#D4775A" : "#fff",
                      color: autoFilter === f.key ? "#fff" : "#1a1a1a",
                    }}
                  >
                    {f.label} ({f.count})
                  </button>
                ))}
              </div>

              {autoImports.length === 0 ? (
                <div style={{ textAlign: "center", padding: 40, color: "#999" }}>
                  <p style={{ fontSize: 14, margin: "0 0 4px" }}>Aucune facture importee automatiquement</p>
                  <p style={{ fontSize: 12 }}>Envoyez vos factures a gestionifratelligroup@gmail.com</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {autoImports
                    .filter((i) => {
                      if (autoFilter === "all") return true;
                      if (autoFilter === "error") return i.status === "error" || i.status === "no_match";
                      return i.status === autoFilter;
                    })
                    .map((row) => {
                      const isOk = row.status === "ok";
                      const isErr = row.status === "error" || row.status === "no_match";
                      const isDup = row.status === "duplicate";
                      const badgeColor = isOk ? "#166534" : isErr ? "#991b1b" : isDup ? "#3730a3" : "#6b7280";
                      const badgeBg = isOk ? "#dcfce7" : isErr ? "#fee2e2" : isDup ? "#e0e7ff" : "#f3f4f6";
                      const badgeLabel = isOk ? "Importee" : isErr ? "Erreur" : isDup ? "Doublon" : row.status;
                      const date = new Date(row.created_at);
                      const dateStr = date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
                      const isExpanded = autoExpandedId === row.id;
                      const canExpand = isOk && row.invoice_id;

                      return (
                        <div
                          key={row.id}
                          onClick={() => {
                            if (!canExpand) return;
                            if (isExpanded) { setAutoExpandedId(null); setAutoLines([]); return; }
                            setAutoExpandedId(row.id);
                            setAutoLinesLoading(true);
                            supabase
                              .from("supplier_invoice_lines")
                              .select("id,name,quantity,unit,unit_price,total_price")
                              .eq("invoice_id", row.invoice_id!)
                              .order("name")
                              .then(({ data }) => { setAutoLines((data ?? []) as InvoiceLine[]); setAutoLinesLoading(false); });
                          }}
                          style={{
                            background: "#fff", border: "1px solid #ddd6c8", borderRadius: 10,
                            padding: "12px 16px", borderLeft: `3px solid ${badgeColor}`,
                            cursor: canExpand ? "pointer" : "default",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                                <span style={{ fontFamily: "DM Sans, sans-serif", fontWeight: 700, fontSize: 14, color: "#1a1a1a", textTransform: "uppercase" }}>
                                  {row.fournisseur ?? "Inconnu"}
                                </span>
                                <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 8, background: badgeBg, color: badgeColor }}>
                                  {badgeLabel}
                                </span>
                                {isOk && <span style={{ fontSize: 11, color: "#999" }}>{row.nb_lignes} ligne{row.nb_lignes > 1 ? "s" : ""}</span>}
                                {canExpand && <span style={{ fontSize: 10, color: "#999" }}>{isExpanded ? "▲" : "▼"}</span>}
                              </div>
                              <div style={{ display: "flex", gap: 12, fontSize: 11, color: "#999", fontFamily: "DM Sans, sans-serif" }}>
                                <span>{dateStr}</span>
                                {row.invoice_number && <span>N° {row.invoice_number}</span>}
                              </div>
                              {row.error_detail && (
                                <div style={{ fontSize: 11, color: "#991b1b", marginTop: 4, fontStyle: "italic" }}>{row.error_detail}</div>
                              )}
                            </div>
                            {isErr && row.gmail_message_id && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRetrying(row.id);
                                  fetch(`/api/gmail/webhook?messageId=${row.gmail_message_id}`)
                                    .then(() => { setAutoImports((prev) => prev.filter((i) => i.id !== row.id)); })
                                    .catch(() => alert("Erreur"))
                                    .finally(() => setRetrying(null));
                                }}
                                disabled={retrying === row.id}
                                style={{
                                  padding: "6px 12px", borderRadius: 8, border: "1px solid #ddd6c8",
                                  background: "#fff", cursor: "pointer", fontSize: 12, color: "#D4775A",
                                  fontWeight: 600, fontFamily: "DM Sans, sans-serif", whiteSpace: "nowrap",
                                }}
                              >
                                {retrying === row.id ? "..." : "Reimporter"}
                              </button>
                            )}
                          </div>

                          {/* Expanded lines */}
                          {isExpanded && (
                            <div style={{ marginTop: 10, borderTop: "1px solid #eee", paddingTop: 10 }}>
                              {autoLinesLoading ? (
                                <p style={{ fontSize: 12, color: "#999", margin: 0 }}>Chargement...</p>
                              ) : autoLines.length === 0 ? (
                                <p style={{ fontSize: 12, color: "#999", margin: 0 }}>Aucune ligne</p>
                              ) : (
                                <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse", fontFamily: "DM Sans, sans-serif" }}>
                                  <thead>
                                    <tr style={{ borderBottom: "1px solid #eee", color: "#999", textAlign: "left" }}>
                                      <th style={{ padding: "4px 6px", fontWeight: 600, fontSize: 10 }}>Ingredient</th>
                                      <th style={{ padding: "4px 6px", fontWeight: 600, fontSize: 10, textAlign: "right" }}>PU</th>
                                      <th style={{ padding: "4px 6px", fontWeight: 600, fontSize: 10, textAlign: "right" }}>Total</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {autoLines.map((l) => (
                                      <tr key={l.id} style={{ borderBottom: "1px solid #f5f0e8" }}>
                                        <td style={{ padding: "4px 6px", color: "#1a1a1a" }}>{l.name ?? "—"}</td>
                                        <td style={{ padding: "4px 6px", textAlign: "right", color: "#666" }}>{fmt(l.unit_price)}/{l.unit}</td>
                                        <td style={{ padding: "4px 6px", textAlign: "right", fontWeight: 600 }}>{fmt(l.total_price)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                  <tfoot>
                                    <tr style={{ borderTop: "1.5px solid #ddd6c8" }}>
                                      <td style={{ padding: "6px", fontWeight: 700 }}>Total ({autoLines.length})</td>
                                      <td />
                                      <td style={{ padding: "6px", textAlign: "right", fontWeight: 700 }}>
                                        {fmt(autoLines.reduce((s, l) => s + (l.total_price ?? 0), 0))}
                                      </td>
                                    </tr>
                                  </tfoot>
                                </table>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </>
          )
        )}
      </div>
    </RequireRole>
  );
}
