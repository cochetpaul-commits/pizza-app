"use client";

import { useEffect, useMemo, useState } from "react";
import { NavBar } from "@/components/NavBar";
import { RequireRole } from "@/components/RequireRole";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, LineChart, Line, Legend, ReferenceLine,
} from "recharts";
import { fetchApi } from "@/lib/fetchApi";

// ── Types ─────────────────────────────────────────────────────────────────

type PnL = {
  totalCA: number;
  totalCOGS: number;
  margeBrute: number;
  foodCostPct: number | null;
  matchRate: number;
  matchedProducts: number;
  totalProducts: number;
};

type CategoryProfit = {
  name: string;
  ca: number;
  cogs: number;
  margin: number;
  foodCostPct: number | null;
  matchRate: number;
};

type ProductProfit = {
  name: string;
  category: string;
  recipeCategory: string;
  ca: number;
  quantity: number;
  unitCost: number | null;
  totalCost: number | null;
  margin: number | null;
  foodCostPct: number | null;
  matched: boolean;
};

type WeeklyTrend = {
  week: string;
  ca: number;
  cogs: number;
  foodCostPct: number | null;
};

type FinancesData = {
  mode: string;
  periodLabel: string;
  pnl: PnL;
  categories: CategoryProfit[];
  products: ProductProfit[];
  weeklyTrend: WeeklyTrend[];
};

// ── ISO Week helpers ──────────────────────────────────────────────────────

