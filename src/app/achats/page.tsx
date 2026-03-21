"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { RequireRole } from "@/components/RequireRole";
import { useEtablissement } from "@/lib/EtablissementContext";
import { supabase } from "@/lib/supabaseClient";

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

type Tab = "factures" | "stats" | "fournisseurs";
type PeriodKey = "1" | "3" | "6" | "12";

type SupplierStat = { name: string; totalHT: number; nbFactures: number; pct: number };
type MonthBar = { label: string; total: number; pct: number };

type SupplierRow = {
  id: string; name: string; is_active: boolean;
  email: string | null; phone: string | null; contact_name: string | null;
};
type SupplierInfo = { refCount: number; lastImport: string | null; lastImportNumber: string | null };

/* ── Helpers ── */

const fmt = (n: number | null) =>
  n == null ? "—" : n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

function getStartDate(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months + 1);
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "1", label: "Ce mois" },
  { key: "3", label: "3 mois" },
  { key: "6", label: "6 mois" },
  { key: "12", label: "12 mois" },
];

/* ── Component ── */

export default function AchatsPage() {
  const router = useRouter();
  const etab = useEtablissement();
  const etabId = etab.current?.id ?? null;

  const [tab, setTab] = useState<Tab>("factures");

  // ── Factures state ──
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [kpis, setKPIs] = useState({ totalHT: 0, nbFactures: 0, topSupplier: "—" });
  const [loading, setLoading] = useState(true);
  const [openFolder, setOpenFolder] = useState<string | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<string | null>(null);
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [linesLoading, setLinesLoading] = useState(false);

  // ── Stats state ──
  const [period, setPeriod] = useState<PeriodKey>("3");
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsData, setStatsData] = useState<{
    totalHT: number; avgMonthly: number; nbSuppliers: number; nbFactures: number;
    topSuppliers: SupplierStat[]; monthBars: MonthBar[];
  }>({ totalHT: 0, avgMonthly: 0, nbSuppliers: 0, nbFactures: 0, topSuppliers: [], monthBars: [] });

  // ── Fournisseurs state ──
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [supplierStats, setSupplierStats] = useState<Map<string, SupplierInfo>>(new Map());
  const [suppliersLoading, setSuppliersLoading] = useState(false);

  // ── Load factures ──
  useEffect(() => {
    (async () => {
      setLoading(true);

      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

      let recentQ = supabase
        .from("supplier_invoices")
        .select("id, invoice_number, invoice_date, total_ht, total_ttc, supplier_id, suppliers(name)")
        .order("invoice_date", { ascending: false })
        .limit(200);
      if (etabId) recentQ = recentQ.eq("etablissement_id", etabId);
      const { data: recent } = await recentQ;

      setInvoices((recent ?? []) as unknown as InvoiceRow[]);

      let monthQ = supabase
        .from("supplier_invoices")
        .select("total_ht, supplier_id, suppliers(name)")
        .gte("invoice_date", monthStart)
        .lte("invoice_date", monthEnd);
      if (etabId) monthQ = monthQ.eq("etablissement_id", etabId);
      const { data: monthInvoices } = await monthQ;

      const mi = (monthInvoices ?? []) as unknown as { total_ht: number | null; supplier_id: string | null; suppliers: { name: string } | null }[];
      const totalHT = mi.reduce((s, r) => s + (r.total_ht ?? 0), 0);

      const bySupplier: Record<string, { name: string; total: number }> = {};
      for (const r of mi) {
        const sid = r.supplier_id ?? "?";
        const name = r.suppliers?.name ?? "Inconnu";
        if (!bySupplier[sid]) bySupplier[sid] = { name, total: 0 };
        bySupplier[sid].total += r.total_ht ?? 0;
      }
      const sorted = Object.values(bySupplier).sort((a, b) => b.total - a.total);

      setKPIs({ totalHT, nbFactures: mi.length, topSupplier: sorted[0]?.name ?? "—" });
      setLoading(false);
    })();
  }, [etabId]);

  // ── Load stats ──
  useEffect(() => {
    if (tab !== "stats") return;
    (async () => {
      setStatsLoading(true);
      const months = parseInt(period);
      const startDate = getStartDate(months);

      let statsQ = supabase
        .from("supplier_invoices")
        .select("invoice_date, total_ht, supplier_id, suppliers(name)")
        .gte("invoice_date", startDate)
        .order("invoice_date", { ascending: true });
      if (etabId) statsQ = statsQ.eq("etablissement_id", etabId);
      const { data } = await statsQ;

      const rows = (data ?? []) as unknown as {
        invoice_date: string | null; total_ht: number | null;
        supplier_id: string | null; suppliers: { name: string } | null;
      }[];

      const total = rows.reduce((s, r) => s + (r.total_ht ?? 0), 0);
      const supplierIds = new Set<string>();
      const bySupplier: Record<string, { name: string; totalHT: number; nbFactures: number }> = {};
      for (const r of rows) {
        const sid = r.supplier_id ?? "?";
        supplierIds.add(sid);
        const name = r.suppliers?.name ?? "Inconnu";
        if (!bySupplier[sid]) bySupplier[sid] = { name, totalHT: 0, nbFactures: 0 };
        bySupplier[sid].totalHT += r.total_ht ?? 0;
        bySupplier[sid].nbFactures += 1;
      }

      const topSuppliers = Object.values(bySupplier)
        .sort((a, b) => b.totalHT - a.totalHT)
        .map((s) => ({ ...s, pct: total > 0 ? (s.totalHT / total) * 100 : 0 }));

      const byMonth: Record<string, number> = {};
      for (const r of rows) {
        if (!r.invoice_date) continue;
        const key = r.invoice_date.slice(0, 7);
        byMonth[key] = (byMonth[key] ?? 0) + (r.total_ht ?? 0);
      }

      const allMonths: string[] = [];
      const d = new Date();
      for (let i = months - 1; i >= 0; i--) {
        const md = new Date(d.getFullYear(), d.getMonth() - i, 1);
        const key = md.toISOString().slice(0, 7);
        allMonths.push(key);
        if (!byMonth[key]) byMonth[key] = 0;
      }

      const maxMonth = Math.max(...allMonths.map((k) => byMonth[k]), 1);
      const monthNames = ["Jan", "Fev", "Mar", "Avr", "Mai", "Jun", "Jul", "Aou", "Sep", "Oct", "Nov", "Dec"];
      const monthBars: MonthBar[] = allMonths.map((k) => {
        const [y, m] = k.split("-");
        return { label: `${monthNames[parseInt(m) - 1]} ${y.slice(2)}`, total: byMonth[k], pct: (byMonth[k] / maxMonth) * 100 };
      });

      setStatsData({
        totalHT: total, avgMonthly: months > 0 ? total / months : 0,
        nbSuppliers: supplierIds.size, nbFactures: rows.length,
        topSuppliers, monthBars,
      });
      setStatsLoading(false);
    })();
  }, [tab, period, etabId]);

  // ── Load fournisseurs ──
  useEffect(() => {
    if (tab !== "fournisseurs") return;
    (async () => {
      setSuppliersLoading(true);
      let supQ = supabase.from("suppliers").select("id,name,is_active,email,phone,contact_name").order("name");
      if (etabId) supQ = supQ.eq("etablissement_id", etabId);
      let invQ = supabase.from("supplier_invoices").select("supplier_id,created_at,invoice_number").order("created_at", { ascending: false });
      if (etabId) invQ = invQ.eq("etablissement_id", etabId);
      const [supRes, offRes, invRes] = await Promise.all([
        supQ,
        supabase.from("v_latest_offers").select("supplier_id"),
        invQ,
      ]);

      const rawRows = (supRes.data ?? []) as SupplierRow[];
      const seen = new Map<string, { canonical: SupplierRow; aliasIds: string[] }>();
      for (const s of rawRows) {
        const key = s.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        if (!seen.has(key)) seen.set(key, { canonical: s, aliasIds: [s.id] });
        else seen.get(key)!.aliasIds.push(s.id);
      }
      setSuppliers(Array.from(seen.values()).map((v) => v.canonical));

      const offerCounts = new Map<string, number>();
      for (const o of (offRes.data ?? [])) {
        if (o.supplier_id) offerCounts.set(o.supplier_id, (offerCounts.get(o.supplier_id) ?? 0) + 1);
      }
      const lastImports = new Map<string, { created_at: string; invoice_number: string | null }>();
      for (const inv of (invRes.data ?? [])) {
        if (inv.supplier_id && !lastImports.has(inv.supplier_id))
          lastImports.set(inv.supplier_id, { created_at: inv.created_at, invoice_number: inv.invoice_number });
      }

      const m = new Map<string, SupplierInfo>();
      for (const { canonical, aliasIds } of seen.values()) {
        let refCount = 0; let lastImport: string | null = null; let lastImportNumber: string | null = null;
        for (const aid of aliasIds) {
          refCount += offerCounts.get(aid) ?? 0;
          const li = lastImports.get(aid);
          if (li && (!lastImport || li.created_at > lastImport)) { lastImport = li.created_at; lastImportNumber = li.invoice_number; }
        }
        m.set(canonical.id, { refCount, lastImport, lastImportNumber });
      }
      setSupplierStats(m);
      setSuppliersLoading(false);
    })();
  }, [tab, etabId]);

  // ── Folders ──
  const folders = useMemo(() => {
    const grouped: Record<string, { name: string; invoices: InvoiceRow[] }> = {};
    for (const inv of invoices) {
      const rawName = inv.suppliers?.name ?? "Inconnu";
      const key = rawName.toLowerCase().trim();
      if (!grouped[key]) grouped[key] = { name: rawName, invoices: [] };
      grouped[key].invoices.push(inv);
    }
    return Object.entries(grouped).sort((a, b) => a[1].name.localeCompare(b[1].name, "fr"));
  }, [invoices]);

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
        border: tab === key ? "2px solid #e27f57" : "1px solid #ddd6c8",
        background: tab === key ? "#e27f57" : "#fff",
        color: tab === key ? "#fff" : "#1a1a1a",
      }}
    >
      {label}
    </button>
  );

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px 40px" }}>
        <h1 style={{ fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 22, color: "#1a1a1a", margin: "0 0 20px" }}>
          Achats
        </h1>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 24 }}>
          {tabBtn("factures", "Factures")}
          {tabBtn("stats", "Statistiques")}
          {tabBtn("fournisseurs", "Fournisseurs")}
        </div>

        {/* ═══ TAB: FACTURES ═══ */}
        {tab === "factures" && (
          loading ? (
            <p style={{ color: "#999", fontSize: 14, textAlign: "center", marginTop: 40 }}>Chargement...</p>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 24 }}>
                {[
                  { label: "Total achats ce mois", value: fmt(kpis.totalHT) },
                  { label: "Factures ce mois", value: String(kpis.nbFactures) },
                  { label: "Fournisseur principal", value: kpis.topSupplier },
                ].map((k) => (
                  <div key={k.label} style={{ background: "#f6eedf", borderRadius: 10, padding: "16px 18px", border: "1px solid #ddd6c8" }}>
                    <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 12, color: "#999", marginBottom: 6 }}>{k.label}</div>
                    <div style={{ fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 20, color: "#1a1a1a" }}>{k.value}</div>
                  </div>
                ))}
              </div>

              <div style={{ marginBottom: 24 }}>
                <button
                  onClick={() => router.push("/invoices")}
                  style={{
                    fontFamily: "DM Sans, sans-serif", fontSize: 14, fontWeight: 600,
                    background: "#e27f57", color: "#fff", border: "none", borderRadius: 20,
                    padding: "9px 20px", cursor: "pointer",
                  }}
                >
                  Importer une facture
                </button>
              </div>

              <h2 style={{ fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 16, color: "#1a1a1a", margin: "0 0 12px" }}>
                Factures par fournisseur
              </h2>

              {folders.length === 0 ? (
                <p style={{ color: "#999", fontSize: 14 }}>Aucune facture importee.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {folders.map(([key, folder]) => {
                    const isOpen = openFolder === key;
                    const folderTotal = folder.invoices.reduce((s, i) => s + (i.total_ht ?? 0), 0);
                    return (
                      <div key={key} style={{ border: "1px solid #ddd6c8", borderRadius: 10, overflow: "hidden" }}>
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
                            <span style={{ fontSize: 12, color: "#999", transition: "transform 0.2s", transform: isOpen ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
                            <span style={{ fontFamily: "DM Sans, sans-serif", fontWeight: 600, fontSize: 14, color: "#1a1a1a" }}>{folder.name}</span>
                            <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 11, color: "#999", background: "#f2ede4", borderRadius: 8, padding: "2px 8px" }}>
                              {folder.invoices.length} facture{folder.invoices.length > 1 ? "s" : ""}
                            </span>
                          </div>
                          <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 13, color: "#666" }}>{fmt(folderTotal)} HT</span>
                        </div>
                        {isOpen && (
                          <div style={{ borderTop: "1px solid #ddd6c8" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "DM Sans, sans-serif" }}>
                              <thead>
                                <tr style={{ borderBottom: "1px solid #eee6d8" }}>
                                  <th style={thStyle}>Date</th>
                                  <th style={thStyle}>N° facture</th>
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
                                            <div style={{ background: "#faf6ef", padding: "12px 16px" }}>
                                              {linesLoading ? (
                                                <p style={{ color: "#999", fontSize: 12, margin: 0 }}>Chargement...</p>
                                              ) : lines.length === 0 ? (
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
                                                    {lines.map((l) => (
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

        {/* ═══ TAB: STATISTIQUES ═══ */}
        {tab === "stats" && (
          <>
            <div style={{ display: "flex", gap: 6, marginBottom: 24 }}>
              {PERIODS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setPeriod(p.key)}
                  style={{
                    fontFamily: "DM Sans, sans-serif", fontSize: 12, fontWeight: 600,
                    padding: "6px 14px", borderRadius: 20, cursor: "pointer",
                    border: period === p.key ? "2px solid #1a1a1a" : "1px solid #ddd6c8",
                    background: period === p.key ? "#1a1a1a" : "#fff",
                    color: period === p.key ? "#fff" : "#1a1a1a",
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {statsLoading ? (
              <p style={{ color: "#999", fontSize: 14, textAlign: "center", marginTop: 40 }}>Chargement...</p>
            ) : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 28 }}>
                  {[
                    { label: "Total achats HT", value: fmt(statsData.totalHT) },
                    { label: "Moyenne mensuelle", value: fmt(statsData.avgMonthly) },
                    { label: "Fournisseurs actifs", value: String(statsData.nbSuppliers) },
                    { label: "Factures traitees", value: String(statsData.nbFactures) },
                  ].map((k) => (
                    <div key={k.label} style={{ background: "#f6eedf", borderRadius: 10, padding: "16px 18px", border: "1px solid #ddd6c8" }}>
                      <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 12, color: "#999", marginBottom: 6 }}>{k.label}</div>
                      <div style={{ fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 20, color: "#1a1a1a" }}>{k.value}</div>
                    </div>
                  ))}
                </div>

                <h2 style={{ fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 16, color: "#1a1a1a", margin: "0 0 12px" }}>
                  Top fournisseurs
                </h2>

                {statsData.topSuppliers.length === 0 ? (
                  <p style={{ color: "#999", fontSize: 14, marginBottom: 28 }}>Aucune donnee sur la periode.</p>
                ) : (
                  <div style={{ overflowX: "auto", marginBottom: 28 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "DM Sans, sans-serif", fontSize: 14 }}>
                      <thead>
                        <tr style={{ borderBottom: "2px solid #ddd6c8", textAlign: "left" }}>
                          <th style={{ padding: "8px 10px", fontWeight: 600, color: "#999", fontSize: 12, width: 36 }}>#</th>
                          <th style={{ padding: "8px 10px", fontWeight: 600, color: "#999", fontSize: 12 }}>Fournisseur</th>
                          <th style={{ padding: "8px 10px", fontWeight: 600, color: "#999", fontSize: 12, textAlign: "right" }}>Total HT</th>
                          <th style={{ padding: "8px 10px", fontWeight: 600, color: "#999", fontSize: 12, textAlign: "right" }}>Factures</th>
                          <th style={{ padding: "8px 10px", fontWeight: 600, color: "#999", fontSize: 12, textAlign: "right", width: 60 }}>%</th>
                          <th style={{ padding: "8px 10px", width: 120 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {statsData.topSuppliers.map((s, i) => (
                          <tr key={s.name} style={{ borderBottom: "1px solid #ddd6c8" }}>
                            <td style={{ padding: "10px", color: "#999" }}>{i + 1}</td>
                            <td style={{ padding: "10px", fontWeight: 500 }}>{s.name}</td>
                            <td style={{ padding: "10px", textAlign: "right" }}>{fmt(s.totalHT)}</td>
                            <td style={{ padding: "10px", textAlign: "right" }}>{s.nbFactures}</td>
                            <td style={{ padding: "10px", textAlign: "right", color: "#999" }}>{s.pct.toFixed(1)}%</td>
                            <td style={{ padding: "10px" }}>
                              <div style={{ background: "#ddd6c8", borderRadius: 4, height: 8, overflow: "hidden" }}>
                                <div style={{ width: `${Math.max(s.pct, 2)}%`, height: "100%", background: "#e27f57", borderRadius: 4 }} />
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <h2 style={{ fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 16, color: "#1a1a1a", margin: "0 0 12px" }}>
                  Evolution mensuelle
                </h2>

                {statsData.monthBars.length === 0 ? (
                  <p style={{ color: "#999", fontSize: 14 }}>Aucune donnee.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {statsData.monthBars.map((b) => (
                      <div key={b.label} style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: "DM Sans, sans-serif", fontSize: 13 }}>
                        <span style={{ width: 56, flexShrink: 0, color: "#999", textAlign: "right" }}>{b.label}</span>
                        <div style={{ flex: 1, background: "#ddd6c8", borderRadius: 4, height: 20, overflow: "hidden" }}>
                          <div style={{
                            width: `${Math.max(b.pct, 1)}%`, height: "100%", background: "#e27f57",
                            borderRadius: 4, display: "flex", alignItems: "center", paddingLeft: 6,
                          }}>
                            {b.pct > 20 && <span style={{ color: "#fff", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>{fmt(b.total)}</span>}
                          </div>
                        </div>
                        {b.pct <= 20 && <span style={{ fontSize: 12, color: "#1a1a1a", whiteSpace: "nowrap" }}>{fmt(b.total)}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ═══ TAB: FOURNISSEURS ═══ */}
        {tab === "fournisseurs" && (
          suppliersLoading ? (
            <p style={{ color: "#999", fontSize: 14, textAlign: "center", marginTop: 40 }}>Chargement...</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {suppliers.filter((s) => s.is_active).map((s) => {
                const st = supplierStats.get(s.id);
                return (
                  <div key={s.id} style={{ border: "1px solid #ddd6c8", borderRadius: 10, padding: "14px 16px", background: "#fff" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Link
                          href={`/fournisseurs/${s.id}`}
                          style={{ fontFamily: "DM Sans, sans-serif", fontWeight: 700, fontSize: 15, color: "#D4775A", textDecoration: "none" }}
                        >
                          {s.name}
                        </Link>
                        <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 12, color: "#999", marginTop: 4 }}>
                          {s.contact_name || s.email || s.phone
                            ? [s.contact_name, s.email, s.phone].filter(Boolean).join(" · ")
                            : "Coordonnees non renseignees"}
                        </div>
                        <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 13, marginTop: 6, display: "flex", gap: 12, flexWrap: "wrap" }}>
                          <span><strong>{st?.refCount ?? 0}</strong> <span style={{ color: "#999" }}>ref.</span></span>
                          <span style={{ color: "#999", fontSize: 12 }}>
                            {st?.lastImport
                              ? `Import : ${new Date(st.lastImport).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}${st.lastImportNumber ? ` · ${st.lastImportNumber}` : ""}`
                              : "Aucun import"}
                          </span>
                        </div>
                      </div>
                      <Link
                        href={`/fournisseurs/${s.id}`}
                        style={{
                          fontFamily: "DM Sans, sans-serif", fontSize: 13, fontWeight: 600,
                          background: "#e27f57", color: "#fff", borderRadius: 20,
                          padding: "7px 16px", textDecoration: "none", whiteSpace: "nowrap",
                        }}
                      >
                        Fiche
                      </Link>
                    </div>
                  </div>
                );
              })}
              {suppliers.filter((s) => s.is_active).length === 0 && (
                <p style={{ color: "#999", fontSize: 14, textAlign: "center" }}>Aucun fournisseur actif.</p>
              )}
            </div>
          )
        )}
      </div>
    </RequireRole>
  );
}
