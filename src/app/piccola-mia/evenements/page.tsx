"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppNav } from "@/components/AppNav";
import { HubTile } from "@/components/HubTile";
import { useProfile } from "@/lib/ProfileContext";
import { supabase } from "@/lib/supabaseClient";
import { TOKENS } from "@/lib/tokens";

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
  const { isGroupAdmin } = useProfile();
  const [events, setEvents] = useState<UpcomingEvent[]>([]);
  const [total, setTotal] = useState(0);
  const accent = TOKENS.color.jauneDark;

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
    <div style={{ minHeight: "100dvh", background: TOKENS.color.creme }}>
      <AppNav />
      <div style={{ maxWidth: 600, margin: "0 auto", padding: "24px 16px 40px" }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1 style={heading}>Evenements</h1>
            <p style={subheading}>Piccola Mia</p>
          </div>
          {isGroupAdmin && (
            <Link href="/evenements/new" style={newBtn}>+ Evenement</Link>
          )}
        </div>

        {/* Admin tiles */}
        {isGroupAdmin && (
          <div style={{ display: "grid", gap: 12, marginTop: 24 }}>
            <HubTile href="/evenements/new" label="Creer un devis" sub="Nouveau devis evenement" accent={accent} />
            <HubTile href="/evenements" label="Evenements" badge={total > 0 ? `${total} a venir` : undefined} accent={accent} />
            <HubTile href="/evenements/clients" label="Clients" sub="Carnet de contacts" accent={accent} />
          </div>
        )}

        {/* Upcoming events list — visible to all */}
        {events.length > 0 && (
          <div style={{ marginTop: isGroupAdmin ? 20 : 24 }}>
            <p style={sectionLabel}>Prochains evenements</p>
            <div style={{ display: "grid", gap: 8 }}>
              {events.map(ev => (
                <Link
                  key={ev.id}
                  href={isGroupAdmin ? `/evenements/${ev.id}` : "#"}
                  style={{ textDecoration: "none", color: "inherit", pointerEvents: isGroupAdmin ? "auto" : "none" }}
                >
                  <div style={eventRow}>
                    <div>
                      <span style={{ fontWeight: 700, fontSize: 13, color: TOKENS.color.dark }}>{ev.name}</span>
                      {ev.covers > 0 && (
                        <span style={{ fontSize: 11, color: TOKENS.color.muted, marginLeft: 8 }}>{ev.covers} couv.</span>
                      )}
                    </div>
                    <span style={{ fontSize: 11, color: TOKENS.color.muted }}>
                      {ev.date ? fmtDate(ev.date) : "\u2014"}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {events.length === 0 && !isGroupAdmin && (
          <p style={{ marginTop: 40, textAlign: "center", fontSize: 13, color: TOKENS.color.muted }}>
            Aucun evenement a venir
          </p>
        )}
      </div>
    </div>
  );
}

const heading: React.CSSProperties = {
  margin: 0,
  fontSize: 28,
  fontWeight: 700,
  fontFamily: TOKENS.font.oswald,
  color: TOKENS.color.dark,
  letterSpacing: 1,
  textTransform: "uppercase",
};

const subheading: React.CSSProperties = {
  margin: "4px 0 0",
  fontSize: 13,
  color: TOKENS.color.jauneDark,
  fontWeight: 600,
};

const newBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  height: 34,
  padding: "0 16px",
  borderRadius: 20,
  background: TOKENS.color.jaune,
  color: TOKENS.color.dark,
  fontSize: 12,
  fontWeight: 700,
  textDecoration: "none",
  whiteSpace: "nowrap",
};

const sectionLabel: React.CSSProperties = {
  margin: "0 0 10px 4px",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 2,
  textTransform: "uppercase",
  color: "#b0a894",
  fontFamily: TOKENS.font.oswald,
};

const eventRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "10px 14px",
  background: TOKENS.color.white,
  borderRadius: 10,
  border: `1px solid ${TOKENS.color.border}60`,
};
