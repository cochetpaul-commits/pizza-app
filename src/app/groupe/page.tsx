"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { RequireRole } from "@/components/RequireRole";
import { AppNav } from "@/components/AppNav";
import { supabase } from "@/lib/supabaseClient";
import { fetchApi } from "@/lib/fetchApi";
import { TOKENS } from "@/lib/tokens";

type CaData = { totalSales: number; guestsNumber: number } | null;
type UpcomingEvent = { id: string; name: string; date: string | null; status: string; covers: number };

function fmtEur(n: number) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtDateShort(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export default function GroupePage() {
  const [ca, setCa] = useState<CaData>(null);
  const [events, setEvents] = useState<UpcomingEvent[]>([]);
  const [notifCount, setNotifCount] = useState(0);

  useEffect(() => {
    async function fetchCa() {
      try {
        const res = await fetchApi("/api/popina/ca-jour");
        if (!res.ok) return;
        const d = await res.json();
        setCa({ totalSales: d.totalSales ?? 0, guestsNumber: d.guestsNumber ?? 0 });
      } catch { /* silencieux */ }
    }
    fetchCa();
  }, []);

  useEffect(() => {
    async function fetchEvents() {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from("events")
        .select("id,name,date,status,covers")
        .gte("date", today)
        .not("status", "in", '("termine","annule")')
        .order("date", { ascending: true })
        .limit(4);
      setEvents((data ?? []) as UpcomingEvent[]);
    }
    fetchEvents();
  }, []);

  useEffect(() => {
    async function fetchNotifs() {
      try {
        const { count } = await supabase
          .from("notifications")
          .select("*", { count: "exact", head: true })
          .eq("statut", "non_lu");
        setNotifCount(count ?? 0);
      } catch { /* table may not exist yet */ }
    }
    fetchNotifs();
  }, []);

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <div style={{ minHeight: "100dvh", background: TOKENS.color.creme }}>
        <AppNav />

        {/* Hero */}
        <div style={{
          background: TOKENS.color.creme,
          borderBottom: `2px solid ${TOKENS.color.border}`,
          padding: "24px 20px",
          marginBottom: 0,
        }}>
          <div style={{ maxWidth: 600, margin: "0 auto", display: "flex", alignItems: "center", gap: 14 }}>
            <Image
              src="/logo-ifratelli.png"
              alt="iFratelli Group"
              width={56}
              height={56}
              style={{ height: 56, width: "auto", objectFit: "contain" }}
              priority
            />
            <div>
              <span style={{
                fontFamily: TOKENS.font.display,
                fontSize: 22,
                fontWeight: 600,
                fontStyle: "italic",
                color: TOKENS.color.dark,
                lineHeight: 1.1,
              }}>
                iFratelli
              </span>
              <span style={{
                display: "block",
                fontFamily: TOKENS.font.body,
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: 3,
                textTransform: "uppercase",
                color: TOKENS.color.muted,
              }}>
                GROUP
              </span>
            </div>
            <span style={adminBadge}>ADMIN</span>
          </div>
        </div>

        <div style={{ maxWidth: 600, margin: "0 auto", padding: "24px 16px 40px" }}>

          {/* CA Groupe */}
          <div style={kpiBlock}>
            <p style={kpiLabel}>CA GROUPE AUJOURD&apos;HUI</p>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 8 }}>
              <span style={kpiValue}>
                {ca ? `${fmtEur(ca.totalSales)} \u20AC` : "\u2014"}
              </span>
              {ca && ca.guestsNumber > 0 && (
                <span style={{ fontSize: 13, color: "#999" }}>
                  {ca.guestsNumber} couverts
                </span>
              )}
            </div>
          </div>

          {/* Alertes / Demandes */}
          <div style={{
            ...whiteCard,
            marginBottom: 20,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={cardTitle}>Alertes / Demandes</span>
              {notifCount > 0 && (
                <span style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minWidth: 20,
                  height: 20,
                  borderRadius: 10,
                  background: "#D4775A",
                  color: "#fff",
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "0 6px",
                }}>
                  {notifCount}
                </span>
              )}
            </div>
            <span style={{ fontSize: 12, color: "#999" }}>
              {notifCount === 0 ? "Aucune alerte" : `${notifCount} non lue${notifCount > 1 ? "s" : ""}`}
            </span>
          </div>

          {/* Etablissements */}
          <p style={sectionLabel}>ETABLISSEMENTS</p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
            {/* Bello Mio */}
            <Link href="/bello-mio" style={{ textDecoration: "none", color: "inherit" }}>
              <div style={etabCard("#D4775A")}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
                  <span style={etabName}>Bello Mio</span>
                </div>
                {ca && (
                  <span style={{ fontSize: 20, fontWeight: 700, color: "#D4775A", fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif" }}>
                    {fmtEur(ca.totalSales)} &euro;
                  </span>
                )}
                <span style={etabPill("#D4775A")}>Ouvrir &rarr;</span>
              </div>
            </Link>

            {/* Piccola Mia */}
            <Link href="/piccola-mia" style={{ textDecoration: "none", color: "inherit" }}>
              <div style={{
                ...etabCard("#F5E642"),
                backgroundImage: "repeating-linear-gradient(90deg, #fff 0px, #fff 10px, #FAF0A0 10px, #FAF0A0 20px)",
                backgroundSize: "100% 6px",
                backgroundPosition: "0 0",
                backgroundRepeat: "no-repeat",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#F5E642", display: "inline-block" }} />
                  <span style={etabName}>Piccola Mia</span>
                </div>
                <p style={{ margin: "0 0 8px", fontSize: 12, color: "#999" }}>A configurer</p>
                <span style={etabPill("#b8a800")}>Ouvrir &rarr;</span>
              </div>
            </Link>
          </div>

          {/* Evenements */}
          {events.length > 0 && (
            <>
              <p style={sectionLabel}>EVENEMENTS</p>
              <Link href="/evenements" style={{ textDecoration: "none", color: "inherit" }}>
                <div style={whiteCard}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <span style={cardTitle}>Evenements</span>
                    <span style={badgeSmall}>{events.length} a venir</span>
                  </div>
                  <div style={{ display: "grid", gap: 6 }}>
                    {events.map(ev => (
                      <div key={ev.id} style={eventRow}>
                        <span style={{ fontWeight: 700, fontSize: 12, color: "#2f3a33" }}>{ev.name}</span>
                        <span style={{ fontSize: 10, color: "#999" }}>
                          {ev.date ? fmtDateShort(ev.date) : "\u2014"}
                          {ev.covers > 0 ? ` \u00B7 ${ev.covers} couv.` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </Link>
            </>
          )}

          {/* Factures */}
          <p style={sectionLabel}>GESTION</p>
          <div style={{ display: "grid", gap: 12 }}>
            <Link href="/invoices" style={{ textDecoration: "none", color: "inherit" }}>
              <div style={whiteCard}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <span style={cardTitle}>Factures</span>
                    <p style={{ margin: "3px 0 0", fontSize: 12, color: "#999" }}>Import fournisseurs</p>
                  </div>
                  <span style={gestionPill}>Ouvrir &rarr;</span>
                </div>
              </div>
            </Link>

            <Link href="/admin/utilisateurs" style={{ textDecoration: "none", color: "inherit" }}>
              <div style={whiteCard}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <span style={cardTitle}>Admin</span>
                    <p style={{ margin: "3px 0 0", fontSize: 12, color: "#999" }}>Utilisateurs & roles</p>
                  </div>
                  <span style={gestionPill}>Ouvrir &rarr;</span>
                </div>
              </div>
            </Link>
          </div>

        </div>
      </div>
    </RequireRole>
  );
}

// Styles

const adminBadge: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: 1.5,
  padding: "3px 8px",
  borderRadius: 6,
  background: "rgba(212,119,90,0.15)",
  color: "#D4775A",
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
};


const kpiBlock: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #ddd6c8",
  borderRadius: 16,
  padding: "20px 24px",
  marginBottom: 20,
};

const kpiLabel: React.CSSProperties = {
  margin: 0,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 2,
  textTransform: "uppercase",
  color: "#999",
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
};

const kpiValue: React.CSSProperties = {
  fontSize: 36,
  fontWeight: 700,
  color: "#1a1a1a",
  fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
  lineHeight: 1,
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

function etabCard(accent: string): React.CSSProperties {
  return {
    background: "#fff",
    borderRadius: 14,
    padding: "16px 18px",
    borderTop: `4px solid ${accent}`,
    boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
    display: "flex",
    flexDirection: "column",
    minHeight: 120,
    cursor: "pointer",
  };
}

const etabName: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: "#1a1a1a",
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
  letterSpacing: 0.5,
};

function etabPill(color: string): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    alignSelf: "flex-start",
    height: 26,
    padding: "0 12px",
    borderRadius: 20,
    background: `${color}14`,
    border: `1px solid ${color}30`,
    color,
    fontSize: 10,
    fontWeight: 700,
    marginTop: "auto",
  };
}

const whiteCard: React.CSSProperties = {
  background: "#fff",
  borderRadius: 14,
  padding: "18px 20px",
  boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
};

const cardTitle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
  color: "#1a1a1a",
  letterSpacing: 0.5,
  textTransform: "uppercase",
};

const badgeSmall: React.CSSProperties = {
  display: "inline-block",
  fontSize: 10,
  fontWeight: 700,
  padding: "2px 7px",
  borderRadius: 6,
  background: "rgba(212,119,90,0.10)",
  color: "#D4775A",
};

const eventRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "7px 12px",
  background: "rgba(245,237,228,0.5)",
  borderRadius: 10,
  border: "1px solid rgba(221,214,200,0.25)",
};

const gestionPill: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  height: 28,
  padding: "0 12px",
  borderRadius: 20,
  background: "rgba(160,132,92,0.10)",
  color: "#A0845C",
  fontSize: 11,
  fontWeight: 700,
  whiteSpace: "nowrap",
};
