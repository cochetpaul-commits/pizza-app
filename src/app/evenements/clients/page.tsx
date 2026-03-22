"use client";

import { useEffect, useState } from "react";
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
  anniversaire: "Anniversaire",
  bapteme: "Bapt\u00eame",
};

function fmtDate(iso: string | null) {
  if (!iso) return "\u2014";
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

export default function ParticuliersPage() {
  const { current: etab } = useEtablissement();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"upcoming" | "all" | "past">("upcoming");

  const etabKey = etab?.slug?.includes("bello") ? "bellomio" : etab?.slug?.includes("piccola") ? "piccola" : null;

  useEffect(() => {
    (async () => {
      const q = supabase
        .from("events")
        .select("id,name,type,date,time,location,covers,establishment,status,contact_name,sell_price")
        .in("type", ["mariage", "anniversaire", "bapteme"])
        .order("date", { ascending: true, nullsFirst: false });
      if (etabKey) q.or(`establishment.eq.${etabKey},establishment.eq.both,establishment.is.null`);
      const { data } = await q;
      setEvents(data ?? []);
      setLoading(false);
    })();
  }, [etabKey]);

  const today = new Date().toISOString().slice(0, 10);
  const filtered = events.filter((e) => {
    if (filter === "upcoming") return !e.date || e.date >= today;
    if (filter === "past") return e.date && e.date < today;
    return true;
  });

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "12px 16px 40px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 700, fontFamily: "var(--font-oswald), 'Oswald', sans-serif", letterSpacing: 1.5, textTransform: "uppercase" as const, color: "#2f3a33", margin: 0 }}>
            Particuliers
          </h1>
          <Link
            href="/evenements/new"
            style={{
              background: "#D4775A",
              color: "#fff",
              border: "none",
              borderRadius: 20,
              padding: "8px 20px",
              fontSize: 13,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            Nouvel evenement
          </Link>
        </div>

        {/* Filtres */}
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

        {loading && <p className="muted">Chargement...</p>}

        {!loading && filtered.length === 0 && (
          <div className="card" style={{ textAlign: "center", padding: "2rem" }}>
            <p className="muted">Aucun evenement particulier</p>
            <Link href="/evenements/new" className="btn btnPrimary" style={{ marginTop: 12, background: "#D4775A", borderColor: "#D4775A" }}>
              Creer le premier
            </Link>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div style={{ display: "grid", gap: 10 }}>
            {filtered.map((e) => {
              const sc = STATUS_COLORS[e.status] ?? STATUS_COLORS.prospect;
              return (
                <Link key={e.id} href={`/evenements/${e.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                  <div className="card" style={{ borderLeft: `4px solid ${sc.fg}`, cursor: "pointer" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <p style={{ margin: 0, fontWeight: 800, fontSize: 15, color: "#2f3a33" }}>{e.name}</p>
                        <p className="muted" style={{ margin: "2px 0 0", fontSize: 12 }}>
                          {TYPE_LABELS[e.type] ?? e.type}
                          {e.location ? ` \u00b7 ${e.location}` : ""}
                          {e.contact_name ? ` \u00b7 ${e.contact_name}` : ""}
                        </p>
                      </div>
                      <span style={{
                        display: "inline-block",
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: 6,
                        background: sc.bg,
                        color: sc.fg,
                      }}>
                        {STATUS_LABELS[e.status] ?? e.status}
                      </span>
                    </div>
                    <div style={{ marginTop: 8, display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12 }}>
                      <span style={{ color: "#6f6a61" }}>
                        {fmtDate(e.date)}
                        {e.time ? ` \u00b7 ${fmtTime(e.time)}` : ""}
                      </span>
                      {e.covers > 0 && (
                        <span style={{ fontWeight: 700, color: "#2f3a33" }}>{e.covers} couverts</span>
                      )}
                      {e.sell_price != null && e.sell_price > 0 && (
                        <span style={{ fontWeight: 700, color: "#4a6741" }}>
                          {e.sell_price.toLocaleString("fr-FR")} \u20ac
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
    </RequireRole>
  );
}
