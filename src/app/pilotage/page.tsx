"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { NavBar } from "@/components/NavBar";
import { RequireRole } from "@/components/RequireRole";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell, PieChart, Pie,
} from "recharts";

// ── Types ─────────────────────────────────────────────────────────────────

type DayData = { date: string; label: string; totalSales: number; guestsNumber: number; ticketMoyen: number };
type TopProduct = { name: string; quantity: number; totalSales: number; isNew: boolean; pctChange: number | null };
type CategoryData = { name: string; ca: number; pct: number };
type StatsData = {
  semaine: { totalSales: number; guestsNumber: number; ticketMoyen: number; bestDay: { label: string; totalSales: number }; days: DayData[] };
  semainePrec: { totalSales: number; guestsNumber: number; ticketMoyen: number };
  topSemaine: TopProduct[];
  categories: CategoryData[];
  insights: {
    meilleurJour: { label: string; avgCA: number } | null;
    produitEnHausse: { name: string; pctChange: number } | null;
    caVsMoyenne: { label: string; pct: number } | null;
  };
};
type MeteoData = { temp: number; description: string; emoji: string; tonight: { temp: number; description: string; emoji: string } | null };

type ServiceSlot = { ca: number; couverts: number };
type DayDetail = {
  date: string;
  totalSales: number;
  guestsNumber: number;
  ticketMoyen: number;
  midi: ServiceSlot;
  soir: ServiceSlot;
  surPlace: ServiceSlot;
  aEmporter: ServiceSlot;
  topProducts: Array<{ name: string; quantity: number; totalSales: number }>;
  categories: CategoryData[];
};

// ── Helpers ───────────────────────────────────────────────────────────────

const ACCENT = "#D4775A";
const GREEN = "#4a6741";
const RED = "#8B1A1A";

function fmtEuro(v: number) { return v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €"; }
function fmtEuroInt(v: number) { return v.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " €"; }

function delta(current: number, previous: number): string | null {
  if (!previous) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  return (pct >= 0 ? "↑ +" : "↓ ") + pct + "%";
}
function deltaColor(current: number, previous: number): string {
  return current >= previous ? GREEN : RED;
}

function todayLabel(): string {
  return new Date().toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris",
  }).replace(/^\w/, (c) => c.toUpperCase());
}

function formatFullDate(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  }).replace(/^\w/, (c) => c.toUpperCase());
}

// ── Category color mapping ───────────────────────────────────────────────

function getCatColor(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("pizz")) return "#8B1A1A";
  if (lower.includes("cucin") || lower.includes("cuisine") || lower.includes("plat")) return "#4a6741";
  if (lower.includes("dessert") || lower.includes("dolci")) return "#D4775A";
  if (lower.includes("cocktail")) return "#7b5ea7";
  if (lower.includes("boisson") || lower.includes("vin") || lower.includes("bière") || lower.includes("soft") || lower.includes("drink")) return "#3B7A7A";
  return "#999";
}

function getCatLabel(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("pizz")) return "PIZZE";
  if (lower.includes("cucin") || lower.includes("cuisine") || lower.includes("plat")) return "CUCINA";
  if (lower.includes("dessert") || lower.includes("dolci")) return "DESSERTS";
  if (lower.includes("cocktail")) return "COCKTAILS";
  if (lower.includes("boisson") || lower.includes("vin") || lower.includes("bière") || lower.includes("soft") || lower.includes("drink")) return "BOISSONS";
  return name.toUpperCase();
}

// ── Custom Tooltip ────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: {
  active?: boolean; payload?: Array<{ payload: DayData }>; label?: string;
}) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div style={{ background: "#fff", border: "1px solid #ddd6c8", borderRadius: 10, padding: "10px 14px", fontSize: 12, minWidth: 120 }}>
      <p style={{ margin: 0, fontWeight: 700, color: "#1a1a1a" }}>{label}</p>
      {d.totalSales > 0 ? (
        <>
          <p style={{ margin: "4px 0 0", color: ACCENT, fontWeight: 700 }}>{fmtEuroInt(d.totalSales)}</p>
          {d.guestsNumber > 0 && <p style={{ margin: "2px 0 0", color: "#888" }}>{d.guestsNumber} couverts</p>}
          {d.ticketMoyen > 0 && <p style={{ margin: "2px 0 0", color: "#888" }}>Ticket moy. {fmtEuro(d.ticketMoyen)}</p>}
        </>
      ) : (
        <p style={{ margin: "4px 0 0", color: "#bbb" }}>Fermé</p>
      )}
    </div>
  );
}

