"use client";

import { useState, useEffect, useMemo } from "react";
import { NavBar } from "@/components/NavBar";
import { RequireRole } from "@/components/RequireRole";
import { supabase } from "@/lib/supabaseClient";
import { fetchPriceAlerts, PriceAlert, ALERT_THRESHOLD } from "@/lib/priceAlerts";
import Link from "next/link";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";

// ─── Snooze helpers ───────────────────────────────────────────────────────────

const SNOOZE_KEY = "alertes-prix:snoozed";

function getSnoozed(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(SNOOZE_KEY) ?? "{}"); } catch { return {}; }
}
function saveSnoozed(map: Record<string, string>) {
  localStorage.setItem(SNOOZE_KEY, JSON.stringify(map));
}
function snoozeKey(a: PriceAlert) { return `${a.ingredient_id}__${a.supplier_id}`; }

// ─── Period helpers ───────────────────────────────────────────────────────────

type Period = "7j" | "30j" | "3m" | "12m";
const PERIODS: { key: Period; label: string; days: number }[] = [
  { key: "7j",  label: "7 j",     days: 7   },
  { key: "30j", label: "30 j",    days: 30  },
  { key: "3m",  label: "3 mois",  days: 90  },
  { key: "12m", label: "12 mois", days: 365 },
];
function sinceDate(days: number) {
  const d = new Date(); d.setDate(d.getDate() - days); return d.toISOString();
}

// ─── Format helpers ───────────────────────────────────────────────────────────

