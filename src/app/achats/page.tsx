"use client";

import { useEffect, useState } from "react";
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

type KPIs = {
  totalHT: number;
  nbFactures: number;
  topSupplier: string;
  commandesEnCours: number;
};

const fmt = (n: number | null) =>
  n == null ? "—" : n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

export default function AchatsPage() {
  const router = useRouter();
  const etab = useEtablissement();
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [kpis, setKPIs] = useState<KPIs>({ totalHT: 0, nbFactures: 0, topSupplier: "—", commandesEnCours: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);

      // Current month boundaries
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

      // Recent invoices (last 50)
      const { data: recent } = await supabase
        .from("supplier_invoices")
        .select("id, invoice_number, invoice_date, total_ht, total_ttc, supplier_id, suppliers(name)")
        .order("invoice_date", { ascending: false })
        .limit(50);

      const rows = (recent ?? []) as unknown as InvoiceRow[];
      setInvoices(rows);

      // KPI: invoices this month
      const { data: monthInvoices } = await supabase
        .from("supplier_invoices")
        .select("total_ht, supplier_id, suppliers(name)")
        .gte("invoice_date", monthStart)
        .lte("invoice_date", monthEnd);

      const mi = (monthInvoices ?? []) as unknown as { total_ht: number | null; supplier_id: string | null; suppliers: { name: string } | null }[];
      const totalHT = mi.reduce((s, r) => s + (r.total_ht ?? 0), 0);
      const nbFactures = mi.length;

      // Top supplier this month
      const bySupplier: Record<string, { name: string; total: number }> = {};
      for (const r of mi) {
        const sid = r.supplier_id ?? "?";
        const name = r.suppliers?.name ?? "Inconnu";
        if (!bySupplier[sid]) bySupplier[sid] = { name, total: 0 };
        bySupplier[sid].total += r.total_ht ?? 0;
      }
      const sorted = Object.values(bySupplier).sort((a, b) => b.total - a.total);
      const topSupplier = sorted[0]?.name ?? "—";

      // KPI: commandes en cours
      const { count } = await supabase
        .from("commande_sessions")
        .select("id", { count: "exact", head: true })
        .neq("status", "recue");

      setKPIs({ totalHT, nbFactures, topSupplier, commandesEnCours: count ?? 0 });
      setLoading(false);
    })();
  }, [etab]);

  const kpiCards: { label: string; value: string }[] = [
    { label: "Total achats ce mois", value: fmt(kpis.totalHT) },
    { label: "Factures ce mois", value: String(kpis.nbFactures) },
    { label: "Fournisseur principal", value: kpis.topSupplier },
    { label: "Commandes en cours", value: String(kpis.commandesEnCours) },
  ];

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
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 28 }}>
              {kpiCards.map((k) => (
                <div
                  key={k.label}
                  style={{
                    background: "#f6eedf",
                    borderRadius: 10,
                    padding: "16px 18px",
                    border: "1px solid #ddd6c8",
                  }}
                >
                  <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 12, color: "#999", marginBottom: 6 }}>
                    {k.label}
                  </div>
                  <div style={{ fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 20, color: "#1a1a1a" }}>
                    {k.value}
                  </div>
                </div>
              ))}
            </div>

            {/* Quick actions */}
            <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
              <button
                onClick={() => router.push("/invoices")}
                style={{
                  fontFamily: "DM Sans, sans-serif",
                  fontSize: 14,
                  fontWeight: 600,
                  background: "#e27f57",
                  color: "#fff",
                  border: "none",
                  borderRadius: 20,
                  padding: "9px 20px",
                  cursor: "pointer",
                }}
              >
                Importer une facture
              </button>
              <button
                onClick={() => router.push("/commandes")}
                style={{
                  fontFamily: "DM Sans, sans-serif",
                  fontSize: 14,
                  fontWeight: 600,
                  background: "#fff",
                  color: "#1a1a1a",
                  border: "1px solid #ddd6c8",
                  borderRadius: 20,
                  padding: "9px 20px",
                  cursor: "pointer",
                }}
              >
                Nouvelle commande
              </button>
            </div>

            {/* Recent invoices table */}
            <h2 style={{ fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 16, color: "#1a1a1a", margin: "0 0 12px" }}>
              Factures recentes
            </h2>

            {invoices.length === 0 ? (
              <p style={{ color: "#999", fontSize: 14 }}>Aucune facture importee.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "DM Sans, sans-serif", fontSize: 14 }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid #ddd6c8", textAlign: "left" }}>
                      <th style={{ padding: "8px 10px", fontWeight: 600, color: "#999", fontSize: 12 }}>Date</th>
                      <th style={{ padding: "8px 10px", fontWeight: 600, color: "#999", fontSize: 12 }}>Fournisseur</th>
                      <th style={{ padding: "8px 10px", fontWeight: 600, color: "#999", fontSize: 12 }}>N° facture</th>
                      <th style={{ padding: "8px 10px", fontWeight: 600, color: "#999", fontSize: 12, textAlign: "right" }}>Total HT</th>
                      <th style={{ padding: "8px 10px", fontWeight: 600, color: "#999", fontSize: 12, textAlign: "right" }}>Total TTC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => (
                      <tr
                        key={inv.id}
                        onClick={() => router.push(`/invoices`)}
                        style={{ borderBottom: "1px solid #ddd6c8", cursor: "pointer" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "#f5f0e8")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        <td style={{ padding: "10px" }}>
                          {inv.invoice_date
                            ? new Date(inv.invoice_date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" })
                            : "—"}
                        </td>
                        <td style={{ padding: "10px" }}>{inv.suppliers?.name ?? "—"}</td>
                        <td style={{ padding: "10px", color: "#999" }}>{inv.invoice_number ?? "—"}</td>
                        <td style={{ padding: "10px", textAlign: "right" }}>{fmt(inv.total_ht)}</td>
                        <td style={{ padding: "10px", textAlign: "right" }}>{fmt(inv.total_ttc)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </RequireRole>
  );
}
