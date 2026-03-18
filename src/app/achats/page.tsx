"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { RequireRole } from "@/components/RequireRole";
import { useEtablissement } from "@/lib/EtablissementContext";
import { supabase } from "@/lib/supabaseClient";

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

type KPIs = {
  totalHT: number;
  nbFactures: number;
  topSupplier: string;
};

const fmt = (n: number | null) =>
  n == null ? "—" : n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

export default function AchatsPage() {
  const router = useRouter();
  const etab = useEtablissement();
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [kpis, setKPIs] = useState<KPIs>({ totalHT: 0, nbFactures: 0, topSupplier: "—" });
  const [loading, setLoading] = useState(true);

  // Folders: which supplier is open
  const [openFolder, setOpenFolder] = useState<string | null>(null);
  // Invoice detail
  const [selectedInvoice, setSelectedInvoice] = useState<string | null>(null);
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [linesLoading, setLinesLoading] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);

      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

      const { data: recent } = await supabase
        .from("supplier_invoices")
        .select("id, invoice_number, invoice_date, total_ht, total_ttc, supplier_id, suppliers(name)")
        .order("invoice_date", { ascending: false })
        .limit(200);

      const rows = (recent ?? []) as unknown as InvoiceRow[];
      setInvoices(rows);

      // KPIs this month
      const { data: monthInvoices } = await supabase
        .from("supplier_invoices")
        .select("total_ht, supplier_id, suppliers(name)")
        .gte("invoice_date", monthStart)
        .lte("invoice_date", monthEnd);

      const mi = (monthInvoices ?? []) as unknown as { total_ht: number | null; supplier_id: string | null; suppliers: { name: string } | null }[];
      const totalHT = mi.reduce((s, r) => s + (r.total_ht ?? 0), 0);
      const nbFactures = mi.length;

      const bySupplier: Record<string, { name: string; total: number }> = {};
      for (const r of mi) {
        const sid = r.supplier_id ?? "?";
        const name = r.suppliers?.name ?? "Inconnu";
        if (!bySupplier[sid]) bySupplier[sid] = { name, total: 0 };
        bySupplier[sid].total += r.total_ht ?? 0;
      }
      const sorted = Object.values(bySupplier).sort((a, b) => b.total - a.total);
      const topSupplier = sorted[0]?.name ?? "—";

      setKPIs({ totalHT, nbFactures, topSupplier });
      setLoading(false);
    })();
  }, [etab]);

  // Group invoices by supplier (normalize name to handle duplicates like COZIGOU/Cozigou)
  const grouped: Record<string, { name: string; invoices: InvoiceRow[] }> = {};
  for (const inv of invoices) {
    const rawName = inv.suppliers?.name ?? "Inconnu";
    const key = rawName.toLowerCase().trim();
    if (!grouped[key]) grouped[key] = { name: rawName, invoices: [] };
    grouped[key].invoices.push(inv);
  }
  const folders = Object.entries(grouped).sort((a, b) => a[1].name.localeCompare(b[1].name, "fr"));

  // Load invoice lines
  const loadLines = async (invoiceId: string) => {
    if (selectedInvoice === invoiceId) {
      setSelectedInvoice(null);
      setLines([]);
      return;
    }
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

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px 40px" }}>
        <h1 style={{ fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 22, color: "#1a1a1a", margin: "0 0 20px" }}>
          Achats
        </h1>

        {loading ? (
          <p style={{ color: "#999", fontSize: 14, textAlign: "center", marginTop: 40 }}>Chargement...</p>
        ) : (
          <>
            {/* KPI cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 24 }}>
              {[
                { label: "Total achats ce mois", value: fmt(kpis.totalHT) },
                { label: "Factures ce mois", value: String(kpis.nbFactures) },
                { label: "Fournisseur principal", value: kpis.topSupplier },
              ].map((k) => (
                <div
                  key={k.label}
                  style={{ background: "#f6eedf", borderRadius: 10, padding: "16px 18px", border: "1px solid #ddd6c8" }}
                >
                  <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 12, color: "#999", marginBottom: 6 }}>{k.label}</div>
                  <div style={{ fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 20, color: "#1a1a1a" }}>{k.value}</div>
                </div>
              ))}
            </div>

            {/* Import button */}
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

            {/* Folders by supplier */}
            <h2 style={{ fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 16, color: "#1a1a1a", margin: "0 0 12px" }}>
              Factures par fournisseur
            </h2>

            {folders.length === 0 ? (
              <p style={{ color: "#999", fontSize: 14 }}>Aucune facture importee.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {folders.map(([sid, folder]) => {
                  const isOpen = openFolder === sid;
                  const folderTotal = folder.invoices.reduce((s, i) => s + (i.total_ht ?? 0), 0);

                  return (
                    <div key={sid} style={{ border: "1px solid #ddd6c8", borderRadius: 10, overflow: "hidden" }}>
                      {/* Folder header */}
                      <div
                        onClick={() => setOpenFolder(isOpen ? null : sid)}
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: "12px 16px", cursor: "pointer",
                          background: isOpen ? "#f5f0e8" : "#fff",
                          transition: "background 0.15s",
                        }}
                        onMouseEnter={(e) => { if (!isOpen) e.currentTarget.style.background = "#faf6ef"; }}
                        onMouseLeave={(e) => { if (!isOpen) e.currentTarget.style.background = "#fff"; }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontSize: 12, color: "#999", transition: "transform 0.2s", transform: isOpen ? "rotate(90deg)" : "rotate(0deg)" }}>
                            ▶
                          </span>
                          <span style={{ fontFamily: "DM Sans, sans-serif", fontWeight: 600, fontSize: 14, color: "#1a1a1a" }}>
                            {folder.name}
                          </span>
                          <span style={{
                            fontFamily: "DM Sans, sans-serif", fontSize: 11, color: "#999",
                            background: "#f2ede4", borderRadius: 8, padding: "2px 8px",
                          }}>
                            {folder.invoices.length} facture{folder.invoices.length > 1 ? "s" : ""}
                          </span>
                        </div>
                        <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 13, color: "#666" }}>
                          {fmt(folderTotal)} HT
                        </span>
                      </div>

                      {/* Folder content: invoice list */}
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
                                      style={{
                                        borderBottom: "1px solid #eee6d8",
                                        cursor: "pointer",
                                        background: isSelected ? "#f5f0e8" : "transparent",
                                      }}
                                      onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "#faf6ef"; }}
                                      onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = isSelected ? "#f5f0e8" : "transparent"; }}
                                    >
                                      <td style={tdStyle}>{fmtDate(inv.invoice_date)}</td>
                                      <td style={{ ...tdStyle, color: "#666" }}>{inv.invoice_number ?? "—"}</td>
                                      <td style={tdR}>{fmt(inv.total_ht)}</td>
                                      <td style={tdR}>{fmt(inv.total_ttc)}</td>
                                    </tr>
                                    {/* Invoice detail lines */}
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
        )}
      </div>
    </RequireRole>
  );
}
