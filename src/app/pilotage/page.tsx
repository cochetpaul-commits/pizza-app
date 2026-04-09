"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { RequireRole } from "@/components/RequireRole";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell, PieChart, Pie,
} from "recharts";
import { fetchApi } from "@/lib/fetchApi";
import { useEtablissement } from "@/lib/EtablissementContext";
import { supabase } from "@/lib/supabaseClient";
import { BottomSheet } from "@/components/layout/BottomSheet";
import { useRouter } from "next/navigation";

// ── Types ─────────────────────────────────────────────────────────────────

type DayData = { date: string; label: string; totalSales: number; guestsNumber: number; ticketMoyen: number };
type TopProduct = { name: string; quantity: number; totalSales: number; isNew: boolean; pctChange: number | null };
type CategoryData = { name: string; ca: number; pct: number; topProduct?: string | null };
type StatsData = {
  week: string;
  isCurrentWeek: boolean;
  activeDays: number;
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

type CostData = {
  week: string;
  totalCA: number;
  totalCOGS: number;
  foodCostPct: number | null;
  margeBrute: number;
  matchRate: number;
  matchedProducts: number;
  totalProducts: number;
  prev: {
    totalCA: number;
    totalCOGS: number;
    foodCostPct: number | null;
    margeBrute: number;
  };
};

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

// ── ISO Week helpers (client-side) ───────────────────────────────────────

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

function shiftWeek(weekStr: string, offset: number): string {
  const monday = isoWeekToMonday(weekStr);
  monday.setDate(monday.getDate() + offset * 7);
  const dateStr = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
  return dateToISOWeek(dateStr);
}

function getWeekLabel(weekStr: string): string {
  const monday = isoWeekToMonday(weekStr);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const monDay = monday.getDate();
  const sunDay = sunday.getDate();
  if (monday.getMonth() === sunday.getMonth()) {
    const monthYear = sunday.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
    return `Semaine du ${monDay} au ${sunDay} ${monthYear}`;
  }
  const monMonth = monday.toLocaleDateString("fr-FR", { month: "long" });
  const sunMonthYear = sunday.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  return `Semaine du ${monDay} ${monMonth} au ${sunDay} ${sunMonthYear}`;
}

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
    <div style={{ background: "#fff", border: "1px solid #ddd6c8", borderRadius: 10, padding: "10px 14px", fontSize: 14, minWidth: 120 }}>
      <p style={{ margin: 0, fontWeight: 700, color: "#1a1a1a" }}>{label}</p>
      {d.totalSales > 0 ? (
        <>
          <p style={{ margin: "4px 0 0", color: ACCENT, fontWeight: 700, fontFamily: "var(--font-oswald), 'Oswald', sans-serif" }}>{fmtEuroInt(d.totalSales)}</p>
          {d.guestsNumber > 0 && <p style={{ margin: "2px 0 0", color: "#888", fontSize: 13 }}>{d.guestsNumber} couverts</p>}
          {d.ticketMoyen > 0 && <p style={{ margin: "2px 0 0", color: "#888", fontSize: 13 }}>Ticket moy. {fmtEuro(d.ticketMoyen)}</p>}
        </>
      ) : (
        <p style={{ margin: "4px 0 0", color: "#bbb" }}>Fermé</p>
      )}
    </div>
  );
}

// ── Week Selector ─────────────────────────────────────────────────────────

