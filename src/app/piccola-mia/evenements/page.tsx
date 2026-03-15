"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppNav } from "@/components/AppNav";
import { RequireRole } from "@/components/RequireRole";
import { supabase } from "@/lib/supabaseClient";

type UpcomingEvent = {
  id: string;
  name: string;
  date: string | null;
  status: string;
  covers: number;
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

export default function EvenementsHubPM() {
  const [events, setEvents] = useState<UpcomingEvent[]>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    async function load() {
      const today = new Date().toISOString().slice(0, 10);
      const { data, count } = await supabase
        .from("events")
        .select("id,name,date,status,covers", { count: "exact" })
        .gte("date", today)
        .not("status", "in", '("termine","annule")')
        .order("date", { ascending: true })
        .limit(5);
      setEvents((data ?? []) as UpcomingEvent[]);
      setTotal(count ?? 0);
    }
    load();
  }, []);

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <div style={{ minHeight: "100dvh", background: "#f2ede4" }}>
        <AppNav />
        <div style={{ maxWidth: 600, margin: "0 auto", padding: "24px 16px 40px" }}>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <h1 style={heading}>Evenements</h1>
              <p style={subheading}>Piccola Mia</p>
            </div>
            <Link href="/evenements/new" style={newBtn}>+ Evenement</Link>
          </div>

          {/* Tiles */}
          <div style={{ display: "grid", gap: 12, marginTop: 24 }}>
            <Link href="/evenements/new" style={{ textDecoration: "none", color: "inherit" }}>
              <div style={tileStyle}>
                <div>
                  <p style={tileTitle}>Creer un devis</p>
                  <p style={tileSub}>Nouveau devis evenement</p>
                </div>
                <span style={pill}>Creer &rarr;</span>
              </div>
            </Link>

            <Link href="/evenements" style={{ textDecoration: "none", color: "inherit" }}>
              <div style={tileStyle}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <p style={tileTitle}>Evenements</p>
                  {total > 0 && <span style={badgeStyle}>{total} a venir</span>}
                </div>
                <span style={pill}>Voir &rarr;</span>
              </div>
            </Link>

            <Link href="/evenements/clients" style={{ textDecoration: "none", color: "inherit" }}>
              <div style={tileStyle}>
                <div>
                  <p style={tileTitle}>Clients</p>
                  <p style={tileSub}>Carnet de contacts</p>
                </div>
                <span style={pill}>Voir &rarr;</span>
              </div>
            </Link>
          </div>

          {/* Upcoming events list */}
          {events.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <p style={sectionLabel}>Prochains evenements</p>
              <div style={{ display: "grid", gap: 8 }}>
                {events.map(ev => (
                  <Link key={ev.id} href={`/evenements/${ev.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                    <div style={eventRow}>
                      <div>
                        <span style={{ fontWeight: 700, fontSize: 13, color: "#1a1a1a" }}>{ev.name}</span>
                        {ev.covers > 0 && (
                          <span style={{ fontSize: 11, color: "#999", marginLeft: 8 }}>{ev.covers} couv.</span>
                        )}
                      </div>
                      <span style={{ fontSize: 11, color: "#999" }}>
                        {ev.date ? fmtDate(ev.date) : "—"}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </RequireRole>
  );
}

const heading: React.CSSProperties = {
  margin: 0,
  fontSize: 28,
  fontWeight: 700,
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
  color: "#1a1a1a",
  letterSpacing: 1,
  textTransform: "uppercase",
};

const subheading: React.CSSProperties = {
  margin: "4px 0 0",
  fontSize: 13,
  color: "#b8a800",
  fontWeight: 600,
};

const newBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  height: 34,
  padding: "0 16px",
  borderRadius: 20,
  background: "#F5E642",
  color: "#1a1a1a",
  fontSize: 12,
  fontWeight: 700,
  textDecoration: "none",
  whiteSpace: "nowrap",
};

const tileStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 14,
  padding: "18px 20px",
  boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  cursor: "pointer",
};

const tileTitle: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  fontWeight: 700,
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
  color: "#1a1a1a",
  letterSpacing: 0.5,
  textTransform: "uppercase",
};

const tileSub: React.CSSProperties = {
  margin: "3px 0 0",
  fontSize: 12,
  color: "#999",
};

const pill: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  height: 28,
  padding: "0 12px",
  borderRadius: 20,
  background: "rgba(245,230,66,0.12)",
  border: "1px solid rgba(245,230,66,0.30)",
  color: "#b8a800",
  fontSize: 11,
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const badgeStyle: React.CSSProperties = {
  display: "inline-block",
  fontSize: 10,
  fontWeight: 700,
  padding: "3px 8px",
  borderRadius: 8,
  background: "rgba(245,230,66,0.15)",
  color: "#b8a800",
  border: "1px solid rgba(245,230,66,0.30)",
};

const sectionLabel: React.CSSProperties = {
  margin: "0 0 10px 4px",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 2,
  textTransform: "uppercase",
  color: "#b0a894",
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
};

const eventRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "10px 14px",
  background: "#fff",
  borderRadius: 10,
  border: "1px solid rgba(221,214,200,0.4)",
};
