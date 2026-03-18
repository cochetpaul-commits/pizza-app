"use client";

import { useEffect, useState } from "react";

import { RequireRole } from "@/components/RequireRole";
import { useEtablissement } from "@/lib/EtablissementContext";
import { supabase } from "@/lib/supabaseClient";

type PeriodKey = "1" | "3" | "6" | "12";

type SupplierStat = {
  name: string;
  totalHT: number;
  nbFactures: number;
  pct: number;
};

type MonthBar = {
  label: string;
  total: number;
  pct: number;
};

const fmt = (n: number) =>
  n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "1", label: "Ce mois" },
  { key: "3", label: "3 mois" },
  { key: "6", label: "6 mois" },
  { key: "12", label: "12 mois" },
];

function getStartDate(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months + 1);
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

export default function StatsAchatsPage() {
  const etab = useEtablissement();
  const [period, setPeriod] = useState<PeriodKey>("3");
  const [loading, setLoading] = useState(true);
  const [totalHT, setTotalHT] = useState(0);
  const [avgMonthly, setAvgMonthly] = useState(0);
  const [nbSuppliers, setNbSuppliers] = useState(0);
  const [nbFactures, setNbFactures] = useState(0);
  const [topSuppliers, setTopSuppliers] = useState<SupplierStat[]>([]);
  const [monthBars, setMonthBars] = useState<MonthBar[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);

      const months = parseInt(period);
      const startDate = getStartDate(months);

      const { data } = await supabase
        .from("supplier_invoices")
        .select("invoice_date, total_ht, supplier_id, suppliers(name)")
        .gte("invoice_date", startDate)
        .order("invoice_date", { ascending: true });

      const rows = (data ?? []) as unknown as {
        invoice_date: string | null;
        total_ht: number | null;
        supplier_id: string | null;
        suppliers: { name: string } | null;
      }[];

      // Total HT
      const total = rows.reduce((s, r) => s + (r.total_ht ?? 0), 0);
      setTotalHT(total);
      setAvgMonthly(months > 0 ? total / months : 0);
      setNbFactures(rows.length);

      // Suppliers stats
      const bySupplier: Record<string, { name: string; totalHT: number; nbFactures: number }> = {};
      const supplierIds = new Set<string>();
      for (const r of rows) {
        const sid = r.supplier_id ?? "?";
        supplierIds.add(sid);
        const name = r.suppliers?.name ?? "Inconnu";
        if (!bySupplier[sid]) bySupplier[sid] = { name, totalHT: 0, nbFactures: 0 };
        bySupplier[sid].totalHT += r.total_ht ?? 0;
        bySupplier[sid].nbFactures += 1;
      }
      setNbSuppliers(supplierIds.size);

      const supplierList = Object.values(bySupplier)
        .sort((a, b) => b.totalHT - a.totalHT)
        .map((s) => ({
          ...s,
          pct: total > 0 ? (s.totalHT / total) * 100 : 0,
        }));
      setTopSuppliers(supplierList);

      // Monthly bars
      const byMonth: Record<string, number> = {};
      for (const r of rows) {
        if (!r.invoice_date) continue;
        const key = r.invoice_date.slice(0, 7); // YYYY-MM
        byMonth[key] = (byMonth[key] ?? 0) + (r.total_ht ?? 0);
      }

      // Fill missing months
      const allMonths: string[] = [];
      const d = new Date();
      for (let i = months - 1; i >= 0; i--) {
        const md = new Date(d.getFullYear(), d.getMonth() - i, 1);
        const key = md.toISOString().slice(0, 7);
        allMonths.push(key);
        if (!byMonth[key]) byMonth[key] = 0;
      }

      const maxMonth = Math.max(...allMonths.map((k) => byMonth[k]), 1);
      const bars: MonthBar[] = allMonths.map((k) => {
        const [y, m] = k.split("-");
        const monthNames = ["Jan", "Fev", "Mar", "Avr", "Mai", "Jun", "Jul", "Aou", "Sep", "Oct", "Nov", "Dec"];
        const label = `${monthNames[parseInt(m) - 1]} ${y.slice(2)}`;
        return { label, total: byMonth[k], pct: (byMonth[k] / maxMonth) * 100 };
      });
      setMonthBars(bars);

      setLoading(false);
    })();
  }, [period, etab]);

  const kpiCards: { label: string; value: string }[] = [
    { label: "Total achats HT", value: fmt(totalHT) },
    { label: "Moyenne mensuelle", value: fmt(avgMonthly) },
    { label: "Fournisseurs actifs", value: String(nbSuppliers) },
    { label: "Factures traitees", value: String(nbFactures) },
  ];

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px 40px" }}>
        <h1 style={{ fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 22, color: "#1a1a1a", margin: "0 0 20px" }}>
          Stats d&apos;achats
        </h1>

        {/* Period selector */}
        <div style={{ display: "flex", gap: 6, marginBottom: 24 }}>
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              style={{
                fontFamily: "DM Sans, sans-serif",
                fontSize: 13,
                fontWeight: 600,
                padding: "7px 16px",
                borderRadius: 20,
                border: period === p.key ? "2px solid #e27f57" : "1px solid #ddd6c8",
                background: period === p.key ? "#e27f57" : "#fff",
                color: period === p.key ? "#fff" : "#1a1a1a",
                cursor: "pointer",
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

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

            {/* Top fournisseurs */}
            <h2 style={{ fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 16, color: "#1a1a1a", margin: "0 0 12px" }}>
              Top fournisseurs
            </h2>

            {topSuppliers.length === 0 ? (
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
                      <th style={{ padding: "8px 10px", fontWeight: 600, color: "#999", fontSize: 12, width: 120 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {topSuppliers.map((s, i) => (
                      <tr key={s.name} style={{ borderBottom: "1px solid #ddd6c8" }}>
                        <td style={{ padding: "10px", color: "#999" }}>{i + 1}</td>
                        <td style={{ padding: "10px", fontWeight: 500 }}>{s.name}</td>
                        <td style={{ padding: "10px", textAlign: "right" }}>{fmt(s.totalHT)}</td>
                        <td style={{ padding: "10px", textAlign: "right" }}>{s.nbFactures}</td>
                        <td style={{ padding: "10px", textAlign: "right", color: "#999" }}>{s.pct.toFixed(1)}%</td>
                        <td style={{ padding: "10px" }}>
                          <div style={{ background: "#ddd6c8", borderRadius: 4, height: 8, overflow: "hidden" }}>
                            <div
                              style={{
                                width: `${Math.max(s.pct, 2)}%`,
                                height: "100%",
                                background: "#e27f57",
                                borderRadius: 4,
                              }}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Monthly evolution */}
            <h2 style={{ fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 16, color: "#1a1a1a", margin: "0 0 12px" }}>
              Evolution mensuelle
            </h2>

            {monthBars.length === 0 ? (
              <p style={{ color: "#999", fontSize: 14 }}>Aucune donnee.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {monthBars.map((b) => (
                  <div key={b.label} style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: "DM Sans, sans-serif", fontSize: 13 }}>
                    <span style={{ width: 56, flexShrink: 0, color: "#999", textAlign: "right" }}>{b.label}</span>
                    <div style={{ flex: 1, background: "#ddd6c8", borderRadius: 4, height: 20, overflow: "hidden" }}>
                      <div
                        style={{
                          width: `${Math.max(b.pct, 1)}%`,
                          height: "100%",
                          background: "#e27f57",
                          borderRadius: 4,
                          display: "flex",
                          alignItems: "center",
                          paddingLeft: 6,
                        }}
                      >
                        {b.pct > 20 && (
                          <span style={{ color: "#fff", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>
                            {fmt(b.total)}
                          </span>
                        )}
                      </div>
                    </div>
                    {b.pct <= 20 && (
                      <span style={{ fontSize: 12, color: "#1a1a1a", whiteSpace: "nowrap" }}>{fmt(b.total)}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </RequireRole>
  );
}