function dateToISOWeek(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getFullYear()}-${String(week).padStart(2, "0")}`;
}

function isoWeekToMonday(weekStr: string): Date {
  const [y, w] = weekStr.split("-").map(Number);
  const jan4 = new Date(y, 0, 4);
  const dow = jan4.getDay() || 7;
  const week1Mon = new Date(y, 0, 4 - dow + 1);
  const monday = new Date(week1Mon);
  monday.setDate(week1Mon.getDate() + (w - 1) * 7);
  return monday;
}

function getCurrentWeek(): string {
  const parisDate = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
  return dateToISOWeek(parisDate);
}

function getCurrentMonth(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" }).slice(0, 7);
}

function shiftWeek(weekStr: string, offset: number): string {
  const monday = isoWeekToMonday(weekStr);
  monday.setDate(monday.getDate() + offset * 7);
  const dateStr = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
  return dateToISOWeek(dateStr);
}

function shiftMonth(monthStr: string, offset: number): string {
  const [y, m] = monthStr.split("-").map(Number);
  const d = new Date(y, m - 1 + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function getWeekLabel(weekStr: string): string {
  const monday = isoWeekToMonday(weekStr);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const monDay = monday.getDate();
  const sunDay = sunday.getDate();
  if (monday.getMonth() === sunday.getMonth()) {
    const monthYear = sunday.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
    return `${monDay} au ${sunDay} ${monthYear}`;
  }
  const monMonth = monday.toLocaleDateString("fr-FR", { month: "long" });
  const sunMonthYear = sunday.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  return `${monDay} ${monMonth} au ${sunDay} ${sunMonthYear}`;
}

function getMonthLabel(monthStr: string): string {
  return new Date(monthStr + "-15").toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
    .replace(/^\w/, (c) => c.toUpperCase());
}

// ── Helpers ──────────────────────────────────────────────────────────────

const ACCENT = "#D4775A";
const GREEN = "#4a6741";
const RED = "#8B1A1A";
const GOLD = "#d4a24e";

function fmtEuro(v: number) { return v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €"; }
function fmtEuroInt(v: number) { return v.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " €"; }

function foodCostColor(pct: number | null): string {
  if (pct === null) return "#999";
  if (pct <= 30) return GREEN;
  if (pct <= 35) return GOLD;
  return RED;
}

function getCatColor(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("pizz")) return "#8B1A1A";
  if (lower.includes("cucin")) return "#4a6741";
  if (lower.includes("dessert") || lower.includes("dolci")) return "#D4775A";
  if (lower.includes("cocktail")) return "#7b5ea7";
  if (lower.includes("boisson")) return "#3B7A7A";
  return "#999";
}

// ── Styles ───────────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: 16,
  border: "1.5px solid #ddd6c8",
  padding: "16px",
};

const sectionLabel: React.CSSProperties = {
  margin: "0 0 12px",
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: 2,
  textTransform: "uppercase",
  color: "#999",
  fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
};

const kpiLabel: React.CSSProperties = {
  margin: "0 0 6px", fontSize: 12, fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase", color: "#999",
  fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
};

const kpiValue: React.CSSProperties = {
  margin: 0, fontSize: 28, fontWeight: 700, color: "#1a1a1a", lineHeight: 1,
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
};

// ── Period Selector ──────────────────────────────────────────────────────

function PeriodSelector({ mode, weekStr, monthStr, currentWeek, currentMonth, onPrev, onNext, onModeChange }: {
  mode: "week" | "month";
  weekStr: string;
  monthStr: string;
  currentWeek: string;
  currentMonth: string;
  onPrev: () => void;
  onNext: () => void;
  onModeChange: (m: "week" | "month") => void;
}) {
  const isNow = mode === "week" ? weekStr === currentWeek : monthStr === currentMonth;
  const label = mode === "week" ? getWeekLabel(weekStr) : getMonthLabel(monthStr);

  return (
    <div style={{ marginBottom: 16 }}>
      {/* Mode toggle */}
      <div style={{ display: "flex", gap: 0, marginBottom: 8 }}>
        {(["week", "month"] as const).map((m) => (
          <button key={m} onClick={() => onModeChange(m)} style={{
            flex: 1, padding: "8px 0", fontSize: 12, fontWeight: 700, letterSpacing: 1.5,
            textTransform: "uppercase", border: "1.5px solid #ddd6c8", cursor: "pointer",
            background: mode === m ? "#1a1a1a" : "#fff",
            color: mode === m ? "#f2ede4" : "#999",
            borderRadius: m === "week" ? "10px 0 0 10px" : "0 10px 10px 0",
            fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
          }}>
            {m === "week" ? "Semaine" : "Mois"}
          </button>
        ))}
      </div>

      {/* Navigation */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "#fff", border: "1px solid #ddd6c8", borderRadius: 12,
        padding: "10px 16px", gap: 8,
      }}>
        <button onClick={onPrev} style={{
          background: "none", border: "none", fontSize: 18, color: ACCENT,
          cursor: "pointer", padding: "0 4px", fontWeight: 700, lineHeight: 1,
        }}>&#8592;</button>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span style={{
            fontSize: 13, fontWeight: 600, color: "#1a1a1a",
            fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {label}
          </span>
          {isNow && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6,
              background: GREEN, color: "#fff", whiteSpace: "nowrap", flexShrink: 0,
            }}>
              En cours
            </span>
          )}
        </div>
        <button onClick={onNext} disabled={isNow} style={{
          background: "none", border: "none", fontSize: 18,
          color: isNow ? "#ddd6c8" : ACCENT,
          cursor: isNow ? "not-allowed" : "pointer",
          padding: "0 4px", fontWeight: 700, lineHeight: 1,
        }}>&#8594;</button>
      </div>
    </div>
  );
}

// ── Tooltips ─────────────────────────────────────────────────────────────

function TrendTooltip({ active, payload, label }: {
  active?: boolean; payload?: Array<{ value: number; dataKey: string; color: string }>; label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#fff", border: "1px solid #ddd6c8", borderRadius: 10, padding: "10px 14px", fontSize: 13, minWidth: 120 }}>
      <p style={{ margin: 0, fontWeight: 700, color: "#1a1a1a" }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ margin: "4px 0 0", color: p.color, fontWeight: 600 }}>
          {p.dataKey === "foodCostPct" ? `${p.value?.toFixed(1)}%` : fmtEuroInt(p.value)}
        </p>
      ))}
    </div>
  );
}

function CatBarTooltip({ active, payload, label }: {
  active?: boolean; payload?: Array<{ value: number; dataKey: string; name: string }>; label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#fff", border: "1px solid #ddd6c8", borderRadius: 10, padding: "10px 14px", fontSize: 13, minWidth: 140 }}>
      <p style={{ margin: 0, fontWeight: 700, color: "#1a1a1a" }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ margin: "4px 0 0", color: p.dataKey === "ca" ? ACCENT : "#999", fontWeight: 600 }}>
          {p.dataKey === "ca" ? "CA" : "Coût"} : {fmtEuroInt(p.value)}
        </p>
      ))}
    </div>
  );
}

// ── Sort options for product table ──────────────────────────────────────

type SortKey = "ca" | "foodCostPct" | "margin" | "quantity";

// ── Component ─────────────────────────────────────────────────────────────

export default function FinancesPage() {
  const currentWeek = useMemo(() => getCurrentWeek(), []);
  const currentMonth = useMemo(() => getCurrentMonth(), []);

  const [mode, setMode] = useState<"week" | "month">("week");
  const [weekStr, setWeekStr] = useState(currentWeek);
  const [monthStr, setMonthStr] = useState(currentMonth);
  const [data, setData] = useState<FinancesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("ca");
  const [sortAsc, setSortAsc] = useState(false);
  const [showUnmatched, setShowUnmatched] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const params = mode === "week" ? `mode=week&week=${weekStr}` : `mode=month&month=${monthStr}`;
      const res = await fetchApi(`/api/finances/stats?${params}`);
      if (!cancelled && res.ok) setData(await res.json());
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [mode, weekStr, monthStr]);

  function goPrev() {
    if (mode === "week") setWeekStr((w) => shiftWeek(w, -1));
    else setMonthStr((m) => shiftMonth(m, -1));
  }

  function goNext() {
    if (mode === "week") {
      setWeekStr((w) => {
        const next = shiftWeek(w, 1);
        return next <= currentWeek ? next : w;
      });
    } else {
      setMonthStr((m) => {
        const next = shiftMonth(m, 1);
        return next <= currentMonth ? next : m;
      });
    }
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(false); }
  }

  const sortedProducts = useMemo(() => {
    if (!data) return [];
    let prods = showUnmatched ? data.products : data.products.filter((p) => p.matched);
    prods = [...prods].sort((a, b) => {
      const av = a[sortKey] ?? (sortAsc ? Infinity : -Infinity);
      const bv = b[sortKey] ?? (sortAsc ? Infinity : -Infinity);
      return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
    return prods;
  }, [data, sortKey, sortAsc, showUnmatched]);

  const d = data;

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <>
        <NavBar backHref="/pilotage" backLabel="Pilotage" />
        <main style={{ maxWidth: 720, margin: "0 auto", padding: "20px 16px 56px", boxSizing: "border-box" }}>

          {/* Title */}
          <h1 style={{
            margin: "0 0 20px", fontSize: 20, fontWeight: 800, letterSpacing: 2,
            textTransform: "uppercase", color: "#1a1a1a",
            fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
          }}>
            Contr&ocirc;le financier
          </h1>

          {/* Period selector */}
          <PeriodSelector
            mode={mode} weekStr={weekStr} monthStr={monthStr}
            currentWeek={currentWeek} currentMonth={currentMonth}
            onPrev={goPrev} onNext={goNext} onModeChange={setMode}
          />

          {loading ? (
            <div style={{ textAlign: "center", padding: "48px 0", fontSize: 13, color: "#bbb" }}>Chargement&#8230;</div>
          ) : d ? (
            <>
              {/* ── BLOC 1 : P&L SIMPLIFIÉ ───────────────────────────── */}
              <p style={sectionLabel}>COMPTE DE R&Eacute;SULTAT SIMPLIFI&Eacute;</p>

              <div style={{ ...card, marginBottom: 20, padding: "20px" }}>
                {/* CA */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 12, borderBottom: "1px solid #f0ebe3" }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>Chiffre d&apos;affaires</span>
                  <span style={{ fontSize: 22, fontWeight: 700, color: "#1a1a1a", fontFamily: "var(--font-oswald), 'Oswald', sans-serif" }}>
                    {fmtEuroInt(d.pnl.totalCA)}
                  </span>
                </div>

                {/* COGS */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid #f0ebe3" }}>
                  <div>
                    <span style={{ fontSize: 14, fontWeight: 600, color: RED }}>- Co&ucirc;t mati&egrave;res</span>
                    {d.pnl.foodCostPct !== null && (
                      <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, padding: "2px 6px", borderRadius: 5, background: `${foodCostColor(d.pnl.foodCostPct)}14`, color: foodCostColor(d.pnl.foodCostPct) }}>
                        {d.pnl.foodCostPct.toFixed(1)}%
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 22, fontWeight: 700, color: RED, fontFamily: "var(--font-oswald), 'Oswald', sans-serif" }}>
                    -{fmtEuroInt(d.pnl.totalCOGS)}
                  </span>
                </div>

                {/* Marge brute */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 12 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: GREEN }}>= Marge brute</span>
                  <span style={{ fontSize: 26, fontWeight: 800, color: GREEN, fontFamily: "var(--font-oswald), 'Oswald', sans-serif" }}>
                    {fmtEuroInt(d.pnl.margeBrute)}
                  </span>
                </div>

                {/* Match rate */}
                <div style={{ marginTop: 12, padding: "8px 12px", background: "#f8f5f0", borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: "#999" }}>Couverture recettes</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: d.pnl.matchRate >= 70 ? GREEN : GOLD }}>
                    {d.pnl.matchRate}% ({d.pnl.matchedProducts}/{d.pnl.totalProducts})
                  </span>
                </div>
              </div>

              {/* ── BLOC 2 : KPIs FINANCIERS ─────────────────────────── */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 20 }}>
                <div style={{ ...card, borderLeft: `4px solid ${foodCostColor(d.pnl.foodCostPct)}` }}>
                  <p style={kpiLabel}>Food Cost</p>
                  <p style={{ ...kpiValue, color: foodCostColor(d.pnl.foodCostPct) }}>
                    {d.pnl.foodCostPct !== null ? `${d.pnl.foodCostPct.toFixed(1)}%` : "—"}
                  </p>
                </div>
                <div style={{ ...card, borderLeft: `4px solid ${GREEN}` }}>
                  <p style={kpiLabel}>Marge brute</p>
                  <p style={kpiValue}>{fmtEuroInt(d.pnl.margeBrute)}</p>
                </div>
                <div style={card}>
                  <p style={kpiLabel}>CA / Jour moy.</p>
                  <p style={kpiValue}>
                    {mode === "week"
                      ? fmtEuroInt(d.pnl.totalCA / 7)
                      : fmtEuroInt(d.pnl.totalCA / 30)}
                  </p>
                </div>
              </div>

              {/* ── BLOC 3 : TENDANCE FOOD COST ──────────────────────── */}
              {d.weeklyTrend.length > 1 && (
                <>
                  <p style={sectionLabel}>&Eacute;VOLUTION FOOD COST</p>
                  <div style={{ ...card, marginBottom: 20, padding: "16px 8px 12px" }}>
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={d.weeklyTrend} margin={{ top: 5, right: 16, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0ebe3" vertical={false} />
                        <XAxis dataKey="week" tick={{ fontSize: 11, fill: "#9a8f84" }} axisLine={false} tickLine={false} />
                        <YAxis
                          tickFormatter={(v) => `${v}%`}
                          tick={{ fontSize: 10, fill: "#9a8f84" }} axisLine={false} tickLine={false} width={40}
                          domain={["dataMin - 2", "dataMax + 2"]}
                        />
                        <Tooltip content={<TrendTooltip />} />
                        <Line
                          type="monotone" dataKey="foodCostPct" stroke={ACCENT}
                          strokeWidth={2.5} dot={{ r: 4, fill: ACCENT }} name="Food cost %"
                          connectNulls
                        />
                        <ReferenceLine y={30} stroke={GREEN} strokeWidth={1} strokeDasharray="6 4" label={{ value: "30%", position: "right", fontSize: 10, fill: GREEN }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </>
              )}

              {/* ── BLOC 4 : RENTABILITÉ PAR CATÉGORIE ───────────────── */}
              {d.categories.length > 0 && (
                <>
                  <p style={sectionLabel}>RENTABILIT&Eacute; PAR CAT&Eacute;GORIE</p>
                  <div style={{ ...card, marginBottom: 20, padding: "16px 8px 12px" }}>
                    <ResponsiveContainer width="100%" height={Math.max(200, d.categories.length * 50)}>
                      <BarChart data={d.categories} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0ebe3" horizontal={false} />
                        <XAxis type="number" tickFormatter={(v) => `${Math.round(v)}€`} tick={{ fontSize: 10, fill: "#9a8f84" }} axisLine={false} tickLine={false} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#1a1a1a", fontWeight: 600 }} axisLine={false} tickLine={false} width={80} />
                        <Tooltip content={<CatBarTooltip />} cursor={{ fill: "#f5f0e8" }} />
                        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                        <Bar dataKey="ca" name="CA" fill={ACCENT} radius={[0, 4, 4, 0]} maxBarSize={24} />
                        <Bar dataKey="cogs" name="Coût" fill="#c9b99a" radius={[0, 4, 4, 0]} maxBarSize={24} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Category cards */}
                  <div style={{ display: "grid", gap: 8, marginBottom: 20 }}>
                    {d.categories.map((cat) => {
                      const color = getCatColor(cat.name);
                      return (
                        <div key={cat.name} style={{ ...card, padding: "12px 16px", borderLeft: `4px solid ${color}` }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div>
                              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color, fontFamily: "var(--font-oswald), 'Oswald', sans-serif" }}>
                                {cat.name}
                              </span>
                              {cat.foodCostPct !== null && (
                                <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 5, background: `${foodCostColor(cat.foodCostPct)}14`, color: foodCostColor(cat.foodCostPct) }}>
                                  FC {cat.foodCostPct.toFixed(1)}%
                                </span>
                              )}
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <span style={{ fontSize: 16, fontWeight: 700, color: "#1a1a1a", fontFamily: "var(--font-oswald), 'Oswald', sans-serif" }}>
                                {fmtEuroInt(cat.ca)}
                              </span>
                              <span style={{ fontSize: 12, color: GREEN, fontWeight: 700, marginLeft: 8, fontFamily: "var(--font-oswald), 'Oswald', sans-serif" }}>
                                +{fmtEuroInt(cat.margin)}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {/* ── BLOC 5 : RENTABILITÉ PAR PRODUIT ─────────────────── */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <p style={{ ...sectionLabel, margin: 0 }}>RENTABILIT&Eacute; PAR PRODUIT</p>
                <label style={{ fontSize: 11, color: "#999", display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                  <input
                    type="checkbox" checked={showUnmatched}
                    onChange={(e) => setShowUnmatched(e.target.checked)}
                    style={{ accentColor: ACCENT }}
                  />
                  Non chiffr&eacute;s
                </label>
              </div>

              {/* Sort buttons */}
              <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
                {([
                  { key: "ca" as SortKey, label: "CA" },
                  { key: "foodCostPct" as SortKey, label: "Food Cost" },
                  { key: "margin" as SortKey, label: "Marge" },
                  { key: "quantity" as SortKey, label: "Qt\u00e9" },
                ] as const).map((btn) => (
                  <button key={btn.key} onClick={() => handleSort(btn.key)} style={{
                    padding: "5px 10px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
                    border: `1.5px solid ${sortKey === btn.key ? "#1a1a1a" : "#ddd6c8"}`,
                    borderRadius: 8, cursor: "pointer",
                    background: sortKey === btn.key ? "#1a1a1a" : "#fff",
                    color: sortKey === btn.key ? "#f2ede4" : "#999",
                    fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
                  }}>
                    {btn.label} {sortKey === btn.key ? (sortAsc ? "↑" : "↓") : ""}
                  </button>
                ))}
              </div>

              {/* Product list */}
              <div style={{ display: "grid", gap: 6, marginBottom: 24 }}>
                {sortedProducts.slice(0, 30).map((p, i) => (
                  <div key={i} style={{
                    ...card, padding: "10px 14px",
                    opacity: p.matched ? 1 : 0.5,
                    borderLeft: p.matched ? `3px solid ${foodCostColor(p.foodCostPct)}` : "3px solid #ddd6c8",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#1a1a1a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {p.name}
                        </p>
                        <div style={{ display: "flex", gap: 8, marginTop: 4, fontSize: 11, color: "#999" }}>
                          <span>{p.quantity}x</span>
                          {p.unitCost !== null && <span>Co&ucirc;t {fmtEuro(p.unitCost)}/u</span>}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
                        <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#1a1a1a", fontFamily: "var(--font-oswald), 'Oswald', sans-serif" }}>
                          {fmtEuroInt(p.ca)}
                        </p>
                        {p.matched && p.margin !== null && p.foodCostPct !== null && (
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 2 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: GREEN }}>
                              +{fmtEuroInt(p.margin)}
                            </span>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 5px", borderRadius: 4, background: `${foodCostColor(p.foodCostPct)}14`, color: foodCostColor(p.foodCostPct) }}>
                              {p.foodCostPct.toFixed(1)}%
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {sortedProducts.length > 30 && (
                  <p style={{ textAlign: "center", fontSize: 12, color: "#bbb", margin: "8px 0" }}>
                    +{sortedProducts.length - 30} produits
                  </p>
                )}
              </div>
            </>
          ) : (
            <div style={{ textAlign: "center", padding: "32px 0", fontSize: 13, color: "#bbb" }}>Donn&eacute;es indisponibles</div>
          )}

        </main>
      </>
    </RequireRole>
  );
}
