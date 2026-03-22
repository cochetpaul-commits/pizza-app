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
  confirme: "Confirm\u00e9",
  en_cours: "En cours",
  termine: "Termin\u00e9",
  annule: "Annul\u00e9",
};

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  prospect: { bg: "#e8e0d0", fg: "#999999" },
  confirme: { bg: "#e8ede6", fg: "#4a6741" },
  en_cours: { bg: "rgba(37,99,235,0.10)", fg: "#2563eb" },
  termine: { bg: "#f0f0f0", fg: "#bbbbbb" },
  annule: { bg: "rgba(220,38,38,0.10)", fg: "#DC2626" },
};

const TYPE_LABELS: Record<string, string> = {
  mariage: "Mariage",
  seminaire: "S\u00e9minaire",
  anniversaire: "Anniversaire",
  bapteme: "Bapt\u00eame",
  repas_staff: "Repas staff",
  autre: "Autre",
};

// Type-based accent colors for left border
const TYPE_COLORS: Record<string, string> = {
  mariage: "#8B6914",
  seminaire: "#2563EB",
  anniversaire: "#9D174D",
  bapteme: "#7C3AED",
  repas_staff: "#D97706",
  autre: "#6B7280",
};

// Type icons (SVG inline)
function TypeIcon({ type }: { type: string }) {
  const color = TYPE_COLORS[type] ?? "#6B7280";
  const size = 28;
  switch (type) {
    case "mariage":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      );
    case "seminaire":
    case "repas_staff":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="7" width="20" height="14" rx="2" />
          <path d="M16 3v4M8 3v4M2 11h20" />
        </svg>
      );
    case "anniversaire":
    case "bapteme":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2v4M8 6h8l1 6H7l1-6zM5 12h14v2a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4v-2z" />
          <path d="M6 22h12" />
        </svg>
      );
    default:
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4l3 3" />
        </svg>
      );
  }
}

const MONTH_NAMES = [
  "Janvier", "F\u00e9vrier", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Ao\u00fbt", "Septembre", "Octobre", "Novembre", "D\u00e9cembre",
];

