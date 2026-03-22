"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

import { RequireRole } from "@/components/RequireRole";
import { useEtablissement } from "@/lib/EtablissementContext";

type Event = {
  id: string;
  name: string;
  type: string;
  date: string | null;
  time: string | null;
  location: string | null;
  covers: number;
  establishment: string;
  status: string;
  contact_name: string | null;
  sell_price: number | null;
};

const STATUS_LABELS: Record<string, string> = {
  prospect: "Prospect",
  confirme: "Confirmé",
  en_cours: "En cours",
  termine: "Terminé",
  annule: "Annulé",
};

const STATUS_COLORS: Record<string, { bg: string; fg: string; dot: string }> = {
  prospect: { bg: "#f5f0e8", fg: "#8c7e6a", dot: "#c4b89a" },
  confirme: { bg: "#e6f2e6", fg: "#2d6a2e", dot: "#4caf50" },
  en_cours: { bg: "#e3effd", fg: "#1565c0", dot: "#2196f3" },
  termine: { bg: "#f0f0f0", fg: "#aaa", dot: "#ccc" },
  annule: { bg: "#fde8e8", fg: "#c62828", dot: "#ef5350" },
};

const TYPE_LABELS: Record<string, string> = {
  mariage: "Mariage",
  seminaire: "Séminaire",
  anniversaire: "Anniversaire",
  bapteme: "Baptême",
  repas_staff: "Repas staff",
  autre: "Autre",
};

const TYPE_COLORS: Record<string, string> = {
  mariage: "#C49A1A",
  seminaire: "#2563EB",
  anniversaire: "#9D174D",
  bapteme: "#7C3AED",
  repas_staff: "#D97706",
  autre: "#6B7280",
};

const TYPE_BG: Record<string, string> = {
  mariage: "rgba(139,105,20,0.07)",
  seminaire: "rgba(37,99,235,0.07)",
  anniversaire: "rgba(157,23,77,0.07)",
  bapteme: "rgba(124,58,237,0.07)",
  repas_staff: "rgba(217,119,6,0.07)",
  autre: "rgba(107,114,128,0.07)",
};

function TypeIcon({ type, size = 22 }: { type: string; size?: number }) {
  const color = TYPE_COLORS[type] ?? "#6B7280";
  switch (type) {
    case "mariage":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      );
    case "seminaire":
    case "repas_staff":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="7" width="20" height="14" rx="2" />
          <path d="M16 3v4M8 3v4M2 11h20" />
        </svg>
      );
    case "anniversaire":
    case "bapteme":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2v4M8 6h8l1 6H7l1-6zM5 12h14v2a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4v-2z" />
          <path d="M6 22h12" />
        </svg>
      );
    default:
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4l3 3" />
        </svg>
      );
  }
}

