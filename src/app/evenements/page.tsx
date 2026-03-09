"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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

export default function EventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"upcoming" | "all" | "past">("upcoming");

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

        {/* Filtres */}
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

        {loading && <p className="muted">Chargement…</p>}

        {!loading && filtered.length === 0 && (
          <div className="card" style={{ textAlign: "center", padding: "2rem" }}>
            <p className="muted">Aucun événement</p>
            <Link href="/evenements/new" className="btn btnPrimary" style={{ marginTop: 12, background: "#8B1A1A", borderColor: "#8B1A1A" }}>
              Créer le premier
            </Link>
          </div>
        )}

        {/* Liste */}
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
      </div>
    </>
  );
}
