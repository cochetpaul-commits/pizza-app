"use client";

import { useState, useEffect, useMemo } from "react";
import { NavBar } from "@/components/NavBar";
import { supabase } from "@/lib/supabaseClient";
import { fetchPriceAlerts, PriceAlert } from "@/lib/priceAlerts";
import Link from "next/link";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";

type Period = "7j" | "30j" | "3m" | "12m";

const PERIODS: { key: Period; label: string; days: number }[] = [
  { key: "7j",  label: "7 j",    days: 7   },
  { key: "30j", label: "30 j",   days: 30  },
  { key: "3m",  label: "3 mois", days: 90  },
  { key: "12m", label: "12 mois", days: 365 },
];

function sinceDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function fmtPct(v: number) {
  return `${v > 0 ? "+" : ""}${(v * 100).toFixed(1)} %`;
}

function fmtPrice(v: number, unit: string) {
  return `${v.toFixed(2)} €/${unit}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export default function VariationsPrixPage() {
  const [allAlerts, setAllAlerts] = useState<PriceAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [period, setPeriod] = useState<Period>("30j");
  const [filterSupplier, setFilterSupplier] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [threshold, setThreshold] = useState(5); // %
  const [sortBy, setSortBy] = useState<"date" | "pct" | "price">("date");
  const [showOnlyUp, setShowOnlyUp] = useState(false);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Non connecté");
        // Fetch 12 months of data for the chart, then filter client-side
        const alerts = await fetchPriceAlerts(supabase, user.id, 0.01, sinceDate(365));
        setAllAlerts(alerts);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  // Derived: supplier list from alerts
  const suppliers = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of allAlerts) map.set(a.supplier_id, a.supplier_name);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [allAlerts]);

  // Derived: category list from alerts
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const a of allAlerts) if (a.ingredient_category) set.add(a.ingredient_category);
    return [...set].sort();
  }, [allAlerts]);

  // Derived: period cutoff date
  const periodDays = PERIODS.find(p => p.key === period)?.days ?? 30;
  const periodCutoff = useMemo(() => sinceDate(periodDays), [periodDays]);

  // Filtered list (for KPIs + list)
  const filtered = useMemo(() => {
    return allAlerts.filter(a => {
      if (a.new_offer_date < periodCutoff) return false;
      if (Math.abs(a.change_pct) < threshold / 100) return false;
      if (filterSupplier !== "all" && a.supplier_id !== filterSupplier) return false;
      if (filterCategory !== "all" && a.ingredient_category !== filterCategory) return false;
      if (showOnlyUp && a.direction !== "up") return false;
      return true;
    });
  }, [allAlerts, periodCutoff, threshold, filterSupplier, filterCategory, showOnlyUp]);

  // Sorted list
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sortBy === "date") return b.new_offer_date.localeCompare(a.new_offer_date);
      if (sortBy === "pct") return Math.abs(b.change_pct) - Math.abs(a.change_pct);
      if (sortBy === "price") return b.new_price - a.new_price;
      return 0;
    });
  }, [filtered, sortBy]);

  // KPIs
  const kpis = useMemo(() => {
    const hausses = filtered.filter(a => a.direction === "up");
    const baisses = filtered.filter(a => a.direction === "down");
    const avgPct = filtered.length
      ? filtered.reduce((s, a) => s + a.change_pct, 0) / filtered.length
      : 0;
    // top supplier by hausse count
    const supCount = new Map<string, number>();
    for (const a of hausses) supCount.set(a.supplier_name, (supCount.get(a.supplier_name) ?? 0) + 1);
    let topSupplier = "—";
    let topCount = 0;
    for (const [name, count] of supCount) {
      if (count > topCount) { topSupplier = name; topCount = count; }
    }
    return { hausses: hausses.length, baisses: baisses.length, avgPct, topSupplier, topCount };
  }, [filtered]);

  // Chart: 12 months, always from allAlerts filtered by supplier/category
  const chartData = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("fr-FR", { month: "short" });
      const monthAlerts = allAlerts.filter(a => {
        if (!a.new_offer_date.startsWith(key)) return false;
        if (Math.abs(a.change_pct) < threshold / 100) return false;
        if (filterSupplier !== "all" && a.supplier_id !== filterSupplier) return false;
        if (filterCategory !== "all" && a.ingredient_category !== filterCategory) return false;
        return true;
      });
      return {
        label,
        hausses: monthAlerts.filter(a => a.direction === "up").length,
        baisses: monthAlerts.filter(a => a.direction === "down").length,
      };
    });
  }, [allAlerts, threshold, filterSupplier, filterCategory]);

  const pillBtn = (active: boolean, color = "#8B1A1A") => ({
    padding: "5px 13px", borderRadius: 20, border: `1px solid ${active ? color : "rgba(217,199,182,0.95)"}`,
    background: active ? color : "rgba(255,255,255,0.38)", color: active ? "#fff" : "var(--text)",
    fontWeight: 700, fontSize: 13, cursor: "pointer" as const, transition: "all 120ms",
  });

  return (
    <>
      <NavBar
        backHref="/"
        right={
          <Link href="/alertes-prix" className="btn">
            Alertes
          </Link>
        }
      />
      <main className="container safe-bottom">
        <div style={{ marginBottom: 20 }}>
          <h1 className="h1">Variations de prix</h1>
          <p className="muted" style={{ marginTop: 4 }}>Pilotage des évolutions tarifaires fournisseurs</p>
        </div>

        {error && <div className="errorBox" style={{ marginBottom: 16 }}>{error}</div>}

        {/* ── Période ── */}
        <div className="card" style={{ marginBottom: 12, padding: "12px 14px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.6, letterSpacing: 0.5, marginBottom: 8, textTransform: "uppercase" as const }}>Période</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {PERIODS.map(p => (
              <button key={p.key} onClick={() => setPeriod(p.key)} style={pillBtn(period === p.key)}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Filtres ── */}
        <div className="card" style={{ marginBottom: 12, padding: "12px 14px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.6, letterSpacing: 0.5, marginBottom: 8, textTransform: "uppercase" as const }}>Filtres</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 4 }}>Fournisseur</div>
              <select className="input" style={{ height: 36, padding: "0 10px" }}
                value={filterSupplier} onChange={e => setFilterSupplier(e.target.value)}>
                <option value="all">Tous</option>
                {suppliers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 4 }}>Catégorie</div>
              <select className="input" style={{ height: 36, padding: "0 10px" }}
                value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
                <option value="all">Toutes</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Seuil min.</span>
              <input type="range" min={0} max={30} step={1} value={threshold}
                onChange={e => setThreshold(Number(e.target.value))}
                style={{ width: 100 }} />
              <span style={{ fontSize: 13, fontWeight: 700, minWidth: 36 }}>{threshold} %</span>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={showOnlyUp} onChange={e => setShowOnlyUp(e.target.checked)} />
              Hausses uniquement
            </label>
          </div>
        </div>

        {/* ── KPIs ── */}
        {loading ? (
          <div className="card" style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>Chargement…</div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
              <div className="card" style={{ padding: "12px 14px", textAlign: "center" }}>
                <div style={{ fontSize: 26, fontWeight: 900, color: "#DC2626", lineHeight: 1 }}>{kpis.hausses}</div>
                <div style={{ fontSize: 11, opacity: 0.6, marginTop: 3 }}>Hausses</div>
              </div>
              <div className="card" style={{ padding: "12px 14px", textAlign: "center" }}>
                <div style={{ fontSize: 26, fontWeight: 900, color: "#16A34A", lineHeight: 1 }}>{kpis.baisses}</div>
                <div style={{ fontSize: 11, opacity: 0.6, marginTop: 3 }}>Baisses</div>
              </div>
              <div className="card" style={{ padding: "12px 14px", textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: kpis.avgPct > 0 ? "#DC2626" : "#16A34A", lineHeight: 1 }}>
                  {kpis.avgPct === 0 ? "—" : fmtPct(kpis.avgPct)}
                </div>
                <div style={{ fontSize: 11, opacity: 0.6, marginTop: 3 }}>Moy. variation</div>
              </div>
              <div className="card" style={{ padding: "12px 14px", textAlign: "center" }}>
                <div style={{ fontSize: 13, fontWeight: 800, lineHeight: 1.2, color: "#8B1A1A" }}>{kpis.topSupplier}</div>
                {kpis.topCount > 0 && <div style={{ fontSize: 11, opacity: 0.6, marginTop: 3 }}>{kpis.topCount} hausse{kpis.topCount > 1 ? "s" : ""}</div>}
                <div style={{ fontSize: 10, opacity: 0.5, marginTop: 1 }}>Top fournisseur</div>
              </div>
            </div>

            {/* ── Chart 12 mois ── */}
            <div className="card" style={{ marginBottom: 12, padding: "16px 14px" }}>
              <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 14 }}>Évolution sur 12 mois</div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.07)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: 10, border: "1px solid rgba(217,199,182,0.95)", background: "#FAF7F2", fontSize: 13 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="hausses" name="Hausses" fill="#DC2626" radius={[4,4,0,0]} />
                  <Bar dataKey="baisses" name="Baisses" fill="#16A34A" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* ── Sort + count ── */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8, flexWrap: "wrap" }}>
              <div style={{ fontSize: 13, opacity: 0.7 }}>{sorted.length} variation{sorted.length > 1 ? "s" : ""}</div>
              <div style={{ display: "flex", gap: 6 }}>
                {(["date", "pct", "price"] as const).map(s => (
                  <button key={s} onClick={() => setSortBy(s)} style={pillBtn(sortBy === s, "#6B6257")}>
                    {s === "date" ? "Date" : s === "pct" ? "%" : "Prix"}
                  </button>
                ))}
              </div>
            </div>

            {/* ── List ── */}
            {sorted.length === 0 ? (
              <div className="card" style={{ textAlign: "center", padding: 32, color: "var(--muted)" }}>
                Aucune variation sur cette période avec ce seuil.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {sorted.map((a, i) => (
                  <Link key={i} href={`/ingredients/${a.ingredient_id}?from=variations-prix`} style={{ textDecoration: "none", color: "inherit" }}>
                    <div className="card" style={{ padding: "12px 14px", cursor: "pointer" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 2 }}>{a.ingredient_name}</div>
                          <div style={{ fontSize: 12, opacity: 0.65 }}>
                            {a.supplier_name}
                            {a.ingredient_category ? ` · ${a.ingredient_category}` : ""}
                            {" · "}{fmtDate(a.new_offer_date)}
                          </div>
                          <div style={{ fontSize: 12, opacity: 0.55, marginTop: 2 }}>
                            {fmtPrice(a.old_price, a.unit)} → {fmtPrice(a.new_price, a.unit)}
                          </div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                          <span style={{
                            display: "inline-flex", alignItems: "center", gap: 4,
                            padding: "4px 10px", borderRadius: 999,
                            background: a.direction === "up" ? "rgba(220,38,38,0.10)" : "rgba(22,163,74,0.10)",
                            color: a.direction === "up" ? "#DC2626" : "#16A34A",
                            border: `1px solid ${a.direction === "up" ? "rgba(220,38,38,0.25)" : "rgba(22,163,74,0.25)"}`,
                            fontWeight: 800, fontSize: 14,
                          }}>
                            {a.direction === "up" ? "↑" : "↓"} {fmtPct(a.change_pct)}
                          </span>
                          {a.aberrant && (
                            <span style={{ fontSize: 10, fontWeight: 700, color: "#92400E", background: "rgba(234,88,12,0.1)", padding: "2px 6px", borderRadius: 6, border: "1px solid rgba(234,88,12,0.25)" }}>
                              Aberrant
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