function CalendarIcon({ size = 18, color = "#D4775A" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function UsersIcon({ size = 18, color = "#2563EB" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function EuroIcon({ size = 18, color = "#4a6741" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 5.5C15.8 4.6 14.4 4 12.8 4 9 4 6 7.6 6 12s3 8 6.8 8c1.6 0 3-.6 4.2-1.5" />
      <line x1="4" y1="10" x2="15" y2="10" /><line x1="4" y1="14" x2="15" y2="14" />
    </svg>
  );
}

const MONTH_NAMES = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

const DAY_HEADERS = ["L", "M", "M", "J", "V", "S", "D"];

function getCalendarDays(year: number, month: number): (number | null)[] {
  const first = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0).getDate();
  const startDow = (first.getDay() + 6) % 7;
  const cells: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= lastDay; d++) cells.push(d);
  return cells;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function fmtTime(t: string | null) {
  if (!t) return "";
  return t.slice(0, 5);
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const target = new Date(iso + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function detectOverlaps(events: Event[]): Set<string> {
  const overlapping = new Set<string>();
  const dated = events.filter((e) => e.date && !["termine", "annule"].includes(e.status));
  for (let i = 0; i < dated.length; i++) {
    for (let j = i + 1; j < dated.length; j++) {
      if (dated[i].date === dated[j].date) {
        const estA = dated[i].establishment;
        const estB = dated[j].establishment;
        if (estA === "both" || estB === "both" || estA === estB) {
          overlapping.add(dated[i].id);
          overlapping.add(dated[j].id);
        }
      }
    }
  }
  return overlapping;
}

export default function EventsPage() {
  const { current: etab } = useEtablissement();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"upcoming" | "all" | "past">("upcoming");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());

  function prevMonth() {
    setCalMonth((m) => { if (m === 0) { setCalYear((y) => y - 1); return 11; } return m - 1; });
  }
  function nextMonth() {
    setCalMonth((m) => { if (m === 11) { setCalYear((y) => y + 1); return 0; } return m + 1; });
  }

  const eventsByDate = useMemo(() => {
    const map = new Map<string, Event[]>();
    for (const e of events) {
      if (!e.date) continue;
      const arr = map.get(e.date) ?? [];
      arr.push(e);
      map.set(e.date, arr);
    }
    return map;
  }, [events]);

  const etabKey = etab?.slug?.includes("bello") ? "bellomio" : etab?.slug?.includes("piccola") ? "piccola" : null;

  useEffect(() => {
    (async () => {
      const q = supabase
        .from("events")
        .select("id,name,type,date,time,location,covers,establishment,status,contact_name,sell_price")
        .order("date", { ascending: true, nullsFirst: false });
      if (etabKey) q.or(`establishment.eq.${etabKey},establishment.eq.both,establishment.is.null`);
      const { data } = await q;
      setEvents(data ?? []);
      setLoading(false);
    })();
  }, [etabKey]);

  const today = new Date().toISOString().slice(0, 10);

  // KPIs — upcoming events only
  const upcoming = events.filter((e) => e.date && e.date >= today && !["annule", "termine"].includes(e.status));
  const kpiCount = upcoming.length;
  const kpiCovers = upcoming.reduce((s, e) => s + (e.covers ?? 0), 0);
  const kpiRevenue = upcoming.reduce((s, e) => s + (e.sell_price ?? 0), 0);

  // Filtered events for list
  const filtered = useMemo(() => {
    let list = events;
    if (selectedDate) {
      list = list.filter((e) => e.date === selectedDate);
    } else {
      list = list.filter((e) => {
        if (filter === "upcoming") return !e.date || e.date >= today;
        if (filter === "past") return e.date && e.date < today;
        return true;
      });
    }
    return list;
  }, [events, filter, selectedDate, today]);

  const overlaps = detectOverlaps(events);

  // Next event for hero
  const nextEvent = upcoming[0] ?? null;

  // Accent color from establishment (Piccola = #efd199, Bello = #e27f57, fallback = terracotta)
  const accent = etab?.couleur ?? "#D4775A";
  // Darker version for text on light accent backgrounds
  const accentDark = etab?.slug?.includes("piccola") ? "#C49A1A" : "#b5573d";

  return (
    <RequireRole allowedRoles={["group_admin"]}>
    <>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "12px 16px 100px" }}>

        {/* ═══ HEADER ═══ */}
        <div style={{ marginBottom: 20 }}>
          <h1 style={{
            fontSize: "1.5rem", fontWeight: 700,
            fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
            letterSpacing: 1.5, textTransform: "uppercase" as const,
            color: "#1a1a1a", margin: 0,
          }}>
            Événementiel
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#9a8f84" }}>
            {kpiCount > 0
              ? `${kpiCount} événement${kpiCount > 1 ? "s" : ""} à venir`
              : "Aucun événement prévu"
            }
          </p>
        </div>

        {/* ═══ KPI CARDS ═══ */}
        {!loading && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 20 }}>
            {/* Events count */}
            <div style={kpiCardStyle}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: `${accent}20`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <CalendarIcon size={16} color={accentDark} />
                </div>
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "var(--font-oswald), 'Oswald', sans-serif", color: "#1a1a1a", lineHeight: 1 }}>
                {kpiCount}
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#9a8f84", marginTop: 4, letterSpacing: 0.3 }}>
                À venir
              </div>
            </div>

            {/* Covers */}
            <div style={kpiCardStyle}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: "rgba(37,99,235,0.08)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <UsersIcon size={16} color="#2563EB" />
                </div>
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "var(--font-oswald), 'Oswald', sans-serif", color: "#1a1a1a", lineHeight: 1 }}>
                {kpiCovers}
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#9a8f84", marginTop: 4, letterSpacing: 0.3 }}>
                Couverts
              </div>
            </div>

            {/* Revenue */}
            <div style={kpiCardStyle}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: "rgba(74,103,65,0.08)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <EuroIcon size={16} color="#4a6741" />
                </div>
              </div>
              <div style={{
                fontSize: kpiRevenue > 0 ? 28 : 20, fontWeight: 800,
                fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
                color: kpiRevenue > 0 ? "#4a6741" : "#ccc",
                lineHeight: 1,
              }}>
                {kpiRevenue > 0 ? `${kpiRevenue.toLocaleString("fr-FR")} €` : "—"}
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#9a8f84", marginTop: 4, letterSpacing: 0.3 }}>
                CA prévisionnel
              </div>
              {kpiRevenue === 0 && kpiCount > 0 && (
                <div style={{ fontSize: 9, color: accentDark, marginTop: 2, fontStyle: "italic" }}>
                  Renseignez le prix sur vos events
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ NEXT EVENT BANNER ═══ */}
        {!loading && nextEvent && (() => {
          const jours = daysUntil(nextEvent.date);
          const tc = TYPE_COLORS[nextEvent.type] ?? "#6B7280";
          return (
            <Link href={`/evenements/${nextEvent.id}`} style={{ textDecoration: "none", color: "inherit" }}>
              <div style={{
                marginBottom: 20,
                background: `linear-gradient(135deg, ${tc}12 0%, ${tc}06 100%)`,
                border: `1px solid ${tc}25`,
                borderRadius: 14,
                padding: "14px 16px",
                display: "flex", alignItems: "center", gap: 14,
                cursor: "pointer",
              }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 12,
                  background: `${tc}15`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}>
                  <TypeIcon type={nextEvent.type} size={24} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: tc, textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>
                    Prochain événement
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#1a1a1a", lineHeight: 1.2 }}>
                    {nextEvent.name}
                  </div>
                  <div style={{ fontSize: 12, color: "#6f6a61", marginTop: 2 }}>
                    {fmtDate(nextEvent.date)}{nextEvent.time ? ` · ${fmtTime(nextEvent.time)}` : ""}
                    {nextEvent.covers > 0 ? ` · ${nextEvent.covers} couv.` : ""}
                  </div>
                </div>
                {jours !== null && jours >= 0 && (
                  <div style={{
                    textAlign: "center", flexShrink: 0,
                    background: jours <= 3 ? accentDark : tc,
                    color: "#fff",
                    borderRadius: 10, padding: "6px 12px",
                    minWidth: 44,
                  }}>
                    <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1 }}>
                      {jours === 0 ? "!" : jours}
                    </div>
                    <div style={{ fontSize: 9, fontWeight: 600, opacity: 0.9, marginTop: 1 }}>
                      {jours === 0 ? "Auj." : jours === 1 ? "demain" : "jours"}
                    </div>
                  </div>
                )}
              </div>
            </Link>
          );
        })()}

        {/* ═══ COMPACT CALENDAR ═══ */}
        {!loading && (() => {
          const cells = getCalendarDays(calYear, calMonth);
          const todayStr = new Date().toISOString().slice(0, 10);
          // Count events this month for header
          const monthEvents = events.filter((e) => e.date && e.date.startsWith(`${calYear}-${String(calMonth + 1).padStart(2, "0")}`));
          return (
            <div style={{
              marginBottom: 20, borderRadius: 14,
              background: `linear-gradient(180deg, ${accent} 0%, ${accentDark} 100%)`,
              boxShadow: `0 4px 16px ${accent}40`,
              overflow: "hidden",
            }}>
              {/* Month nav — colored header */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "12px 16px",
              }}>
                <button onClick={prevMonth} style={{ ...calNavBtn, background: "rgba(255,255,255,0.2)", border: "none" }}>
                  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
                </button>
                <div style={{ textAlign: "center" }}>
                  <div style={{
                    fontSize: 14, fontWeight: 800, color: "#fff",
                    fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
                    textTransform: "uppercase", letterSpacing: 1.5,
                    textShadow: "0 1px 2px rgba(0,0,0,0.15)",
                  }}>
                    {MONTH_NAMES[calMonth]} {calYear}
                  </div>
                  {monthEvents.length > 0 && (
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.8)", marginTop: 1 }}>
                      {monthEvents.length} événement{monthEvents.length > 1 ? "s" : ""}
                    </div>
                  )}
                </div>
                <button onClick={nextMonth} style={{ ...calNavBtn, background: "rgba(255,255,255,0.2)", border: "none" }}>
                  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
                </button>
              </div>

              {/* Calendar body — white */}
              <div style={{ background: "#fff", borderRadius: "12px 12px 14px 14px", padding: "8px 8px 4px" }}>
                {/* Day headers */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 4 }}>
                  {DAY_HEADERS.map((d, i) => (
                    <div key={`${d}-${i}`} style={{
                      textAlign: "center",
                      fontSize: 10, fontWeight: 700, color: accentDark,
                      textTransform: "uppercase", letterSpacing: 0.5,
                      padding: "4px 0",
                    }}>{d}</div>
                  ))}
                </div>

                {/* Day cells */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
                  {cells.map((day, i) => {
                    if (day == null) return <div key={`empty-${i}`} style={{ height: 36 }} />;

                    const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                    const dayEvents = eventsByDate.get(dateStr) ?? [];
                    const hasEvents = dayEvents.length > 0;
                    const isToday = dateStr === todayStr;
                    const isSelected = dateStr === selectedDate;
                    const isPast = dateStr < todayStr;
                    // Color the cell background with the first event's type color
                    const eventTypeColor = hasEvents ? (TYPE_COLORS[dayEvents[0].type] ?? "#6B7280") : "";

                    return (
                      <button
                        key={dateStr}
                        type="button"
                        onClick={() => {
                          if (selectedDate === dateStr) setSelectedDate(null);
                          else if (hasEvents) setSelectedDate(dateStr);
                        }}
                        style={{
                          height: 36,
                          display: "flex", flexDirection: "column",
                          alignItems: "center", justifyContent: "center",
                          gap: 2,
                          border: isToday ? `2px solid ${accentDark}` : "2px solid transparent",
                          cursor: hasEvents ? "pointer" : "default",
                          background: isSelected
                            ? accentDark
                            : isToday && hasEvents
                              ? `${eventTypeColor}25`
                              : isToday
                                ? `${accent}25`
                                : hasEvents
                                  ? `${eventTypeColor}18`
                                  : "transparent",
                          borderRadius: 6,
                          position: "relative",
                          padding: 0,
                        }}
                      >
                        <span style={{
                          fontSize: 13,
                          fontWeight: isToday || isSelected || hasEvents ? 700 : 400,
                          color: isSelected ? "#fff" : isToday ? accentDark : isPast && !hasEvents ? "#ccc" : hasEvents ? "#1a1a1a" : "#6f6a61",
                          lineHeight: 1,
                        }}>
                          {day}
                        </span>
                        {hasEvents && (
                          <div style={{ display: "flex", gap: 2, position: "absolute", bottom: 2 }}>
                            {dayEvents.slice(0, 3).map((ev) => (
                              <span key={ev.id} style={{
                                width: 4, height: 4, borderRadius: "50%",
                                background: isSelected ? "rgba(255,255,255,0.85)" : (TYPE_COLORS[ev.type] ?? "#999"),
                                display: "inline-block",
                              }} />
                            ))}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Legend */}
                <div style={{
                  display: "flex", gap: 12, flexWrap: "wrap",
                  padding: "6px 8px", marginTop: 2,
                  borderTop: "1px solid #f0ebe3",
                  fontSize: 9, color: "#9a8f84",
                }}>
                  {Object.entries(TYPE_COLORS).slice(0, 4).map(([type, color]) => (
                    <span key={type} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                      <span style={{ width: 5, height: 5, borderRadius: "50%", background: color, display: "inline-block" }} />
                      {TYPE_LABELS[type] ?? type}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Selected date indicator */}
        {selectedDate && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: 14, padding: "8px 14px",
            background: `${accent}12`, borderRadius: 10,
            border: `1px solid ${accent}30`,
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a" }}>
              {new Date(selectedDate + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
            </span>
            <button
              type="button"
              onClick={() => setSelectedDate(null)}
              style={{
                background: "none", border: "none",
                color: accentDark, fontSize: 12, fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Voir tout
            </button>
          </div>
        )}

        {/* ═══ FILTERS ═══ */}
        {!selectedDate && (
          <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
            {(["upcoming", "all", "past"] as const).map((f) => {
              const active = filter === f;
              return (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  style={{
                    padding: "6px 16px",
                    borderRadius: 20,
                    border: active ? `1.5px solid ${accentDark}` : "1px solid #ddd6c8",
                    background: active ? accentDark : "#fff",
                    color: active ? "#fff" : "#6f6a61",
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: "pointer",
                    letterSpacing: 0.2,
                  }}
                >
                  {f === "upcoming" ? "À venir" : f === "all" ? "Tous" : "Passés"}
                </button>
              );
            })}
          </div>
        )}

        {loading && <p className="muted">Chargement…</p>}

        {/* ═══ EMPTY STATE ═══ */}
        {!loading && filtered.length === 0 && (
          <div style={{
            textAlign: "center", padding: "3rem 1.5rem",
            background: "#fff", borderRadius: 14,
            border: "1px solid #e8e2d8",
          }}>
            <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.3 }}>
              <CalendarIcon size={40} color="#ccc" />
            </div>
            <p style={{ color: "#9a8f84", fontSize: 14, margin: "0 0 16px" }}>
              {selectedDate ? "Aucun événement ce jour" : "Aucun événement"}
            </p>
            {!selectedDate && (
              <Link href="/evenements/new" style={{
                display: "inline-block",
                padding: "10px 24px", borderRadius: 20,
                background: accentDark, color: "#fff",
                fontWeight: 700, fontSize: 13,
                textDecoration: "none",
              }}>
                Créer le premier
              </Link>
            )}
          </div>
        )}

        {/* ═══ EVENT LIST ═══ */}
        {!loading && filtered.length > 0 && (
          <div style={{ display: "grid", gap: 10 }}>
            {filtered.map((e) => {
              const sc = STATUS_COLORS[e.status] ?? STATUS_COLORS.prospect;
              const typeColor = TYPE_COLORS[e.type] ?? "#6B7280";
              const typeBg = TYPE_BG[e.type] ?? "rgba(107,114,128,0.07)";
              const isOverlap = overlaps.has(e.id);
              const jours = daysUntil(e.date);
              const isUpcoming = jours !== null && jours >= 0 && !["termine", "annule"].includes(e.status);

              return (
                <Link key={e.id} href={`/evenements/${e.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                  <div
                    style={{
                      background: "#fff",
                      borderRadius: 14,
                      border: "1px solid #e8e2d8",
                      borderLeft: `4px solid ${typeColor}`,
                      padding: "14px 16px",
                      cursor: "pointer",
                      position: "relative",
                      transition: "transform 120ms ease, box-shadow 120ms ease",
                      ...(isOverlap ? { boxShadow: "inset 0 0 0 2px rgba(220,38,38,0.3)" } : {}),
                    }}
                    onMouseEnter={(ev) => {
                      ev.currentTarget.style.transform = "translateY(-1px)";
                      if (!isOverlap) ev.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,0.06)";
                    }}
                    onMouseLeave={(ev) => {
                      ev.currentTarget.style.transform = "none";
                      if (!isOverlap) ev.currentTarget.style.boxShadow = "none";
                    }}
                  >
                    {isOverlap && (
                      <span style={{
                        position: "absolute", top: 8, right: 10,
                        fontSize: 9, fontWeight: 800, color: "#DC2626",
                        background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.2)",
                        borderRadius: 6, padding: "2px 7px",
                      }}>
                        Chevauchement
                      </span>
                    )}

                    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                      {/* Type icon */}
                      <div style={{
                        width: 44, height: 44, borderRadius: 12,
                        background: typeBg,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        flexShrink: 0,
                      }}>
                        <TypeIcon type={e.type} />
                      </div>

                      {/* Content */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                          <div style={{ minWidth: 0 }}>
                            <p style={{ margin: 0, fontWeight: 800, fontSize: 15, color: "#1a1a1a", lineHeight: 1.3 }}>
                              {e.name}
                            </p>
                            <p style={{ margin: "3px 0 0", fontSize: 12, color: "#9a8f84" }}>
                              {TYPE_LABELS[e.type] ?? e.type}
                              {e.contact_name ? ` · ${e.contact_name}` : ""}
                            </p>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                            <span style={{
                              fontSize: 10, fontWeight: 700,
                              padding: "3px 10px", borderRadius: 20,
                              background: sc.bg, color: sc.fg,
                              display: "inline-flex", alignItems: "center", gap: 4,
                            }}>
                              <span style={{ width: 5, height: 5, borderRadius: "50%", background: sc.dot, display: "inline-block" }} />
                              {STATUS_LABELS[e.status] ?? e.status}
                            </span>
                            {isUpcoming && jours !== null && (
                              <span style={{
                                fontSize: 10, fontWeight: 800,
                                color: jours <= 7 ? accentDark : "#9a8f84",
                              }}>
                                {jours === 0 ? "Aujourd\u2019hui" : jours === 1 ? "Demain" : `J-${jours}`}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Bottom row */}
                        <div style={{
                          marginTop: 10, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
                          padding: "8px 0 0",
                          borderTop: "1px solid #f5f0e8",
                        }}>
                          <span style={{ fontSize: 12, color: "#6f6a61", display: "inline-flex", alignItems: "center", gap: 5 }}>
                            <CalendarIcon size={13} color="#b0a894" />
                            {fmtDate(e.date)}{e.time ? ` · ${fmtTime(e.time)}` : ""}
                          </span>
                          {e.covers > 0 && (
                            <span style={{ fontSize: 12, fontWeight: 700, color: "#1a1a1a", display: "inline-flex", alignItems: "center", gap: 5 }}>
                              <UsersIcon size={13} color="#b0a894" />
                              {e.covers} couv.
                            </span>
                          )}
                          {e.sell_price != null && e.sell_price > 0 && (
                            <span style={{
                              fontSize: 13, fontWeight: 800, color: "#4a6741",
                              marginLeft: "auto",
                              display: "inline-flex", alignItems: "center", gap: 4,
                            }}>
                              {e.sell_price.toLocaleString("fr-FR")} €
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* ═══ FAB ═══ */}
      <Link
        href="/evenements/new"
        style={{
          position: "fixed",
          bottom: 80,
          right: 20,
          width: 54,
          height: 54,
          borderRadius: "50%",
          background: `linear-gradient(135deg, ${accent} 0%, ${accentDark} 100%)`,
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: `0 4px 20px ${accent}70, 0 2px 8px rgba(0,0,0,0.1)`,
          textDecoration: "none",
          fontSize: 28,
          fontWeight: 300,
          lineHeight: 1,
          zIndex: 50,
        }}
        title="Nouvel événement"
      >
        +
      </Link>
    </>
    </RequireRole>
  );
}

/* ── Styles ── */

const kpiCardStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 14,
  border: "1px solid #e8e2d8",
  padding: "14px 14px 12px",
  boxShadow: "0 1px 4px rgba(0,0,0,0.02)",
};

const calNavBtn: React.CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: 8,
  border: "1px solid #e8e2d8",
  background: "#fff",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