const DAY_HEADERS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

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
  if (!iso) return "\u2014";
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
  const diff = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return diff;
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

  // Calendar state
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

  // KPIs
  const upcoming = events.filter((e) => e.date && e.date >= today && !["annule", "termine"].includes(e.status));
  const kpiCount = upcoming.length;
  const kpiCovers = upcoming.reduce((s, e) => s + (e.covers ?? 0), 0);
  const kpiRevenue = upcoming.reduce((s, e) => s + (e.sell_price ?? 0), 0);

  // Filtered events for list
  const filtered = useMemo(() => {
    let list = events;
    // If a date is selected from calendar, filter to that date
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

  return (
    <RequireRole allowedRoles={["group_admin"]}>
    <>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "12px 16px 100px" }}>
        <h1 style={{ fontSize: "1.4rem", fontWeight: 700, fontFamily: "var(--font-oswald), 'Oswald', sans-serif", letterSpacing: 1.5, textTransform: "uppercase" as const, color: "#2f3a33", margin: "0 0 16px" }}>
          Evenementiel
        </h1>

        {/* ═══ KPI CARDS ═══ */}
        {!loading && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 20 }}>
            <div style={kpiCard}>
              <div style={kpiValue}>{kpiCount}</div>
              <div style={kpiLabel}>{kpiCount <= 1 ? "Evenement" : "Evenements"}</div>
              <div style={kpiSub}>a venir</div>
            </div>
            <div style={kpiCard}>
              <div style={kpiValue}>{kpiCovers}</div>
              <div style={kpiLabel}>Couverts</div>
              <div style={kpiSub}>prevus</div>
            </div>
            <div style={kpiCard}>
              <div style={{ ...kpiValue, color: "#4a6741" }}>{kpiRevenue > 0 ? `${kpiRevenue.toLocaleString("fr-FR")}` : "0"}</div>
              <div style={kpiLabel}>EUR</div>
              <div style={kpiSub}>CA previsionnel</div>
            </div>
          </div>
        )}

        {/* ═══ COMPACT CALENDAR ═══ */}
        {!loading && (() => {
          const cells = getCalendarDays(calYear, calMonth);
          const todayStr = new Date().toISOString().slice(0, 10);
          return (
            <div style={{ marginBottom: 20, background: "#fff", borderRadius: 12, border: "1px solid #ddd6c8", overflow: "hidden" }}>
              {/* Month nav */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 14px", borderBottom: "1px solid #f0ebe3",
              }}>
                <button onClick={prevMonth} style={calNavBtn}>{"\u2190"}</button>
                <span style={{ fontSize: 14, fontWeight: 800, color: "#2f3a33" }}>
                  {MONTH_NAMES[calMonth]} {calYear}
                </span>
                <button onClick={nextMonth} style={calNavBtn}>{"\u2192"}</button>
              </div>

              {/* Day headers */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
                {DAY_HEADERS.map((d) => (
                  <div key={d} style={{
                    padding: "6px 0", textAlign: "center",
                    fontSize: 10, fontWeight: 700, color: "#b0a894",
                    textTransform: "uppercase", letterSpacing: 0.5,
                  }}>{d}</div>
                ))}
              </div>

              {/* Day cells — compact */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
                {cells.map((day, i) => {
                  if (day == null) {
                    return <div key={`empty-${i}`} style={{ height: 38, background: "#faf7f2" }} />;
                  }
                  const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                  const dayEvents = eventsByDate.get(dateStr) ?? [];
                  const hasEvents = dayEvents.length > 0;
                  const isToday = dateStr === todayStr;
                  const isSelected = dateStr === selectedDate;
                  const isWeekend = i % 7 >= 5;
                  return (
                    <button
                      key={dateStr}
                      type="button"
                      onClick={() => {
                        if (selectedDate === dateStr) {
                          setSelectedDate(null);
                        } else if (hasEvents) {
                          setSelectedDate(dateStr);
                        }
                      }}
                      style={{
                        height: 38,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 2,
                        border: "none",
                        cursor: hasEvents ? "pointer" : "default",
                        background: isSelected ? "#D4775A" : isToday ? "rgba(212,119,90,0.08)" : isWeekend ? "#faf7f2" : "#fff",
                        borderRadius: 0,
                        position: "relative",
                      }}
                    >
                      <span style={{
                        fontSize: 12,
                        fontWeight: isToday || isSelected ? 800 : 400,
                        color: isSelected ? "#fff" : isToday ? "#D4775A" : "#2f3a33",
                      }}>
                        {day}
                      </span>
                      {hasEvents && (
                        <div style={{ display: "flex", gap: 2 }}>
                          {dayEvents.slice(0, 3).map((ev) => (
                            <span key={ev.id} style={{
                              width: 5, height: 5, borderRadius: "50%",
                              background: isSelected ? "rgba(255,255,255,0.7)" : (TYPE_COLORS[ev.type] ?? "#999"),
                              display: "inline-block",
                            }} />
                          ))}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Legend dots */}
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", padding: "8px 14px", borderTop: "1px solid #f0ebe3", fontSize: 10, color: "#9a8f84" }}>
                {Object.entries(TYPE_COLORS).slice(0, 4).map(([type, color]) => (
                  <span key={type} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, display: "inline-block" }} />
                    {TYPE_LABELS[type] ?? type}
                  </span>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Selected date indicator */}
        {selectedDate && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#2f3a33" }}>
              {new Date(selectedDate + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
            </span>
            <button
              type="button"
              onClick={() => setSelectedDate(null)}
              style={{ background: "none", border: "none", color: "#D4775A", fontSize: 12, fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}
            >
              Voir tout
            </button>
          </div>
        )}

        {/* ═══ FILTERS (when no date selected) ═══ */}
        {!selectedDate && (
          <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
            {(["upcoming", "all", "past"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: "6px 14px",
                  borderRadius: 8,
                  border: "1px solid #ddd6c8",
                  background: filter === f ? "#D4775A" : "#fff",
                  color: filter === f ? "#fff" : "#2f3a33",
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                {f === "upcoming" ? "\u00c0 venir" : f === "all" ? "Tous" : "Pass\u00e9s"}
              </button>
            ))}
          </div>
        )}

        {loading && <p className="muted">Chargement\u2026</p>}

        {/* ═══ EVENT LIST ═══ */}
        {!loading && filtered.length === 0 && (
          <div className="card" style={{ textAlign: "center", padding: "2rem" }}>
            <p className="muted">{selectedDate ? "Aucun evenement ce jour" : "Aucun evenement"}</p>
            {!selectedDate && (
              <Link href="/evenements/new" className="btn btnPrimary" style={{ marginTop: 12, background: "#D4775A", borderColor: "#D4775A" }}>
                Creer le premier
              </Link>
            )}
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div style={{ display: "grid", gap: 10 }}>
            {filtered.map((e) => {
              const sc = STATUS_COLORS[e.status] ?? STATUS_COLORS.prospect;
              const typeColor = TYPE_COLORS[e.type] ?? "#6B7280";
              const isOverlap = overlaps.has(e.id);
              const jours = daysUntil(e.date);
              const isUpcoming = jours !== null && jours >= 0 && !["termine", "annule"].includes(e.status);

              return (
                <Link key={e.id} href={`/evenements/${e.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                  <div
                    style={{
                      background: "#fff",
                      borderRadius: 12,
                      border: "1px solid #ddd6c8",
                      borderLeft: `5px solid ${typeColor}`,
                      padding: "14px 16px",
                      cursor: "pointer",
                      position: "relative",
                      transition: "box-shadow 150ms ease",
                      ...(isOverlap ? { boxShadow: "inset 0 0 0 2px rgba(220,38,38,0.35)" } : {}),
                    }}
                    onMouseEnter={(ev) => { if (!isOverlap) ev.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)"; }}
                    onMouseLeave={(ev) => { if (!isOverlap) ev.currentTarget.style.boxShadow = "none"; }}
                  >
                    {isOverlap && (
                      <span style={{
                        position: "absolute", top: 8, right: 10,
                        fontSize: 9, fontWeight: 800, color: "#DC2626",
                        background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.25)",
                        borderRadius: 6, padding: "2px 6px",
                      }}>
                        Chevauchement
                      </span>
                    )}

                    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                      {/* Type icon */}
                      <div style={{
                        width: 44, height: 44, borderRadius: 10,
                        background: `${typeColor}10`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        flexShrink: 0,
                      }}>
                        <TypeIcon type={e.type} />
                      </div>

                      {/* Content */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                          <div style={{ minWidth: 0 }}>
                            <p style={{ margin: 0, fontWeight: 800, fontSize: 15, color: "#2f3a33", lineHeight: 1.3 }}>
                              {e.name}
                            </p>
                            <p style={{ margin: "3px 0 0", fontSize: 12, color: "#9a8f84" }}>
                              {TYPE_LABELS[e.type] ?? e.type}
                              {e.location ? ` \u00b7 ${e.location}` : ""}
                            </p>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                            <span style={{
                              fontSize: 10, fontWeight: 700,
                              padding: "3px 10px", borderRadius: 20,
                              background: sc.bg, color: sc.fg,
                            }}>
                              {STATUS_LABELS[e.status] ?? e.status}
                            </span>
                            {isUpcoming && jours !== null && (
                              <span style={{
                                fontSize: 10, fontWeight: 800,
                                color: jours <= 7 ? "#D4775A" : "#6f6a61",
                              }}>
                                {jours === 0 ? "Aujourd\u2019hui" : jours === 1 ? "Demain" : `J-${jours}`}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Bottom row */}
                        <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 12, color: "#6f6a61", display: "inline-flex", alignItems: "center", gap: 4 }}>
                            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#9a8f84" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                            </svg>
                            {fmtDate(e.date)}{e.time ? ` \u00b7 ${fmtTime(e.time)}` : ""}
                          </span>
                          {e.covers > 0 && (
                            <span style={{ fontSize: 12, fontWeight: 700, color: "#2f3a33", display: "inline-flex", alignItems: "center", gap: 4 }}>
                              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#9a8f84" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                              </svg>
                              {e.covers} couverts
                            </span>
                          )}
                          {e.sell_price != null && e.sell_price > 0 && (
                            <span style={{
                              fontSize: 13, fontWeight: 800, color: "#4a6741",
                              marginLeft: "auto",
                            }}>
                              {e.sell_price.toLocaleString("fr-FR")} \u20ac
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

      {/* ═══ FAB — Nouvel evenement ═══ */}
      <Link
        href="/evenements/new"
        style={{
          position: "fixed",
          bottom: 80,
          right: 20,
          width: 52,
          height: 52,
          borderRadius: "50%",
          background: "#D4775A",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 4px 16px rgba(212,119,90,0.4)",
          textDecoration: "none",
          fontSize: 28,
          fontWeight: 300,
          lineHeight: 1,
          zIndex: 50,
        }}
        title="Nouvel evenement"
      >
        +
      </Link>
    </>
    </RequireRole>
  );
}

/* ── Styles ── */

const kpiCard: React.CSSProperties = {
  background: "#fff",
  borderRadius: 12,
  border: "1px solid #ddd6c8",
  padding: "14px 12px",
  textAlign: "center",
};

const kpiValue: React.CSSProperties = {
  fontSize: 24,
  fontWeight: 800,
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
  color: "#2f3a33",
  lineHeight: 1.1,
};

const kpiLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#6f6a61",
  textTransform: "uppercase",
  letterSpacing: 0.5,
  marginTop: 2,
};

const kpiSub: React.CSSProperties = {
  fontSize: 10,
  color: "#b0a894",
  marginTop: 1,
};

const calNavBtn: React.CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: 8,
  border: "1px solid #ddd6c8",
  background: "#fff",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 700,
  color: "#6f6a61",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
