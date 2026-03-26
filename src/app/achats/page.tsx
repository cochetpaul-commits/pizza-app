"use client";

import React, { useEffect, useState, useMemo } from "react";
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

type Tab = "factures" | "imports";

/* ── Helpers ── */

const fmt = (n: number | null) =>
  n == null ? "—" : n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

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

  // ── Auto-imports state ──
  type AutoImport = { id: string; created_at: string; fournisseur: string | null; invoice_number: string | null; nb_lignes: number; status: string; error_detail: string | null; invoice_id: string | null; gmail_message_id: string | null };
  const [autoImports, setAutoImports] = useState<AutoImport[]>([]);
  const [autoLoading, setAutoLoading] = useState(false);
  const [autoFilter, setAutoFilter] = useState<string>("all");
  const [autoExpandedId, setAutoExpandedId] = useState<string | null>(null);
  const [autoLines, setAutoLines] = useState<InvoiceLine[]>([]);
  const [autoLinesLoading, setAutoLinesLoading] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);


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
          {tabBtn("imports", "Import auto")}
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
