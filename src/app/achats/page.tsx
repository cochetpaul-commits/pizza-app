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

type Tab = "factures" | "fournisseurs";

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

const SUPPLIER_COLORS = [
  "#8B1A1A", "#C0392B", "#D4775A", "#E67E22", "#D4AC0D",
  "#C8CC78", "#7CB342", "#26A69A", "#4EAAB0", "#2E86C1",
  "#5B6AAF", "#7D3C98", "#95A5A6",
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
    // Sort by total descending to assign colors by importance
    return Object.entries(grouped).sort((a, b) => {
      const totalA = a[1].invoices.reduce((s, i) => s + (i.total_ht ?? 0), 0);
      const totalB = b[1].invoices.reduce((s, i) => s + (i.total_ht ?? 0), 0);
      return totalB - totalA;
    });
  }, [invoices]);

  // Assign consistent colors to folders (by rank)
  const folderColorMap = useMemo(() => {
    const m = new Map<string, string>();
    folders.forEach(([key], i) => { m.set(key, SUPPLIER_COLORS[i % SUPPLIER_COLORS.length]); });
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
          {tabBtn("factures", "Factures")}
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

        {/* ═══ TAB: FOURNISSEURS ═══ */}
        {tab === "fournisseurs" && (
          suppliersLoading ? (
            <p style={{ color: "#999", fontSize: 14, textAlign: "center", marginTop: 40 }}>Chargement...</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {suppliers.filter((s) => s.is_active).map((s) => {
                const st = supplierStats.get(s.id);
                return (
                  <div key={s.id} style={{
                    border: "1px solid #ddd6c8", borderRadius: 12, padding: "14px 16px",
                    background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                  }}>
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
                          background: "#D4775A", color: "#fff", borderRadius: 20,
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