// ── Day Detail Drawer ─────────────────────────────────────────────────────

function DayDrawer({ detail, loading, onClose }: { detail: DayDetail | null; loading: boolean; onClose: () => void }) {
  const hasSurPlaceData = (detail?.surPlace.ca ?? 0) > 0 || (detail?.aEmporter.ca ?? 0) > 0;

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 200,
      }} />
      {/* Panel */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        maxHeight: "85vh",
        background: "#f2ede4",
        borderRadius: "20px 20px 0 0",
        padding: "20px 20px 32px",
        zIndex: 201,
        overflowY: "auto",
        animation: "slideUp 0.25s ease",
        WebkitOverflowScrolling: "touch",
      }}>
        {/* Close */}
        <button onClick={onClose} style={{
          position: "absolute", top: 14, right: 16,
          background: "none", border: "none", fontSize: 22, fontWeight: 700,
          color: "#999", cursor: "pointer", lineHeight: 1, padding: 4,
        }}>×</button>

        {loading || !detail ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#bbb", fontSize: 13 }}>Chargement…</div>
        ) : (
          <>
            {/* Title */}
            <p style={{
              margin: "0 0 16px", fontSize: 16,
              fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
              fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "#1a1a1a",
            }}>
              {formatFullDate(detail.date)}
            </p>

            {/* KPIs */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
              {[
                { label: "CA", value: fmtEuroInt(detail.totalSales) },
                { label: "COUVERTS", value: String(detail.guestsNumber) },
                { label: "TICKET MOY.", value: fmtEuro(detail.ticketMoyen) },
              ].map((kpi) => (
                <div key={kpi.label} style={{ background: "#fff", borderRadius: 12, padding: "12px 10px", textAlign: "center", border: "1px solid #ddd6c8" }}>
                  <p style={{ margin: "0 0 4px", fontSize: 9, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "#999" }}>{kpi.label}</p>
                  <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: ACCENT, lineHeight: 1, fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif" }}>
                    {kpi.value}
                  </p>
                </div>
              ))}
            </div>

            {/* Midi / Soir */}
            {(detail.midi.ca > 0 || detail.soir.ca > 0) && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                {/* Midi */}
                <div style={{ background: "#fff", borderRadius: 12, padding: "14px 12px", border: "1px solid #ddd6c8" }}>
                  <p style={{ margin: "0 0 8px", fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#999" }}>MIDI</p>
                  <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: ACCENT, lineHeight: 1, fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif" }}>
                    {fmtEuroInt(detail.midi.ca)}
                  </p>
                  <p style={{ margin: "4px 0 0", fontSize: 11, color: "#888", fontWeight: 600 }}>{detail.midi.couverts} couverts</p>
                </div>
                {/* Soir */}
                <div style={{ background: "#1a1a1a", borderRadius: 12, padding: "14px 12px" }}>
                  <p style={{ margin: "0 0 8px", fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#666" }}>SOIR</p>
                  <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#f2ede4", lineHeight: 1, fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif" }}>
                    {fmtEuroInt(detail.soir.ca)}
                  </p>
                  <p style={{ margin: "4px 0 0", fontSize: 11, color: "#888", fontWeight: 600 }}>{detail.soir.couverts} couverts</p>
                </div>
              </div>
            )}

            {/* Sur place / À emporter */}
            {hasSurPlaceData && (
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16, background: "#fff", borderRadius: 12, padding: "12px 16px", border: "1px solid #ddd6c8" }}>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: "0 0 6px", fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#999" }}>RÉPARTITION</p>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>
                    Sur place <strong style={{ color: ACCENT }}>{fmtEuroInt(detail.surPlace.ca)}</strong>
                    <span style={{ color: "#ccc", margin: "0 6px" }}>·</span>
                    À emporter <strong style={{ color: "#c9b99a" }}>{fmtEuroInt(detail.aEmporter.ca)}</strong>
                  </p>
                  <p style={{ margin: "2px 0 0", fontSize: 11, color: "#888" }}>
                    {detail.surPlace.couverts} + {detail.aEmporter.couverts} couverts
                  </p>
                </div>
                {detail.surPlace.ca > 0 && detail.aEmporter.ca > 0 && (
                  <PieChart width={64} height={64}>
                    <Pie
                      data={[
                        { name: "Sur place", value: detail.surPlace.ca },
                        { name: "À emporter", value: detail.aEmporter.ca },
                      ]}
                      cx={32} cy={32}
                      innerRadius={16} outerRadius={28}
                      dataKey="value"
                      stroke="none"
                      startAngle={90} endAngle={-270}
                    >
                      <Cell fill={ACCENT} />
                      <Cell fill="#c9b99a" />
                    </Pie>
                  </PieChart>
                )}
              </div>
            )}

            {/* Top 5 produits */}
            {detail.topProducts.length > 0 && (
              <>
                <p style={{ margin: "0 0 10px", fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#999" }}>TOP 5 PRODUITS</p>
                <div style={{ display: "grid", gap: 8, marginBottom: 8 }}>
                  {detail.topProducts.map((p, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "#fff", borderRadius: 10, border: "1px solid #ddd6c8" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                        <span style={{ fontSize: 10, fontWeight: 800, color: i === 0 ? RED : "#ccc", flexShrink: 0 }}>#{i + 1}</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#1a1a1a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                      </div>
                      <div style={{ flexShrink: 0, marginLeft: 8, textAlign: "right" }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: ACCENT }}>{fmtEuroInt(p.totalSales)}</span>
                        <span style={{ fontSize: 10, color: "#bbb", marginLeft: 4 }}>{p.quantity}x</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: 16,
  border: "1.5px solid #ddd6c8",
  padding: "16px",
};

const sectionLabel: React.CSSProperties = {
  margin: "0 0 12px",
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: 2,
  textTransform: "uppercase",
  color: "#999",
};

const kpiLabel: React.CSSProperties = {
  margin: "0 0 6px", fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "#999",
};

const kpiValue: React.CSSProperties = {
  margin: 0, fontSize: 28, fontWeight: 700, color: "#1a1a1a", lineHeight: 1,
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
};

const SECTIONS = [
  { href: "/mercuriale", label: "MERCURIALE", sub: "Prix fournisseurs · Export PDF", color: "#D4775A" },
  { href: "/epicerie", label: "ÉPICERIE", sub: "Prix de vente · Export CSV", color: "#D4775A" },
  { href: "/variations-prix", label: "VARIATIONS & ALERTES", sub: "Historique · Hausses & baisses · Veille 30 j", color: ACCENT },
];

// ── Component ─────────────────────────────────────────────────────────────

export default function PilotagePage() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [meteo, setMeteo] = useState<MeteoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState("");

  // Day drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dayDetail, setDayDetail] = useState<DayDetail | null>(null);
  const [dayLoading, setDayLoading] = useState(false);

  const loadAll = useCallback(async () => {
    const [s, m] = await Promise.all([
      fetch("/api/popina/stats").then((r) => r.ok ? r.json() : null),
      fetch("/api/meteo").then((r) => r.ok ? r.json() : null),
    ]);
    if (s) setStats(s);
    if (m) setMeteo(m);
    setLastUpdate(new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }));
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadAll();
    const iv = setInterval(() => { void loadAll(); }, 10 * 60 * 1000);
    return () => clearInterval(iv);
  }, [loadAll]);

  async function handleBarClick(day: DayData) {
    if (day.totalSales === 0) return;
    setDrawerOpen(true);
    setDayDetail(null);
    setDayLoading(true);
    try {
      const res = await fetch(`/api/popina/ca-jour?date=${day.date}`);
      if (res.ok) setDayDetail(await res.json());
    } finally {
      setDayLoading(false);
    }
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setDayDetail(null);
  }

  const s = stats;

  return (
    <RequireRole allowedRoles={["admin", "direction"]}>
      <>
        <NavBar />
        <main style={{ maxWidth: 720, margin: "0 auto", padding: "20px 16px 56px", boxSizing: "border-box" }}>

          {/* ── BLOC 1 : BANDEAU HAUT ────────────────────────────── */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            flexWrap: "wrap", gap: 8, padding: "12px 16px",
            background: "#fff", borderRadius: 16, border: "1.5px solid #ddd6c8",
            marginBottom: 16,
          }}>
            <div>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#1a1a1a" }}>{todayLabel()}</p>
              {lastUpdate && <p style={{ margin: 0, fontSize: 10, color: "#bbb", marginTop: 1 }}>Màj {lastUpdate}</p>}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              {meteo ? (
                <>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#444" }}>
                    {meteo.emoji} {meteo.temp}° <span style={{ fontWeight: 500, color: "#888", fontSize: 12 }}>{meteo.description}</span>
                  </span>
                  {meteo.tonight && (
                    <span style={{ fontSize: 12, color: "#999" }}>
                      Ce soir {meteo.tonight.emoji} {meteo.tonight.temp}°
                      <span style={{ marginLeft: 4, color: "#bbb" }}>{meteo.tonight.description}</span>
                    </span>
                  )}
                </>
              ) : (
                <span style={{ fontSize: 12, color: "#ccc" }}>Météo…</span>
              )}
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign: "center", padding: "48px 0", fontSize: 13, color: "#bbb" }}>Chargement…</div>
          ) : s ? (
            <>
              {/* ── BLOC 2 : CHIFFRES CLÉS ───────────────────────────── */}
              <p style={sectionLabel}>CHIFFRES CLÉS · 7 DERNIERS JOURS</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 20 }}>

                <div style={card}>
                  <p style={kpiLabel}>CA semaine</p>
                  <p style={kpiValue}>{fmtEuroInt(s.semaine.totalSales)}</p>
                  {delta(s.semaine.totalSales, s.semainePrec.totalSales) && (
                    <p style={{ margin: "6px 0 0", fontSize: 12, fontWeight: 600, fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", color: deltaColor(s.semaine.totalSales, s.semainePrec.totalSales) }}>
                      {delta(s.semaine.totalSales, s.semainePrec.totalSales)}
                    </p>
                  )}
                </div>

                <div style={card}>
                  <p style={kpiLabel}>Couverts</p>
                  <p style={kpiValue}>{s.semaine.guestsNumber}</p>
                  {delta(s.semaine.guestsNumber, s.semainePrec.guestsNumber) && (
                    <p style={{ margin: "6px 0 0", fontSize: 12, fontWeight: 600, fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", color: deltaColor(s.semaine.guestsNumber, s.semainePrec.guestsNumber) }}>
                      {delta(s.semaine.guestsNumber, s.semainePrec.guestsNumber)}
                    </p>
                  )}
                </div>

                <div style={card}>
                  <p style={kpiLabel}>Ticket moyen</p>
                  <p style={kpiValue}>{fmtEuro(s.semaine.ticketMoyen)}</p>
                  {delta(s.semaine.ticketMoyen, s.semainePrec.ticketMoyen) && (
                    <p style={{ margin: "6px 0 0", fontSize: 12, fontWeight: 600, fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", color: deltaColor(s.semaine.ticketMoyen, s.semainePrec.ticketMoyen) }}>
                      {delta(s.semaine.ticketMoyen, s.semainePrec.ticketMoyen)}
                    </p>
                  )}
                </div>

                <div style={card}>
                  <p style={kpiLabel}>Meilleur jour</p>
                  <p style={kpiValue}>{s.semaine.bestDay.label}</p>
                  <p style={{ margin: "6px 0 0", fontSize: 12, fontWeight: 700, color: "#888" }}>
                    {fmtEuroInt(s.semaine.bestDay.totalSales)}
                  </p>
                </div>

              </div>

              {/* ── BLOC 3 : GRAPHE + TOP PRODUITS ───────────────────── */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, marginBottom: 20 }}>

                {/* Graphe — cliquable */}
                <div style={{ ...card, padding: "16px 8px 12px" }}>
                  <p style={{ ...sectionLabel, margin: "0 0 4px 12px" }}>CA 7 DERNIERS JOURS</p>
                  <p style={{ margin: "0 0 12px 12px", fontSize: 10, color: "#bbb" }}>Clique sur une barre pour le détail</p>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={s.semaine.days} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0ebe3" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9a8f84" }} axisLine={false} tickLine={false} />
                      <YAxis
                        tickFormatter={(v) => `${Math.round(Number(v ?? 0))}€`}
                        tick={{ fontSize: 10, fill: "#9a8f84" }} axisLine={false} tickLine={false} width={48}
                      />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f5f0e8" }} />
                      <Bar
                        dataKey="totalSales"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={42}
                        cursor="pointer"
                        onClick={(_: unknown, index: number) => {
                          const d = s!.semaine.days[index];
                          if (d) handleBarClick(d);
                        }}
                      >
                        {s.semaine.days.map((d, i) => (
                          <Cell key={`c-${i}`} fill={d.totalSales === 0 ? "#ddd6c8" : RED} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Top produits */}
                <div style={card}>
                  <p style={{ ...sectionLabel, margin: "0 0 12px" }}>TOP 5 PRODUITS · SEMAINE</p>
                  {s.topSemaine.length === 0 ? (
                    <p style={{ fontSize: 12, color: "#bbb", margin: 0 }}>Aucune donnée</p>
                  ) : (
                    <div style={{ display: "grid", gap: 12 }}>
                      {s.topSemaine.map((p, i) => {
                        const maxSales = s.topSemaine[0]?.totalSales ?? 1;
                        return (
                          <div key={i}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                                <span style={{ fontSize: 10, fontWeight: 800, color: i === 0 ? ACCENT : "#bbb", flexShrink: 0 }}>#{i + 1}</span>
                                <span style={{ fontSize: 12, fontWeight: i < 3 ? 700 : 500, color: "#1a1a1a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                                {p.isNew && (
                                  <span style={{ fontSize: 9, fontWeight: 800, padding: "1px 5px", borderRadius: 5, background: "#d1fae5", color: "#065f46", flexShrink: 0 }}>↑ Nouveau</span>
                                )}
                                {!p.isNew && p.pctChange !== null && Math.abs(p.pctChange) >= 5 && (
                                  <span style={{ fontSize: 9, fontWeight: 800, padding: "1px 5px", borderRadius: 5, flexShrink: 0,
                                    background: p.pctChange > 0 ? "#dcfce7" : "#fee2e2",
                                    color: p.pctChange > 0 ? "#166534" : "#991b1b" }}>
                                    {p.pctChange > 0 ? "+" : ""}{p.pctChange}%
                                  </span>
                                )}
                              </div>
                              <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 8 }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: ACCENT }}>{fmtEuroInt(p.totalSales)}</span>
                                <span style={{ fontSize: 10, color: "#bbb", marginLeft: 4 }}>{p.quantity}x</span>
                              </div>
                            </div>
                            <div style={{ height: 4, background: "#f0ebe3", borderRadius: 2 }}>
                              <div style={{ width: `${Math.round((p.totalSales / maxSales) * 100)}%`, height: "100%", background: i === 0 ? RED : "#c9b99a", borderRadius: 2, transition: "width 0.5s" }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

              </div>

              {/* ── BLOC 3b : RÉPARTITION PAR CATÉGORIE ─────────────── */}
              {s.categories.length > 0 && (
                <div style={{ ...card, marginBottom: 20 }}>
                  <p style={{ ...sectionLabel, margin: "0 0 14px" }}>RÉPARTITION PAR CATÉGORIE · SEMAINE</p>
                  <div style={{ display: "grid", gap: 12 }}>
                    {s.categories.map((cat, i) => {
                      const color = getCatColor(cat.name);
                      const label = getCatLabel(cat.name);
                      return (
                        <div key={i}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color, fontFamily: "var(--font-oswald), 'Oswald', sans-serif" }}>
                              {label}
                            </span>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: "#1a1a1a" }}>{fmtEuroInt(cat.ca)}</span>
                              <span style={{
                                fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 5,
                                background: `${color}14`, color,
                              }}>
                                {cat.pct}%
                              </span>
                            </div>
                          </div>
                          <div style={{ height: 6, background: "#f0ebe3", borderRadius: 3 }}>
                            <div style={{ width: `${cat.pct}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.5s" }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── BLOC 4 : INSIGHTS ────────────────────────────────── */}
              {(s.insights.meilleurJour || s.insights.produitEnHausse || s.insights.caVsMoyenne) && (
                <div style={{ ...card, marginBottom: 24 }}>
                  <p style={{ ...sectionLabel, margin: "0 0 12px" }}>INSIGHTS AUTOMATIQUES</p>
                  <div style={{ display: "grid", gap: 10 }}>
                    {s.insights.meilleurJour && (
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", background: "#1a1a1a", borderRadius: 10 }}>
                        <span style={{ fontSize: 16, flexShrink: 0 }}>📈</span>
                        <p style={{ margin: 0, fontSize: 13, color: "#c9b99a", lineHeight: 1.4, fontStyle: "italic" as const }}>
                          <strong>{s.insights.meilleurJour.label}</strong> est ton meilleur jour
                          {" — "}moyenne <strong>{fmtEuroInt(s.insights.meilleurJour.avgCA)}</strong> sur 30 jours
                        </p>
                      </div>
                    )}
                    {s.insights.produitEnHausse && (
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", background: "#1a1a1a", borderRadius: 10 }}>
                        <span style={{ fontSize: 16, flexShrink: 0 }}>🍕</span>
                        <p style={{ margin: 0, fontSize: 13, color: "#c9b99a", lineHeight: 1.4, fontStyle: "italic" as const }}>
                          <strong>&ldquo;{s.insights.produitEnHausse.name}&rdquo;</strong> est en hausse de{" "}
                          <strong style={{ color: GREEN }}>+{s.insights.produitEnHausse.pctChange}%</strong> vs la semaine dernière
                        </p>
                      </div>
                    )}
                    {s.insights.caVsMoyenne && (
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", background: "#1a1a1a", borderRadius: 10 }}>
                        <span style={{ fontSize: 16, flexShrink: 0 }}>{s.insights.caVsMoyenne.pct >= 0 ? "📈" : "📉"}</span>
                        <p style={{ margin: 0, fontSize: 13, color: "#c9b99a", lineHeight: 1.4, fontStyle: "italic" as const }}>
                          Ce <strong>{s.insights.caVsMoyenne.label}</strong> est à{" "}
                          <strong style={{ color: s.insights.caVsMoyenne.pct >= 0 ? GREEN : RED }}>
                            {s.insights.caVsMoyenne.pct >= 0 ? "+" : ""}{s.insights.caVsMoyenne.pct}%
                          </strong>{" "}
                          vs ta moyenne du {s.insights.caVsMoyenne.label}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div style={{ textAlign: "center", padding: "32px 0", fontSize: 13, color: "#bbb" }}>Données indisponibles</div>
          )}

          {/* ── OUTILS ───────────────────────────────────────────────── */}
          <p style={sectionLabel}>OUTILS</p>
          <div style={{ display: "grid", gap: 10 }}>
            {SECTIONS.map((sec) => (
              <Link key={sec.href} href={sec.href} style={{ textDecoration: "none", color: "inherit" }}>
                <div style={{ background: "#fff", borderRadius: 14, borderLeft: `4px solid ${sec.color}`, padding: "16px 20px", cursor: "pointer" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <p style={{ margin: 0, fontSize: 12, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase", color: sec.color, fontFamily: "var(--font-oswald), 'Oswald', sans-serif" }}>{sec.label}</p>
                      <p style={{ margin: "3px 0 0", fontSize: 12, color: "#999" }}>{sec.sub}</p>
                    </div>
                    <span style={{ display: "inline-block", padding: "7px 14px", borderRadius: 10, background: sec.color, color: "#fff", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0 }}>
                      Ouvrir →
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>

        </main>

        {/* ── Day Detail Drawer ── */}
        {drawerOpen && <DayDrawer detail={dayDetail} loading={dayLoading} onClose={closeDrawer} />}
      </>
    </RequireRole>
  );
}
