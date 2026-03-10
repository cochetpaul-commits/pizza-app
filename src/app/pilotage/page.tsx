"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { NavBar } from "@/components/NavBar";
import { RequireRole } from "@/components/RequireRole";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts";

// ── Types ────────────────────────────────────────────────────────────────────

type CaJour = {
  date: string;
  totalSales: number;
  guestsNumber: number;
  ticketMoyen: number;
};

type DayData = {
  date: string;
  label: string;
  totalSales: number;
  guestsNumber: number;
};

type CaSemaine = {
  days: DayData[];
  totalSales: number;
};

type Product = {
  name: string;
  quantity: number;
  totalSales: number;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtEuro(v: number): string {
  return v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

function fmtEuroInt(v: number): string {
  return v.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " €";
}

// ── Sub-sections vers les outils ─────────────────────────────────────────────

const SECTIONS = [
  { href: "/mercuriale",      label: "MERCURIALE",           sub: "Prix fournisseurs · Export PDF", color: "#92400e" },
  { href: "/epicerie",        label: "ÉPICERIE",             sub: "Prix de vente · Export CSV",     color: "#1e40af" },
  { href: "/variations-prix", label: "VARIATIONS & ALERTES", sub: "Historique · Hausses & baisses · Veille 30 j", color: "#8B1A1A" },
];

// ── Styles ───────────────────────────────────────────────────────────────────

const ACCENT = "#8B1A1A";

const kpiCard: React.CSSProperties = {
  background: "#fff",
  borderRadius: 12,
  padding: "14px 16px",
  border: "1px solid #e8e0d6",
  flex: "1 1 120px",
  minWidth: 0,
};

const kpiLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 1.5,
  textTransform: "uppercase",
  color: "#9a8f84",
  marginBottom: 4,
};

const kpiValue: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 700,
  color: ACCENT,
  lineHeight: 1,
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

// ── Component ────────────────────────────────────────────────────────────────

export default function PilotagePage() {
  const [caJour, setCaJour] = useState<CaJour | null>(null);
  const [caSemaine, setCaSemaine] = useState<CaSemaine | null>(null);
  const [topProduits, setTopProduits] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<string>("");

  async function loadAll() {
    const [j, s, t] = await Promise.all([
      fetch("/api/popina/ca-jour").then(r => r.ok ? r.json() : null),
      fetch("/api/popina/ca-semaine").then(r => r.ok ? r.json() : null),
      fetch("/api/popina/top-produits").then(r => r.ok ? r.json() : null),
    ]);
    setCaJour(j);
    setCaSemaine(s);
    setTopProduits(t?.products ?? []);
    setLastUpdate(new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }));
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAll();
    const iv = setInterval(() => { void loadAll(); }, 5 * 60 * 1000);
    return () => clearInterval(iv);
  }, []);

  return (
    <RequireRole allowedRoles={["admin", "direction"]}>
    <>
      <NavBar />
      <main style={{ maxWidth: 680, margin: "0 auto", padding: "24px 16px 48px", boxSizing: "border-box" }}>

        {/* ── Header ── */}
        <div style={{ marginBottom: 20 }}>
          <p style={{ margin: "0 0 4px", fontSize: 10, fontWeight: 700, letterSpacing: 2, color: ACCENT, textTransform: "uppercase" }}>PILOTAGE</p>
          <h1 style={{ fontSize: 24, color: "#1a1a1a", margin: 0 }}>Outils de pilotage</h1>
        </div>

        {/* ══════════════════════ CAISSE EN TEMPS RÉEL ══════════════════════ */}
        <section style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase", color: ACCENT }}>
              CAISSE EN TEMPS RÉEL
            </p>
            {lastUpdate && (
              <span style={{ fontSize: 10, color: "#bbb" }}>Màj {lastUpdate}</span>
            )}
          </div>

          {loading ? (
            <div style={{ padding: "24px 0", textAlign: "center", fontSize: 13, color: "#bbb" }}>Chargement…</div>
          ) : (
            <>
              {/* KPI row */}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                <div style={kpiCard}>
                  <div style={kpiLabel}>CA du jour</div>
                  <div style={kpiValue}>{caJour ? fmtEuroInt(caJour.totalSales) : "—"}</div>
                </div>
                <div style={kpiCard}>
                  <div style={kpiLabel}>Couverts</div>
                  <div style={kpiValue}>{caJour ? caJour.guestsNumber : "—"}</div>
                </div>
                <div style={kpiCard}>
                  <div style={kpiLabel}>CA semaine</div>
                  <div style={kpiValue}>{caSemaine ? fmtEuroInt(caSemaine.totalSales) : "—"}</div>
                </div>
                <div style={kpiCard}>
                  <div style={kpiLabel}>Ticket moyen</div>
                  <div style={kpiValue}>{caJour ? fmtEuro(caJour.ticketMoyen) : "—"}</div>
                </div>
              </div>

              {/* Bar chart — CA des 7 derniers jours */}
              {caSemaine && caSemaine.days.length > 0 && (
                <div style={{ background: "#fff", borderRadius: 12, padding: "16px 8px 8px", border: "1px solid #e8e0d6", marginBottom: 10 }}>
                  <p style={{ margin: "0 0 12px 12px", fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "#9a8f84" }}>
                    CA 7 derniers jours
                  </p>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={caSemaine.days} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0ebe3" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 11, fill: "#9a8f84" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tickFormatter={(v) => `${Math.round(v)}€`}
                        tick={{ fontSize: 10, fill: "#9a8f84" }}
                        axisLine={false}
                        tickLine={false}
                        width={48}
                      />
                      <Tooltip
                        formatter={(v) => [fmtEuro(Number(v ?? 0)), "CA"]}
                        contentStyle={{ borderRadius: 8, border: "1px solid #e8e0d6", fontSize: 12 }}
                        cursor={{ fill: "#f5f0e8" }}
                      />
                      <Bar dataKey="totalSales" fill={ACCENT} radius={[4, 4, 0, 0]} maxBarSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Top 10 produits */}
              {topProduits.length > 0 && (
                <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e8e0d6", overflow: "hidden" }}>
                  <div style={{ padding: "12px 16px 8px", borderBottom: "1px solid #f0ebe3" }}>
                    <p style={{ margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "#9a8f84" }}>
                      Top 10 produits · 7 jours
                    </p>
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: "#faf7f2" }}>
                        <th style={{ textAlign: "left", padding: "8px 16px", fontWeight: 700, color: "#9a8f84", fontSize: 11 }}>Produit</th>
                        <th style={{ textAlign: "right", padding: "8px 12px", fontWeight: 700, color: "#9a8f84", fontSize: 11 }}>Qté</th>
                        <th style={{ textAlign: "right", padding: "8px 16px", fontWeight: 700, color: "#9a8f84", fontSize: 11 }}>CA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topProduits.map((p, i) => (
                        <tr key={i} style={{ borderTop: "1px solid #f0ebe3" }}>
                          <td style={{ padding: "9px 16px", color: "#2f3a33", fontWeight: i < 3 ? 700 : 400 }}>{p.name}</td>
                          <td style={{ padding: "9px 12px", textAlign: "right", color: "#6f6a61", fontVariantNumeric: "tabular-nums" }}>{p.quantity}</td>
                          <td style={{ padding: "9px 16px", textAlign: "right", fontWeight: 600, color: i === 0 ? ACCENT : "#2f3a33", fontVariantNumeric: "tabular-nums" }}>{fmtEuro(p.totalSales)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </section>

        {/* ══════════════════════ OUTILS ══════════════════════ */}
        <p style={{ margin: "0 0 12px", fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#9a8f84" }}>
          OUTILS
        </p>
        <div style={{ display: "grid", gap: 10 }}>
          {SECTIONS.map((s) => (
            <Link key={s.href} href={s.href} style={{ textDecoration: "none", color: "inherit" }}>
              <div style={{
                background: "#fff",
                borderRadius: 14,
                borderLeft: `4px solid ${s.color}`,
                padding: "16px 20px",
                cursor: "pointer",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase", color: s.color, fontFamily: "var(--font-oswald), 'Oswald', sans-serif" }}>{s.label}</p>
                    <p style={{ margin: "3px 0 0", fontSize: 12, color: "#999" }}>{s.sub}</p>
                  </div>
                  <span style={{
                    display: "inline-block", padding: "7px 14px", borderRadius: 10,
                    background: s.color, color: "#fff", fontSize: 12, fontWeight: 700,
                    whiteSpace: "nowrap", flexShrink: 0,
                  }}>
                    Ouvrir →
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>

      </main>
    </>
    </RequireRole>
  );
}
