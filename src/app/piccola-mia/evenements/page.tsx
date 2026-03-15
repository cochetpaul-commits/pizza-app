"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AppNav } from "@/components/AppNav";
import { useProfile } from "@/lib/ProfileContext";
import { supabase } from "@/lib/supabaseClient";
import { T } from "@/lib/tokens";

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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: "DM Sans, sans-serif", fontSize: 9, fontWeight: 700,
      letterSpacing: "0.18em", textTransform: "uppercase",
      color: T.mutedLight, marginBottom: 10, marginTop: 4,
    }}>{children}</div>
  );
}

function Tile({ href, icon, title, sub, value, accent, wide }: {
  href: string; icon?: string; title: string; sub?: string;
  value?: string; accent?: string; wide?: boolean;
}) {
  return (
    <Link href={href} style={{ textDecoration: "none", gridColumn: wide ? "span 2" : "span 1" }}>
      <div style={{
        background: T.white, borderRadius: 16, padding: "16px 18px",
        border: `1.5px solid ${T.border}`,
        borderLeft: `3px solid ${accent || T.jaune}`,
        minHeight: 90, display: "flex", flexDirection: "column",
        justifyContent: "space-between", cursor: "pointer",
        transition: "all 0.2s", boxShadow: T.tileShadow,
      }}
        onMouseEnter={e => {
          e.currentTarget.style.boxShadow = T.tileShadowHover;
          e.currentTarget.style.borderColor = accent || T.jaune;
        }}
        onMouseLeave={e => {
          e.currentTarget.style.boxShadow = T.tileShadow;
          e.currentTarget.style.borderColor = T.border;
          e.currentTarget.style.borderLeftColor = accent || T.jaune;
        }}
      >
        <div>
          {icon && <div style={{ fontSize: 20, marginBottom: 8 }}>{icon}</div>}
          <div style={{
            fontFamily: "Oswald, sans-serif", fontWeight: 600,
            fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase",
            color: accent || T.jauneDark,
          }}>{title}</div>
          {sub && <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 11, color: T.muted, marginTop: 3, lineHeight: 1.4 }}>{sub}</div>}
        </div>
        {value && (
          <div style={{ fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 28, color: T.dark, lineHeight: 1, marginTop: 8 }}>
            {value}
          </div>
        )}
      </div>
    </Link>
  );
}

export default function EvenementsHubPM() {
  const { isGroupAdmin } = useProfile();
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
    <div style={{ minHeight: "100dvh", background: T.creme, animation: "slideUp 0.25s ease" }}>
      <AppNav />
      <div style={{ padding: "20px 16px 40px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
          <div>
            <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 11, color: T.muted, letterSpacing: 2, textTransform: "uppercase" }}>Piccola Mia</div>
            <div style={{ fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 32, color: T.dark }}>Evenements</div>
          </div>
          {isGroupAdmin && (
            <Link href="/evenements/new" style={{
              display: "inline-flex", alignItems: "center", height: 34,
              padding: "0 16px", borderRadius: 20, background: T.jaune,
              color: T.dark, fontSize: 12, fontWeight: 700, textDecoration: "none",
            }}>+ Evenement</Link>
          )}
        </div>

        {/* Admin tiles */}
        {isGroupAdmin && (
          <>
            <SectionLabel>Actions</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
              <Tile href="/evenements/new"     icon="&#x1F4DD;" title="Creer un devis"  sub="Nouveau devis evenement" wide />
              <Tile href="/evenements"         icon="&#x1F4C5;" title="Evenements"       value={total > 0 ? String(total) : undefined} sub="A venir" />
              <Tile href="/evenements/clients" icon="&#x1F465;" title="Clients"          sub="Carnet de contacts" />
            </div>
          </>
        )}

        {/* Upcoming events — visible to all */}
        {events.length > 0 && (
          <>
            <SectionLabel>Prochains evenements</SectionLabel>
            <div style={{ display: "grid", gap: 8 }}>
              {events.map(ev => (
                <Link
                  key={ev.id}
                  href={isGroupAdmin ? `/evenements/${ev.id}` : "#"}
                  style={{ textDecoration: "none", color: "inherit", pointerEvents: isGroupAdmin ? "auto" : "none" }}
                >
                  <div style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "12px 16px", background: T.white, borderRadius: 12,
                    border: `1.5px solid ${T.border}`, borderLeft: `3px solid ${T.jaune}`,
                    boxShadow: T.tileShadow,
                  }}>
                    <div>
                      <span style={{ fontWeight: 700, fontSize: 13, color: T.dark }}>{ev.name}</span>
                      {ev.covers > 0 && (
                        <span style={{ fontSize: 11, color: T.muted, marginLeft: 8 }}>{ev.covers} couv.</span>
                      )}
                    </div>
                    <span style={{ fontSize: 11, color: T.muted }}>
                      {ev.date ? fmtDate(ev.date) : "\u2014"}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}

        {events.length === 0 && !isGroupAdmin && (
          <p style={{ marginTop: 40, textAlign: "center", fontSize: 13, color: T.muted }}>
            Aucun evenement a venir
          </p>
        )}
      </div>
    </div>
  );
}