function WeekSelector({ weekStr, currentWeek, onPrev, onNext }: {
  weekStr: string; currentWeek: string; onPrev: () => void; onNext: () => void;
}) {
  const isNow = weekStr === currentWeek;
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      background: "#fff", border: "1px solid #ddd6c8", borderRadius: 12,
      padding: "10px 16px", marginBottom: 16, gap: 8,
    }}>
      <button onClick={onPrev} style={{
        background: "none", border: "none", fontSize: 18, color: ACCENT,
        cursor: "pointer", padding: "0 4px", fontWeight: 700, lineHeight: 1,
      }}>←</button>
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <span style={{
          fontSize: 13, fontWeight: 600, color: "#1a1a1a",
          fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {getWeekLabel(weekStr)}
        </span>
        {isNow && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6,
            background: ACCENT, color: "#fff", whiteSpace: "nowrap", flexShrink: 0,
          }}>
            Cette semaine
          </span>
        )}
      </div>
      <button onClick={onNext} disabled={isNow} style={{
        background: "none", border: "none", fontSize: 18,
        color: isNow ? "#ddd6c8" : ACCENT,
        cursor: isNow ? "not-allowed" : "pointer",
        padding: "0 4px", fontWeight: 700, lineHeight: 1,
      }}>→</button>
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
                  <p style={{ margin: "0 0 4px", fontSize: 12, fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase", color: "#999", fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif" }}>{kpi.label}</p>
                  <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1a1a1a", lineHeight: 1, fontFamily: "var(--font-oswald), 'Oswald', sans-serif" }}>
                    {kpi.value}
                  </p>
                </div>
              ))}
            </div>

            {/* Midi / Soir */}
            {(detail.midi.ca > 0 || detail.soir.ca > 0) && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                <div style={{ background: "#fff", borderRadius: 12, padding: "14px 12px", border: "1px solid #ddd6c8" }}>
                  <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", color: "#999", fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif" }}>MIDI · 12H→15H</p>
                  <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#1a1a1a", lineHeight: 1, fontFamily: "var(--font-oswald), 'Oswald', sans-serif" }}>
                    {fmtEuroInt(detail.midi.ca)}
                  </p>
                  <p style={{ margin: "4px 0 0", fontSize: 13, color: "#888", fontWeight: 600 }}>{detail.midi.couverts} couverts</p>
                </div>
                <div style={{ background: "#1a1a1a", borderRadius: 12, padding: "14px 12px" }}>
                  <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", color: "#666", fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif" }}>SOIR · 19H→00H</p>
                  <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#f2ede4", lineHeight: 1, fontFamily: "var(--font-oswald), 'Oswald', sans-serif" }}>
                    {fmtEuroInt(detail.soir.ca)}
                  </p>
                  <p style={{ margin: "4px 0 0", fontSize: 13, color: "#888", fontWeight: 600 }}>{detail.soir.couverts} couverts</p>
                </div>
              </div>
            )}

            {/* Sur place / À emporter */}
            {hasSurPlaceData && (
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16, background: "#fff", borderRadius: 12, padding: "12px 16px", border: "1px solid #ddd6c8" }}>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", color: "#999", fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif" }}>RÉPARTITION</p>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>
                    Sur place <strong style={{ color: ACCENT, fontFamily: "var(--font-oswald), 'Oswald', sans-serif" }}>{fmtEuroInt(detail.surPlace.ca)}</strong>
                    <span style={{ color: "#ccc", margin: "0 6px" }}>·</span>
                    À emporter <strong style={{ color: "#c9b99a", fontFamily: "var(--font-oswald), 'Oswald', sans-serif" }}>{fmtEuroInt(detail.aEmporter.ca)}</strong>
                  </p>
                  <p style={{ margin: "2px 0 0", fontSize: 13, color: "#888" }}>
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
                <p style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", color: "#999", fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif" }}>TOP 5 PRODUITS</p>
                <div style={{ display: "grid", gap: 8, marginBottom: 8 }}>
                  {detail.topProducts.map((p, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "#fff", borderRadius: 10, border: "1px solid #ddd6c8" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                        <span style={{ fontSize: 10, fontWeight: 800, color: i === 0 ? RED : "#ccc", flexShrink: 0 }}>#{i + 1}</span>
                        <span style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                      </div>
                      <div style={{ flexShrink: 0, marginLeft: 8, textAlign: "right" }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: ACCENT, fontFamily: "var(--font-oswald), 'Oswald', sans-serif" }}>{fmtEuroInt(p.totalSales)}</span>
                        <span style={{ fontSize: 11, color: "#bbb", marginLeft: 4, fontFamily: "var(--font-oswald), 'Oswald', sans-serif" }}>{p.quantity}x</span>
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

const deltaStyle: React.CSSProperties = {
  margin: "6px 0 0", fontSize: 12, fontWeight: 600,
  fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
};


// ── Build StatsData from daily_sales (Kezia / Piccola Mia) ────────────────

const DAY_LABELS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

async function loadDailySalesStats(etabId: string, weekStr: string): Promise<StatsData | null> {
  const monday = isoWeekToMonday(weekStr);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  // Current week
  const { data: rows } = await supabase
    .from("daily_sales")
    .select("date, ca_ttc, couverts, panier_moyen, tickets, rayons, marge_total, taux_marque")
    .eq("etablissement_id", etabId)
    .gte("date", fmt(monday))
    .lte("date", fmt(sunday))
    .order("date");

  // Previous week
  const prevMon = new Date(monday);
  prevMon.setDate(prevMon.getDate() - 7);
  const prevSun = new Date(prevMon);
  prevSun.setDate(prevMon.getDate() + 6);

  const { data: prevRows } = await supabase
    .from("daily_sales")
    .select("date, ca_ttc, couverts, panier_moyen, tickets, marge_total, taux_marque")
    .eq("etablissement_id", etabId)
    .gte("date", fmt(prevMon))
    .lte("date", fmt(prevSun))
    .order("date");

  // Build days array (Mon-Sun)
  const days: DayData[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dateStr = fmt(d);
    const row = (rows ?? []).find(r => r.date === dateStr);
    // Use tickets instead of couverts (couverts is always 0 for épicerie/traiteur)
    const ticketCount = row?.tickets ?? 0;
    days.push({
      date: dateStr,
      label: DAY_LABELS[d.getDay()],
      totalSales: row?.ca_ttc ?? 0,
      guestsNumber: ticketCount,
      ticketMoyen: row?.panier_moyen ?? 0,
    });
  }

  const totalSales = days.reduce((s, d) => s + d.totalSales, 0);
  const totalTickets = days.reduce((s, d) => s + d.guestsNumber, 0);
  const activeDays = days.filter(d => d.totalSales > 0).length;
  const ticketMoyen = totalTickets > 0 ? totalSales / totalTickets : 0;
  const bestDay = days.reduce((best, d) => d.totalSales > best.totalSales ? d : best, days[0]);

  // Marge data
  const margeTotal = (rows ?? []).reduce((s, r) => s + (r.marge_total ?? 0), 0);
  // Weighted average taux de marque
  const tauxMarque = totalSales > 0
    ? (rows ?? []).reduce((s, r) => s + (r.taux_marque ?? 0) * (r.ca_ttc ?? 0), 0) / totalSales
    : 0;

  // Previous week totals
  const prevTotal = (prevRows ?? []).reduce((s, r) => s + (r.ca_ttc ?? 0), 0);
  const prevTickets = (prevRows ?? []).reduce((s, r) => s + (r.tickets ?? 0), 0);
  const prevTicketMoyen = prevTickets > 0 ? prevTotal / prevTickets : 0;
  const prevMarge = (prevRows ?? []).reduce((s, r) => s + (r.marge_total ?? 0), 0);
  const prevTauxMarque = prevTotal > 0
    ? (prevRows ?? []).reduce((s, r) => s + (r.taux_marque ?? 0) * (r.ca_ttc ?? 0), 0) / prevTotal
    : 0;

  // Categories from rayons JSON (if available)
  const categories: CategoryData[] = [];
  const rayonTotals: Record<string, number> = {};
  for (const row of (rows ?? [])) {
    if (row.rayons && typeof row.rayons === "object") {
      for (const [name, val] of Object.entries(row.rayons as Record<string, number>)) {
        rayonTotals[name] = (rayonTotals[name] ?? 0) + (val ?? 0);
      }
    }
  }
  const rayonTotal = Object.values(rayonTotals).reduce((s, v) => s + v, 0);
  if (rayonTotal > 0) {
    for (const [name, ca] of Object.entries(rayonTotals).sort((a, b) => b[1] - a[1])) {
      categories.push({ name, ca, pct: Math.round((ca / rayonTotal) * 100) });
    }
  }

  return {
    week: weekStr,
    isCurrentWeek: weekStr === getCurrentWeek(),
    activeDays,
    semaine: { totalSales, guestsNumber: totalTickets, ticketMoyen, bestDay: { label: bestDay.label, totalSales: bestDay.totalSales }, days },
    semainePrec: { totalSales: prevTotal, guestsNumber: prevTickets, ticketMoyen: prevTicketMoyen },
    topSemaine: [],
    categories,
    insights: { meilleurJour: null, produitEnHausse: null, caVsMoyenne: null },
    // Extra Kezia margin data (stored in unused fields via type assertion)
    _margeTotal: margeTotal,
    _tauxMarque: tauxMarque,
    _prevMarge: prevMarge,
    _prevTauxMarque: prevTauxMarque,
  } as StatsData;
}

// ── Component ─────────────────────────────────────────────────────────────

export default function PilotagePage() {
  const etab = useEtablissement();
  const currentWeek = useMemo(() => getCurrentWeek(), []);
  const [weekStr, setWeekStr] = useState(currentWeek);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [costs, setCosts] = useState<CostData | null>(null);
  const [meteo, setMeteo] = useState<MeteoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState("");

  const router = useRouter();

  // Day drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dayDetail, setDayDetail] = useState<DayDetail | null>(null);
  const [dayLoading, _setDayLoading] = useState(false);

  // Mobile action drawer
  const [actionDrawerOpen, setActionDrawerOpen] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  // Day-by-day navigation (mobile)
  const [selectedDay, setSelectedDay] = useState<string>(() => {
    return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
  });
  const [dayNavMode, setDayNavMode] = useState(false); // false=week, true=day

  const isPiccola = etab.current?.slug?.includes("piccola");
  const currentEtabId = etab.current?.id;

  const loadStats = useCallback(async (week: string) => {
    if (!currentEtabId) return;
    setLoading(true);
    const [s, m, c] = await Promise.all([
      loadDailySalesStats(currentEtabId, week),
      fetchApi("/api/meteo").then((r) => r.ok ? r.json() : null),
      fetchApi(`/api/pilotage/costs?week=${week}`).then((r) => r.ok ? r.json() : null),
    ]);
    if (s) setStats(s);
    if (m) setMeteo(m);
    if (c) setCosts(c);
    setLastUpdate(new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }));
    setLoading(false);
  }, [currentEtabId]);

  // Service-hours auto-refresh (15 min during midi 10-15h / soir 18-23h30)
  const [isService, setIsService] = useState(() => {
    const h = new Date().getHours();
    return (h >= 12 && h < 15) || h >= 19;
  });

  useEffect(() => {
    void loadStats(weekStr); // eslint-disable-line react-hooks/set-state-in-effect

    if (weekStr !== currentWeek) return;

    // Check service status every minute and refresh data every 15 min during service
    const REFRESH_MS = 15 * 60 * 1000;
    let lastRefresh = Date.now();

    const tick = setInterval(() => {
      const h = new Date().getHours();
      const service = (h >= 12 && h < 15) || h >= 19;
      setIsService(service);
      if (service && Date.now() - lastRefresh >= REFRESH_MS) {
        lastRefresh = Date.now();
        void loadStats(weekStr);
      }
    }, 60_000);

    return () => clearInterval(tick);
  }, [weekStr, currentWeek, loadStats, etab.current?.id]);

  function goPrevWeek() {
    setWeekStr((w) => shiftWeek(w, -1));
  }
  function goNextWeek() {
    setWeekStr((w) => {
      const next = shiftWeek(w, 1);
      return next <= currentWeek ? next : w;
    });
  }

  // Day-by-day navigation
  const todayISO = useMemo(() => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" }), []);

  function shiftDay(offset: number) {
    setSelectedDay(prev => {
      const d = new Date(prev + "T12:00:00");
      d.setDate(d.getDate() + offset);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      // Don't go beyond today
      if (iso > todayISO) return prev;
      // If the new day is in a different week, load that week
      const newWeek = dateToISOWeek(iso);
      if (newWeek !== weekStr) setWeekStr(newWeek);
      return iso;
    });
  }

  function formatDayShort(dateStr: string): string {
    return new Date(dateStr + "T12:00:00").toLocaleDateString("fr-FR", {
      weekday: "short", day: "numeric", month: "short",
    }).replace(/^\w/, c => c.toUpperCase());
  }

  async function handleBarClick(_day: DayData) {
    // Day detail drawer not available (no data source)
    return;
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setDayDetail(null);
  }

  const s = stats;
  const isNow = weekStr === currentWeek;

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <>
        <main style={{ maxWidth: 720, margin: "0 auto", padding: "20px 16px 56px", boxSizing: "border-box" }}>

          {/* ── BLOC 0 : WEEK SELECTOR (desktop only) ─────────────────────────── */}
          <div className="desktop-only">
            <WeekSelector weekStr={weekStr} currentWeek={currentWeek} onPrev={goPrevWeek} onNext={goNextWeek} />
          </div>

          {/* ── BLOC 1 : BANDEAU HAUT ────────────────────────────── */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            flexWrap: "wrap", gap: 8, padding: "12px 16px",
            background: "#fff", borderRadius: 16, border: "1.5px solid #ddd6c8",
            marginBottom: 16,
          }}>
            <div>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#1a1a1a" }}>{todayLabel()}</p>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                {lastUpdate && (
                  <span style={{ fontSize: 10, color: "#bbb" }}>
                    {isService ? "Màj auto · 15min" : "Hors service · Màj manuelle"}
                    {" · "}{lastUpdate}
                  </span>
                )}
                <button
                  onClick={() => void loadStats(weekStr)}
                  disabled={loading}
                  style={{
                    background: "none", border: "none", padding: 0,
                    fontSize: 13, cursor: loading ? "not-allowed" : "pointer",
                    opacity: loading ? 0.4 : 0.7, lineHeight: 1,
                  }}
                  title="Rafraîchir"
                >🔄</button>
              </div>
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
              <p style={sectionLabel}>
                CHIFFRES CLÉS{isNow && s.activeDays < 7 ? ` · ${s.activeDays}J SUR 7` : " · SEMAINE"}
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 20 }}>

                <div style={card}>
                  <p style={kpiLabel}>CA semaine</p>
                  <p style={kpiValue}>{fmtEuroInt(s.semaine.totalSales)}</p>
                  {delta(s.semaine.totalSales, s.semainePrec.totalSales) && (
                    <p style={{ ...deltaStyle, color: deltaColor(s.semaine.totalSales, s.semainePrec.totalSales) }}>
                      {delta(s.semaine.totalSales, s.semainePrec.totalSales)}
                    </p>
                  )}
                </div>

                <div style={card}>
                  <p style={kpiLabel}>{isPiccola ? "Tickets" : "Couverts"}</p>
                  <p style={kpiValue}>{s.semaine.guestsNumber}</p>
                  {delta(s.semaine.guestsNumber, s.semainePrec.guestsNumber) && (
                    <p style={{ ...deltaStyle, color: deltaColor(s.semaine.guestsNumber, s.semainePrec.guestsNumber) }}>
                      {delta(s.semaine.guestsNumber, s.semainePrec.guestsNumber)}
                    </p>
                  )}
                </div>

                <div style={card}>
                  <p style={kpiLabel}>Panier moyen</p>
                  <p style={kpiValue}>{fmtEuro(s.semaine.ticketMoyen)}</p>
                  {delta(s.semaine.ticketMoyen, s.semainePrec.ticketMoyen) && (
                    <p style={{ ...deltaStyle, color: deltaColor(s.semaine.ticketMoyen, s.semainePrec.ticketMoyen) }}>
                      {delta(s.semaine.ticketMoyen, s.semainePrec.ticketMoyen)}
                    </p>
                  )}
                </div>

                <div style={card}>
                  <p style={kpiLabel}>Meilleur jour</p>
                  <p style={kpiValue}>{s.semaine.bestDay.label}</p>
                  <p style={{ margin: "6px 0 0", fontSize: 14, fontWeight: 700, color: "#888", fontFamily: "var(--font-oswald), 'Oswald', sans-serif" }}>
                    {fmtEuroInt(s.semaine.bestDay.totalSales)}
                  </p>
                </div>

              </div>

              {/* ── BLOC 2b-kezia : MARGES KEZIA ──────────────────────── */}
              {isPiccola && (() => {
                const ext = s as StatsData & { _margeTotal?: number; _tauxMarque?: number; _prevMarge?: number; _prevTauxMarque?: number };
                const marge = ext._margeTotal ?? 0;
                const taux = ext._tauxMarque ?? 0;
                const prevMrg = ext._prevMarge ?? 0;
                const prevTaux = ext._prevTauxMarque ?? 0;
                if (marge === 0 && taux === 0) return null;
                const tauxPct = Math.round(taux * 100 * 10) / 10;
                const prevTauxPct = Math.round(prevTaux * 100 * 10) / 10;
                return (
                  <>
                    <p style={sectionLabel}>MARGES</p>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 20 }}>
                      <div style={{ ...card, borderLeft: `4px solid ${GREEN}` }}>
                        <p style={kpiLabel}>Marge brute</p>
                        <p style={kpiValue}>{fmtEuroInt(marge)}</p>
                        {prevMrg > 0 && delta(marge, prevMrg) && (
                          <p style={{ ...deltaStyle, color: deltaColor(marge, prevMrg) }}>
                            {delta(marge, prevMrg)}
                          </p>
                        )}
                      </div>
                      <div style={{ ...card, borderLeft: `4px solid ${tauxPct >= 25 ? GREEN : tauxPct >= 20 ? "#d4a24e" : RED}` }}>
                        <p style={kpiLabel}>Taux de marque</p>
                        <p style={{ ...kpiValue, color: tauxPct >= 25 ? GREEN : tauxPct >= 20 ? "#d4a24e" : RED }}>
                          {tauxPct.toFixed(1)}%
                        </p>
                        {prevTauxPct > 0 && (
                          <p style={{ ...deltaStyle, color: tauxPct >= prevTauxPct ? GREEN : RED }}>
                            {tauxPct >= prevTauxPct ? "↑ +" : "↓ "}
                            {(tauxPct - prevTauxPct).toFixed(1)} pts
                          </p>
                        )}
                      </div>
                    </div>
                  </>
                );
              })()}

              {/* ── BLOC 2b : INDICATEURS FINANCIERS ──────────────────── */}
              {costs && costs.foodCostPct !== null && (
                <>
                  <p style={sectionLabel}>CONTRÔLE FINANCIER</p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 20 }}>

                    <div style={{ ...card, borderLeft: `4px solid ${costs.foodCostPct <= 30 ? GREEN : costs.foodCostPct <= 35 ? "#d4a24e" : RED}` }}>
                      <p style={kpiLabel}>Food Cost</p>
                      <p style={{ ...kpiValue, color: costs.foodCostPct <= 30 ? GREEN : costs.foodCostPct <= 35 ? "#d4a24e" : RED }}>
                        {costs.foodCostPct.toFixed(1)}%
                      </p>
                      {costs.prev.foodCostPct !== null && (
                        <p style={{ ...deltaStyle, color: costs.foodCostPct <= costs.prev.foodCostPct ? GREEN : RED }}>
                          {costs.foodCostPct <= costs.prev.foodCostPct ? "↓ " : "↑ +"}
                          {(costs.foodCostPct - costs.prev.foodCostPct).toFixed(1)} pts
                        </p>
                      )}
                    </div>

                    <div style={{ ...card, borderLeft: `4px solid ${GREEN}` }}>
                      <p style={kpiLabel}>Marge brute</p>
                      <p style={kpiValue}>{fmtEuroInt(costs.margeBrute)}</p>
                      {costs.prev.margeBrute > 0 && delta(costs.margeBrute, costs.prev.margeBrute) && (
                        <p style={{ ...deltaStyle, color: deltaColor(costs.margeBrute, costs.prev.margeBrute) }}>
                          {delta(costs.margeBrute, costs.prev.margeBrute)}
                        </p>
                      )}
                    </div>

                    <div style={card}>
                      <p style={kpiLabel}>Coût matières</p>
                      <p style={kpiValue}>{fmtEuroInt(costs.totalCOGS)}</p>
                      {costs.prev.totalCOGS > 0 && delta(costs.totalCOGS, costs.prev.totalCOGS) && (
                        <p style={{ ...deltaStyle, color: deltaColor(costs.prev.totalCOGS, costs.totalCOGS) }}>
                          {delta(costs.totalCOGS, costs.prev.totalCOGS)}
                        </p>
                      )}
                    </div>

                    <div style={card}>
                      <p style={kpiLabel}>Couverture</p>
                      <p style={kpiValue}>{costs.matchRate}%</p>
                      <p style={{ margin: "6px 0 0", fontSize: 11, color: "#999" }}>
                        {costs.matchedProducts}/{costs.totalProducts} produits
                      </p>
                    </div>

                  </div>
                </>
              )}

              {/* ── BLOC 3 : GRAPHE + TOP PRODUITS ───────────────────── */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, marginBottom: 20 }}>

                {/* Graphe — cliquable */}
                <div style={{ ...card, padding: "16px 8px 12px" }}>
                  <p style={{ ...sectionLabel, margin: "0 0 4px 12px" }}>CA SEMAINE</p>
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
                                <span style={{ fontSize: 14, fontWeight: i < 3 ? 700 : 500, color: "#1a1a1a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
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
                                <span style={{ fontSize: 14, fontWeight: 700, color: ACCENT, fontFamily: "var(--font-oswald), 'Oswald', sans-serif" }}>{fmtEuroInt(p.totalSales)}</span>
                                <span style={{ fontSize: 11, color: "#bbb", marginLeft: 4, fontFamily: "var(--font-oswald), 'Oswald', sans-serif" }}>{p.quantity}x</span>
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
              {(s.categories ?? []).length > 0 && (
                <div style={{ ...card, marginBottom: 20 }}>
                  <p style={{ ...sectionLabel, margin: "0 0 14px" }}>RÉPARTITION PAR CATÉGORIE · SEMAINE</p>
                  <div style={{ display: "grid", gap: 12 }}>
                    {(s.categories ?? []).map((cat, i) => {
                      const color = getCatColor(cat.name);
                      const label = getCatLabel(cat.name);
                      return (
                        <div key={i}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color, fontFamily: "var(--font-oswald), 'Oswald', sans-serif", flexShrink: 0 }}>
                                {label}
                              </span>
                              {cat.topProduct && (
                                <span style={{ fontSize: 10, color: "#999", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {cat.topProduct}
                                </span>
                              )}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                              <span style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a", fontFamily: "var(--font-oswald), 'Oswald', sans-serif" }}>{fmtEuroInt(cat.ca)}</span>
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

              {/* ── BLOC 4 : INSIGHTS (current week only) ──────────── */}
              {isNow && (s.insights.meilleurJour || s.insights.produitEnHausse || s.insights.caVsMoyenne) && (
                <div style={{ ...card, marginBottom: 24 }}>
                  <p style={{ ...sectionLabel, margin: "0 0 12px" }}>INSIGHTS AUTOMATIQUES</p>
                  <div style={{ display: "grid", gap: 10 }}>
                    {s.insights.meilleurJour && (
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", background: "#1a1a1a", borderRadius: 10 }}>
                        <span style={{ fontSize: 16, flexShrink: 0 }}>📈</span>
                        <p style={{ margin: 0, fontSize: 14, color: "#c9b99a", lineHeight: 1.4, fontStyle: "italic" as const }}>
                          <strong>{s.insights.meilleurJour.label}</strong> est ton meilleur jour
                          {" — "}moyenne <strong>{fmtEuroInt(s.insights.meilleurJour.avgCA)}</strong> sur 30 jours
                        </p>
                      </div>
                    )}
                    {s.insights.produitEnHausse && (
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", background: "#1a1a1a", borderRadius: 10 }}>
                        <span style={{ fontSize: 16, flexShrink: 0 }}>🍕</span>
                        <p style={{ margin: 0, fontSize: 14, color: "#c9b99a", lineHeight: 1.4, fontStyle: "italic" as const }}>
                          <strong>&ldquo;{s.insights.produitEnHausse.name}&rdquo;</strong> est en hausse de{" "}
                          <strong style={{ color: GREEN }}>+{s.insights.produitEnHausse.pctChange}%</strong> vs la semaine dernière
                        </p>
                      </div>
                    )}
                    {s.insights.caVsMoyenne && (
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", background: "#1a1a1a", borderRadius: 10 }}>
                        <span style={{ fontSize: 16, flexShrink: 0 }}>{s.insights.caVsMoyenne.pct >= 0 ? "📈" : "📉"}</span>
                        <p style={{ margin: 0, fontSize: 14, color: "#c9b99a", lineHeight: 1.4, fontStyle: "italic" as const }}>
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

        </main>

        {/* ── Day Detail Drawer ── */}
        {drawerOpen && <DayDrawer detail={dayDetail} loading={dayLoading} onClose={closeDrawer} />}

        {/* ── Mobile Bottom Bar: day/week nav + action button ── */}
        <div className="mobile-only" style={{
          position: "fixed", bottom: "calc(70px + env(safe-area-inset-bottom, 0px))",
          left: 12, right: 12, zIndex: 100,
          display: "flex", flexDirection: "column", gap: 0,
          background: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
          borderRadius: 16,
          boxShadow: "0 4px 20px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06)",
          border: "1px solid rgba(0,0,0,0.06)",
          overflow: "hidden",
        }}>
          {/* Mode toggle: Semaine / Jour */}
          <div style={{ display: "flex", background: "#f5f0e8", borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
            {(["week", "day"] as const).map(m => (
              <button key={m} type="button" onClick={() => setDayNavMode(m === "day")} style={{
                flex: 1, padding: "6px 0", border: "none", cursor: "pointer",
                background: (m === "day") === dayNavMode ? "#fff" : "transparent",
                color: (m === "day") === dayNavMode ? ACCENT : "#999",
                fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em",
                fontFamily: "inherit",
              }}>
                {m === "week" ? "Semaine" : "Jour"}
              </button>
            ))}
          </div>

          {/* Nav row */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px" }}>
            {/* Prev */}
            <button onClick={() => dayNavMode ? shiftDay(-1) : goPrevWeek()} style={{
              width: 36, height: 36, borderRadius: 10, border: "none",
              background: ACCENT + "15", color: ACCENT,
              fontSize: 16, fontWeight: 700, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>←</button>

            {/* Label */}
            <div onClick={() => { if (dayNavMode) { setSelectedDay(todayISO); setWeekStr(currentWeek); } else { setWeekStr(currentWeek); } }}
              style={{ flex: 1, textAlign: "center", minWidth: 0, cursor: "pointer" }}>
              {dayNavMode ? (
                <>
                  <div style={{
                    fontSize: 13, fontWeight: 700, color: "#1a1a1a",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    {formatDayShort(selectedDay)}
                  </div>
                  {selectedDay === todayISO && (
                    <div style={{ fontSize: 9, fontWeight: 700, color: ACCENT, marginTop: 1 }}>Aujourd&apos;hui</div>
                  )}
                </>
              ) : (
                <>
                  <div style={{
                    fontSize: 12, fontWeight: 700, color: "#1a1a1a",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    {getWeekLabel(weekStr).replace("Semaine du ", "S. ")}
                  </div>
                  {weekStr === currentWeek && (
                    <div style={{ fontSize: 9, fontWeight: 700, color: ACCENT, marginTop: 1 }}>Cette semaine</div>
                  )}
                </>
              )}
            </div>

            {/* Next */}
            {(() => {
              const atEnd = dayNavMode ? selectedDay >= todayISO : weekStr === currentWeek;
              return (
                <button onClick={() => dayNavMode ? shiftDay(1) : goNextWeek()} disabled={atEnd} style={{
                  width: 36, height: 36, borderRadius: 10, border: "none",
                  background: atEnd ? "#f0ebe3" : ACCENT + "15",
                  color: atEnd ? "#ccc" : ACCENT,
                  fontSize: 16, fontWeight: 700,
                  cursor: atEnd ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>→</button>
              );
            })()}

            {/* Action button */}
            <button onClick={() => setActionDrawerOpen(true)} style={{
              width: 36, height: 36, borderRadius: 10, border: "none",
              background: ACCENT, color: "#fff",
              fontSize: 14, fontWeight: 700, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              boxShadow: `0 2px 8px ${ACCENT}40`,
            }}>
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── Action Drawer ── */}
        <BottomSheet open={actionDrawerOpen} onClose={() => setActionDrawerOpen(false)} title="Actions">
          <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingBottom: 8 }}>
            <button type="button" onClick={() => { setActionDrawerOpen(false); router.push("/invoices"); }} style={{
              display: "flex", alignItems: "center", gap: 14,
              width: "100%", padding: "16px 8px", cursor: "pointer",
              border: "none", background: "transparent", textAlign: "left",
              borderBottom: "1px solid rgba(0,0,0,0.06)",
              fontFamily: "inherit", fontSize: 15, fontWeight: 500, color: "#1a1a1a",
            }}>
              <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              Importer une facture
            </button>
            <button type="button" disabled={pdfLoading || !stats} onClick={async () => {
              setPdfLoading(true);
              try {
                const monday = isoWeekToMonday(weekStr);
                const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
                const from = monday.toISOString().slice(0, 10);
                const to = sunday.toISOString().slice(0, 10);
                const res = await fetchApi(`/api/ventes/pdf?type=ventes&from=${from}&to=${to}`, {
                  headers: { "x-etablissement-id": currentEtabId ?? "" },
                });
                if (res.ok) {
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  window.open(url, "_blank");
                }
              } catch { /* */ }
              setPdfLoading(false);
              setActionDrawerOpen(false);
            }} style={{
              display: "flex", alignItems: "center", gap: 14,
              width: "100%", padding: "16px 8px", cursor: stats ? "pointer" : "not-allowed",
              border: "none", background: "transparent", textAlign: "left",
              fontFamily: "inherit", fontSize: 15, fontWeight: 500,
              color: stats ? "#1a1a1a" : "#ccc",
            }}>
              <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={stats ? ACCENT : "#ccc"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
              {pdfLoading ? "Generation..." : "Rapport PDF de la semaine"}
            </button>
          </div>
        </BottomSheet>
      </>
    </RequireRole>
  );
}
