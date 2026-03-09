"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { NavBar } from "@/components/NavBar";

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

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  prospect: { bg: "rgba(139,26,26,0.10)", fg: "#8B1A1A" },
  confirme: { bg: "rgba(74,103,65,0.12)", fg: "#4a6741" },
  en_cours: { bg: "rgba(37,99,235,0.10)", fg: "#2563eb" },
  termine: { bg: "rgba(107,114,128,0.10)", fg: "#6B7280" },
  annule: { bg: "rgba(220,38,38,0.10)", fg: "#DC2626" },
};

const TYPE_LABELS: Record<string, string> = {
  mariage: "Mariage",
  seminaire: "Séminaire",
  anniversaire: "Anniversaire",
  repas_staff: "Repas staff",
  autre: "Autre",
};

const CAL_BADGE_COLORS: Record<string, string> = {
  prospect: "#9CA3AF",
  confirme: "#4a6741",
  en_cours: "#D97706",
  termine: "#8B1A1A",
  annule: "#DC2626",
};

const MONTH_NAMES = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

const DAY_HEADERS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function getCalendarDays(year: number, month: number): (number | null)[] {
  const first = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0).getDate();
  // Monday = 0, Sunday = 6
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
    year: "numeric",
  });
}

function fmtTime(t: string | null) {
  if (!t) return "";
  return t.slice(0, 5);
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

type ViewMode = "list" | "calendar";

export default function EventsPage() {
  const router = useRouter();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"upcoming" | "all" | "past">("upcoming");
  const [view, setView] = useState<ViewMode>("list");

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

  // Events grouped by date for calendar
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

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("events")
        .select("id,name,type,date,time,location,covers,establishment,status,contact_name,sell_price")
        .order("date", { ascending: true, nullsFirst: false });
      setEvents(data ?? []);
      setLoading(false);
    })();
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const filtered = events.filter((e) => {
    if (filter === "upcoming") return !e.date || e.date >= today;
    if (filter === "past") return e.date && e.date < today;
    return true;
  });

  const overlaps = detectOverlaps(events);

  return (
    <>
      <NavBar
        backHref="/"
        backLabel="Dashboard"
        primaryAction={
          <Link href="/evenements/new" className="btn btnPrimary" style={{ background: "#8B1A1A", borderColor: "#8B1A1A" }}>
            + Événement
          </Link>
        }
      />
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "12px 16px 40px" }}>
        <h1 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#2f3a33", margin: "0 0 16px" }}>
          Événements
        </h1>

        {/* Toggle Liste / Calendrier */}
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          {(["list", "calendar"] as ViewMode[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: "6px 14px",
                borderRadius: 8,
                border: "1.5px solid",
                borderColor: view === v ? "#8B1A1A" : "#e5ddd0",
                background: view === v ? "rgba(139,26,26,0.08)" : "#fff",
                color: view === v ? "#8B1A1A" : "#6f6a61",
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {v === "list" ? "Liste" : "Calendrier"}
            </button>
          ))}
        </div>

        {/* Filtres (list view only) */}
        {view === "list" && (
          <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
            {(["upcoming", "all", "past"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: "6px 14px",
                  borderRadius: 8,
                  border: "1px solid #e5ddd0",
                  background: filter === f ? "#8B1A1A" : "#fff",
                  color: filter === f ? "#fff" : "#2f3a33",
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                {f === "upcoming" ? "À venir" : f === "all" ? "Tous" : "Passés"}
              </button>
            ))}
          </div>
        )}

        {loading && <p className="muted">Chargement…</p>}

        {/* ═══ CALENDAR VIEW ═══ */}
        {!loading && view === "calendar" && (() => {
          const cells = getCalendarDays(calYear, calMonth);
          const todayStr = new Date().toISOString().slice(0, 10);
          return (
            <div>
              {/* Month nav */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                marginBottom: 12,
              }}>
                <button onClick={prevMonth} style={{
                  width: 36, height: 36, borderRadius: 10, border: "1px solid #e5ddd0",
                  background: "#fff", cursor: "pointer", fontSize: 16, fontWeight: 700, color: "#6f6a61",
                }}>←</button>
                <span style={{ fontSize: 16, fontWeight: 800, color: "#2f3a33" }}>
                  {MONTH_NAMES[calMonth]} {calYear}
                </span>
                <button onClick={nextMonth} style={{
                  width: 36, height: 36, borderRadius: 10, border: "1px solid #e5ddd0",
                  background: "#fff", cursor: "pointer", fontSize: 16, fontWeight: 700, color: "#6f6a61",
                }}>→</button>
              </div>

              {/* Day headers */}
              <div style={{
                display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 0,
                background: "#fff", border: "1px solid #e5ddd0", borderRadius: "10px 10px 0 0",
                overflow: "hidden",
              }}>
                {DAY_HEADERS.map((d) => (
                  <div key={d} style={{
                    padding: "8px 0", textAlign: "center",
                    fontSize: 11, fontWeight: 700, color: "#9a8f84",
                    textTransform: "uppercase", letterSpacing: 0.5,
                    borderBottom: "1px solid #e5ddd0",
                  }}>{d}</div>
                ))}
              </div>

              {/* Day cells */}
              <div style={{
                display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 0,
                background: "#fff", border: "1px solid #e5ddd0", borderTop: "none",
                borderRadius: "0 0 10px 10px", overflow: "hidden",
              }}>
                {cells.map((day, i) => {
                  if (day == null) {
                    return <div key={`empty-${i}`} style={{
                      minHeight: 70, borderBottom: "1px solid #f0ebe3", borderRight: i % 7 < 6 ? "1px solid #f0ebe3" : "none",
                      background: "#faf7f2",
                    }} />;
                  }
                  const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                  const dayEvents = eventsByDate.get(dateStr) ?? [];
                  const isToday = dateStr === todayStr;
                  const isWeekend = i % 7 >= 5;
                  return (
                    <div key={dateStr} style={{
                      minHeight: 70, padding: "4px 5px",
                      borderBottom: "1px solid #f0ebe3",
                      borderRight: i % 7 < 6 ? "1px solid #f0ebe3" : "none",
                      background: isToday ? "rgba(139,26,26,0.04)" : isWeekend ? "#faf7f2" : "#fff",
                    }}>
                      <div style={{
                        fontSize: 12, fontWeight: isToday ? 800 : 500,
                        color: isToday ? "#8B1A1A" : "#6f6a61",
                        marginBottom: 3,
                      }}>
                        {day}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        {dayEvents.map((ev) => (
                          <button
                            key={ev.id}
                            onClick={() => router.push(`/evenements/${ev.id}`)}
                            title={`${ev.name} — ${STATUS_LABELS[ev.status] ?? ev.status}`}
                            style={{
                              display: "block", width: "100%", padding: "2px 5px",
                              borderRadius: 4, border: "none", cursor: "pointer",
                              background: CAL_BADGE_COLORS[ev.status] ?? "#9CA3AF",
                              color: "#fff", fontSize: 10, fontWeight: 700,
                              textAlign: "left", lineHeight: 1.3,
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            }}
                          >
                            {ev.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Legend */}
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12, fontSize: 11, color: "#6f6a61" }}>
                {(["prospect", "confirme", "en_cours", "termine", "annule"] as const).map((s) => (
                  <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <span style={{
                      width: 10, height: 10, borderRadius: 3,
                      background: CAL_BADGE_COLORS[s], display: "inline-block",
                    }} />
                    {STATUS_LABELS[s]}
                  </span>
                ))}
              </div>
            </div>
          );
        })()}

        {/* ═══ LIST VIEW ═══ */}
        {!loading && view === "list" && filtered.length === 0 && (
          <div className="card" style={{ textAlign: "center", padding: "2rem" }}>
            <p className="muted">Aucun événement</p>
            <Link href="/evenements/new" className="btn btnPrimary" style={{ marginTop: 12, background: "#8B1A1A", borderColor: "#8B1A1A" }}>
              Créer le premier
            </Link>
          </div>
        )}

        {!loading && view === "list" && (
          <div style={{ display: "grid", gap: 10 }}>
            {filtered.map((e) => {
              const sc = STATUS_COLORS[e.status] ?? STATUS_COLORS.prospect;
              const isOverlap = overlaps.has(e.id);
              return (
                <Link key={e.id} href={`/evenements/${e.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                  <div
                    className="card"
                    style={{
                      borderLeft: `4px solid ${sc.fg}`,
                      cursor: "pointer",
                      position: "relative",
                      ...(isOverlap ? { boxShadow: "inset 0 0 0 2px rgba(220,38,38,0.35)" } : {}),
                    }}
                  >
                    {isOverlap && (
                      <span style={{
                        position: "absolute", top: 8, right: 10,
                        fontSize: 10, fontWeight: 800, color: "#DC2626",
                        background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.25)",
                        borderRadius: 6, padding: "2px 6px",
                      }}>
                        Chevauchement
                      </span>
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <p style={{ margin: 0, fontWeight: 800, fontSize: 15, color: "#2f3a33" }}>
                          {e.name}
                        </p>
                        <p className="muted" style={{ margin: "2px 0 0", fontSize: 12 }}>
                          {TYPE_LABELS[e.type] ?? e.type}
                          {e.location ? ` · ${e.location}` : ""}
                          {e.contact_name ? ` · ${e.contact_name}` : ""}
                        </p>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <span style={{
                          display: "inline-block",
                          fontSize: 10, fontWeight: 700,
                          padding: "2px 8px", borderRadius: 6,
                          background: sc.bg, color: sc.fg,
                        }}>
                          {STATUS_LABELS[e.status] ?? e.status}
                        </span>
                      </div>
                    </div>

                    <div style={{ marginTop: 8, display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12 }}>
                      <span style={{ color: "#6f6a61" }}>
                        {fmtDate(e.date)}
                        {e.time ? ` · ${fmtTime(e.time)}` : ""}
                      </span>
                      {e.covers > 0 && (
                        <span style={{ fontWeight: 700, color: "#2f3a33" }}>
                          {e.covers} couverts
                        </span>
                      )}
                      {e.sell_price != null && e.sell_price > 0 && (
                        <span style={{ fontWeight: 700, color: "#4a6741" }}>
                          {e.sell_price.toLocaleString("fr-FR")} €
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