function fmtPct(v: number) { return `${v > 0 ? "+" : ""}${(v * 100).toFixed(1)} %`; }
function fmtPrice(v: number, unit: string) { return `${v.toFixed(2)} €/${unit}`; }
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}
function fmtDateLong(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

// ─── Shared card ─────────────────────────────────────────────────────────────

function AlertCard({
  alert: a, snoozed = false, onSnooze, onUnsnooze,
}: {
  alert: PriceAlert; snoozed?: boolean;
  onSnooze?: () => void; onUnsnooze?: () => void;
}) {
  const isUp = a.direction === "up";
  const accentColor = snoozed ? "#ddd6c8" : a.aberrant ? "#EA580C" : isUp ? "#DC2626" : "#16A34A";
  const badgeBg = isUp ? "rgba(220,38,38,0.10)" : "rgba(22,163,74,0.10)";
  const badgeColor = isUp ? "#DC2626" : "#16A34A";
  const badgeBorder = isUp ? "rgba(220,38,38,0.25)" : "rgba(22,163,74,0.25)";
  return (
    <div className="card" style={{
      padding: "12px 14px", marginBottom: 8,
      opacity: snoozed ? 0.55 : 1,
      borderLeft: `4px solid ${accentColor}`,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <Link href={`/ingredients/${a.ingredient_id}`} style={{ textDecoration: "none", color: "inherit" }}>
            <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 2 }}>{a.ingredient_name}</div>
          </Link>
          <div style={{ fontSize: 12, opacity: 0.65, marginBottom: 4 }}>
            {a.supplier_name}
            {a.ingredient_category ? ` · ${a.ingredient_category}` : ""}
            {" · "}{fmtDateLong(a.new_offer_date)}
          </div>
          <div style={{ fontSize: 12, opacity: 0.55 }}>
            {fmtPrice(a.old_price, a.unit)} → <strong>{fmtPrice(a.new_price, a.unit)}</strong>
          </div>
          {a.aberrant && !snoozed && (
            <span style={{
              display: "inline-block", marginTop: 4, fontSize: 11, fontWeight: 700,
              background: "rgba(234,88,12,0.10)", color: "#EA580C",
              border: "1px solid rgba(234,88,12,0.25)", borderRadius: 6, padding: "2px 7px",
            }}>
              Variation aberrante (&gt;50 %)
            </span>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: "4px 10px", borderRadius: 999,
            background: badgeBg, color: badgeColor,
            border: `1px solid ${badgeBorder}`, fontWeight: 800, fontSize: 14,
          }}>
            {isUp ? "↑" : "↓"} {fmtPct(a.change_pct)}
          </span>
          {!snoozed && onSnooze && (
            <button onClick={onSnooze} className="btn"
              style={{ fontSize: 11, height: 26, padding: "0 8px" }} title="Mettre en veille 30 jours">
              Veille 30 j
            </button>
          )}
          {snoozed && onUnsnooze && (
            <button onClick={onUnsnooze} className="btn" style={{ fontSize: 11, height: 26, padding: "0 8px" }}>
              Réactiver
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function VariationsPrixPage() {
  const [tab, setTab] = useState<"variations" | "alertes">("variations");

  // Shared loading
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Variations: 12 months, 1% threshold
  const [allAlerts, setAllAlerts] = useState<PriceAlert[]>([]);

  // Alertes: all-time, 5% threshold
  const [alertsData, setAlertsData] = useState<PriceAlert[]>([]);

  // Snooze
  const [snoozed, setSnoozedState] = useState<Record<string, string>>({});
  const [showSnoozed, setShowSnoozed] = useState(false);

  // Variations filters
  const [period, setPeriod] = useState<Period>("30j");
  const [filterSupplier, setFilterSupplier] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [threshold, setThreshold] = useState(5);
  const [sortBy, setSortBy] = useState<"date" | "pct" | "price">("date");
  const [showOnlyUp, setShowOnlyUp] = useState(false);

  useEffect(() => {
    setSnoozedState(getSnoozed());
    const run = async () => {
      setLoading(true); setError(null);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Non connecté");
        const [var12m, alerts] = await Promise.all([
          fetchPriceAlerts(supabase, user.id, 0.01, sinceDate(365)),
          fetchPriceAlerts(supabase, user.id, ALERT_THRESHOLD),
        ]);
        setAllAlerts(var12m);
        setAlertsData(alerts);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  // ── Snooze handlers ──
  function snooze(a: PriceAlert) {
    const until = new Date(); until.setDate(until.getDate() + 30);
    const next = { ...snoozed, [snoozeKey(a)]: until.toISOString() };
    saveSnoozed(next); setSnoozedState(next);
  }
  function unsnooze(a: PriceAlert) {
    const next = { ...snoozed }; delete next[snoozeKey(a)];
    saveSnoozed(next); setSnoozedState(next);
  }

  // ── Variations derived ──
  const suppliers = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of allAlerts) map.set(a.supplier_id, a.supplier_name);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [allAlerts]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const a of allAlerts) if (a.ingredient_category) set.add(a.ingredient_category);
    return [...set].sort();
  }, [allAlerts]);

  const periodDays = PERIODS.find(p => p.key === period)?.days ?? 30;
  const periodCutoff = useMemo(() => sinceDate(periodDays), [periodDays]);

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

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sortBy === "date") return b.new_offer_date.localeCompare(a.new_offer_date);
      if (sortBy === "pct") return Math.abs(b.change_pct) - Math.abs(a.change_pct);
      if (sortBy === "price") return b.new_price - a.new_price;
      return 0;
    });
  }, [filtered, sortBy]);

  const kpis = useMemo(() => {
    const hausses = filtered.filter(a => a.direction === "up");
    const baisses = filtered.filter(a => a.direction === "down");
    const avgPct = filtered.length ? filtered.reduce((s, a) => s + a.change_pct, 0) / filtered.length : 0;
    const supCount = new Map<string, number>();
    for (const a of hausses) supCount.set(a.supplier_name, (supCount.get(a.supplier_name) ?? 0) + 1);
    let topSupplier = "—"; let topCount = 0;
    for (const [name, count] of supCount) { if (count > topCount) { topSupplier = name; topCount = count; } }
    return { hausses: hausses.length, baisses: baisses.length, avgPct, topSupplier, topCount };
  }, [filtered]);

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

  // ── Alertes derived ──
  const now = new Date().toISOString();
  const { activeUp, activeDown, snoozedList } = useMemo(() => {
    const activeUp: PriceAlert[] = [];
    const activeDown: PriceAlert[] = [];
    const snoozedList: PriceAlert[] = [];
    for (const a of alertsData) {
      const until = snoozed[snoozeKey(a)];
      if (until && until > now) snoozedList.push(a);
      else if (a.direction === "up") activeUp.push(a);
      else activeDown.push(a);
    }
    return { activeUp, activeDown, snoozedList };
  }, [alertsData, snoozed, now]);

  const totalActiveAlerts = activeUp.length + activeDown.length;

  // ── Styles ──
  const pillBtn = (active: boolean, color = "#7a4a2a") => ({
    padding: "5px 13px", borderRadius: 20, border: `1px solid ${active ? color : "rgba(217,199,182,0.95)"}`,
    background: active ? color : "rgba(255,255,255,0.38)", color: active ? "#fff" : "var(--text)" as const,
    fontWeight: 700, fontSize: 13, cursor: "pointer" as const, transition: "all 120ms",
  });

  return (
    <RequireRole allowedRoles={["admin", "direction"]}>
    <>
      <NavBar backHref="/" />
      <main className="container safe-bottom">

        <div style={{ marginBottom: 16 }}>
          <h1 className="h1">Variations & Alertes</h1>
          <p className="muted" style={{ marginTop: 4 }}>Pilotage des évolutions tarifaires fournisseurs</p>
        </div>

        {error && <div className="errorBox" style={{ marginBottom: 16 }}>{error}</div>}

        {/* ── Tabs ── */}
        <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
          {[
            { key: "variations" as const, label: "Variations" },
            { key: "alertes" as const, label: "Alertes", badge: totalActiveAlerts },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "7px 16px", borderRadius: 10, fontSize: 13, fontWeight: 700,
                border: `1.5px solid ${tab === t.key ? "#7a4a2a" : "rgba(217,199,182,0.95)"}`,
                background: tab === t.key ? "#7a4a2a" : "rgba(255,255,255,0.55)",
                color: tab === t.key ? "#fff" : "var(--text)",
                cursor: "pointer",
              }}
            >
              {t.label}
              {t.badge != null && t.badge > 0 && (
                <span style={{
                  fontSize: 11, fontWeight: 900, lineHeight: 1,
                  background: tab === t.key ? "rgba(255,255,255,0.25)" : "rgba(220,38,38,0.12)",
                  color: tab === t.key ? "#fff" : "#DC2626",
                  border: tab === t.key ? "1px solid rgba(255,255,255,0.35)" : "1px solid rgba(220,38,38,0.25)",
                  borderRadius: 999, padding: "2px 7px",
                }}>
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ════════════════ TAB VARIATIONS ════════════════ */}
        {tab === "variations" && (
          <>
            {/* Période */}
            <div className="card" style={{ marginBottom: 12, padding: "12px 14px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.6, letterSpacing: 0.5, marginBottom: 8, textTransform: "uppercase" }}>Période</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {PERIODS.map(p => (
                  <button key={p.key} onClick={() => setPeriod(p.key)} style={pillBtn(period === p.key)}>{p.label}</button>
                ))}
              </div>
            </div>

            {/* Filtres */}
            <div className="card" style={{ marginBottom: 12, padding: "12px 14px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.6, letterSpacing: 0.5, marginBottom: 8, textTransform: "uppercase" }}>Filtres</div>
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
                    onChange={e => setThreshold(Number(e.target.value))} style={{ width: 100 }} />
                  <span style={{ fontSize: 13, fontWeight: 700, minWidth: 36 }}>{threshold} %</span>
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                  <input type="checkbox" checked={showOnlyUp} onChange={e => setShowOnlyUp(e.target.checked)} />
                  Hausses uniquement
                </label>
              </div>
            </div>

            {loading ? (
              <div className="card" style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>Chargement…</div>
            ) : (
              <>
                {/* KPIs */}
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
                    <div style={{ fontSize: 13, fontWeight: 800, lineHeight: 1.2, color: "#7a4a2a" }}>{kpis.topSupplier}</div>
                    {kpis.topCount > 0 && <div style={{ fontSize: 11, opacity: 0.6, marginTop: 3 }}>{kpis.topCount} hausse{kpis.topCount > 1 ? "s" : ""}</div>}
                    <div style={{ fontSize: 10, opacity: 0.5, marginTop: 1 }}>Top fournisseur</div>
                  </div>
                </div>

                {/* Chart */}
                <div className="card" style={{ marginBottom: 12, padding: "16px 14px" }}>
                  <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 14 }}>Évolution sur 12 mois</div>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.07)" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid rgba(217,199,182,0.95)", background: "#FAF7F2", fontSize: 13 }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="hausses" name="Hausses" fill="#DC2626" radius={[4,4,0,0]} />
                      <Bar dataKey="baisses" name="Baisses" fill="#16A34A" radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Sort + list */}
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
                                {a.supplier_name}{a.ingredient_category ? ` · ${a.ingredient_category}` : ""}{" · "}{fmtDate(a.new_offer_date)}
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
          </>
        )}

        {/* ════════════════ TAB ALERTES ════════════════ */}
        {tab === "alertes" && (
          <>
            {loading ? (
              <div className="card" style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>Chargement…</div>
            ) : (
              <>
                {totalActiveAlerts === 0 && snoozedList.length === 0 ? (
                  <div className="card" style={{ textAlign: "center", padding: 40 }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
                    <div style={{ fontWeight: 800 }}>Aucune alerte active</div>
                    <p className="muted" style={{ marginTop: 6 }}>Tous les prix sont stables.</p>
                  </div>
                ) : (
                  <>
                    {/* Hausses */}
                    {activeUp.length > 0 && (
                      <div style={{ marginBottom: 20 }}>
                        <div style={{
                          fontSize: 11, fontWeight: 900, color: "#DC2626", letterSpacing: 1,
                          textTransform: "uppercase", marginBottom: 10,
                          borderBottom: "2px solid rgba(220,38,38,0.2)", paddingBottom: 6,
                          display: "flex", justifyContent: "space-between",
                        }}>
                          <span>Hausses <span style={{ fontWeight: 500, opacity: 0.7 }}>({activeUp.length})</span></span>
                          <span style={{ fontWeight: 500, opacity: 0.5, textTransform: "none" as const }}>≥ {Math.round(ALERT_THRESHOLD * 100)} %</span>
                        </div>
                        {activeUp.map((a, i) => (
                          <AlertCard key={i} alert={a} onSnooze={() => snooze(a)} />
                        ))}
                      </div>
                    )}

                    {/* Baisses */}
                    {activeDown.length > 0 && (
                      <div style={{ marginBottom: 20 }}>
                        <div style={{
                          fontSize: 11, fontWeight: 900, color: "#16A34A", letterSpacing: 1,
                          textTransform: "uppercase", marginBottom: 10,
                          borderBottom: "2px solid rgba(22,163,74,0.2)", paddingBottom: 6,
                          display: "flex", justifyContent: "space-between",
                        }}>
                          <span>Baisses <span style={{ fontWeight: 500, opacity: 0.7 }}>({activeDown.length})</span></span>
                          <span style={{ fontWeight: 500, opacity: 0.5, textTransform: "none" as const }}>≥ {Math.round(ALERT_THRESHOLD * 100)} %</span>
                        </div>
                        {activeDown.map((a, i) => (
                          <AlertCard key={i} alert={a} onSnooze={() => snooze(a)} />
                        ))}
                      </div>
                    )}

                    {/* Snoozed */}
                    {snoozedList.length > 0 && (
                      <div style={{ marginTop: 4 }}>
                        <button
                          onClick={() => setShowSnoozed(v => !v)}
                          style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 13, fontWeight: 700, opacity: 0.55, display: "flex", alignItems: "center", gap: 6 }}
                        >
                          {showSnoozed ? "▾" : "▸"} {snoozedList.length} alerte{snoozedList.length > 1 ? "s" : ""} en veille (30 j)
                        </button>
                        {showSnoozed && (
                          <div style={{ marginTop: 10 }}>
                            {snoozedList.map((a, i) => (
                              <AlertCard key={i} alert={a} snoozed onUnsnooze={() => unsnooze(a)} />
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </>
        )}

      </main>
    </>
    </RequireRole>
  );
}
