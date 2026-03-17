"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { RequireRole } from "@/components/RequireRole";
import { AppNav } from "@/components/AppNav";
import { supabase } from "@/lib/supabaseClient";
import { fetchApi } from "@/lib/fetchApi";
import { T } from "@/lib/tokens";
import { TileIcon } from "@/components/TileIcon";
import { fetchPriceAlerts } from "@/lib/priceAlerts";

type CaData = { totalSales: number; guestsNumber: number } | null;
type UpcomingEvent = { id: string; name: string; date: string | null; status: string; covers: number };

function fmtEur(n: number) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtDateShort(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
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

export default function GroupePage() {
  const [ca, setCa] = useState<CaData>(null);
  const [caPM, setCaPM] = useState<number | null>(null);
  const [events, setEvents] = useState<UpcomingEvent[]>([]);
  const [notifCount, setNotifCount] = useState(0);
  const [pendingCommandes, setPendingCommandes] = useState(0);

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
    async function fetchCaPM() {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from("daily_sales")
        .select("ca_ttc")
        .eq("date", today)
        .eq("source", "kezia_pdf")
        .limit(1)
        .maybeSingle();
      setCaPM(data?.ca_ttc ?? 0);
    }
    fetchCaPM();
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
    async function fetchAlertCount() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      try {
        const alerts = await fetchPriceAlerts(supabase, user.id);
        setNotifCount(alerts.length);
      } catch { /* silencieux */ }
    }
    fetchAlertCount();
  }, []);

  useEffect(() => {
    async function fetchPending() {
      const { count } = await supabase
        .from("commande_sessions")
        .select("id", { count: "exact", head: true })
        .eq("status", "en_attente");
      setPendingCommandes(count ?? 0);
    }
    fetchPending();
  }, []);

  const caTotal = (ca?.totalSales ?? 0) + (caPM ?? 0);
  const hasCa = ca || caPM != null;

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <div style={{ minHeight: "100dvh", background: T.creme }}>
        <AppNav />

        <div style={{ maxWidth: 600, margin: "0 auto", padding: "24px 16px 40px" }}>

          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", gap: 16,
            marginBottom: 24, padding: "20px 18px",
            background: `linear-gradient(135deg, ${T.terracotta}12 0%, transparent 60%)`,
            borderRadius: 16,
          }}>
            <Image
              src="/logo-ifratelli.png"
              alt="iFratelli Group"
              width={64}
              height={64}
              style={{ height: 64, width: "auto", objectFit: "contain", mixBlendMode: "multiply" }}
              priority
            />
            <div>
              <h1 style={{
                margin: 0, fontSize: 26, fontWeight: 700,
                fontFamily: "Oswald, sans-serif",
                color: T.dark, letterSpacing: 1, lineHeight: 1.1,
              }}>
                iFratelli Group
              </h1>
              <div style={{ marginTop: 4, width: 40, height: 3, borderRadius: 2, background: T.terracotta }} />
            </div>
          </div>

          {/* CA Groupe */}
          <div style={{
            background: T.white, border: `1.5px solid ${T.border}`,
            borderRadius: 16, padding: "18px 22px", marginBottom: 16,
            borderLeft: `4px solid ${T.terracotta}`,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <p style={{
                  margin: 0, fontSize: 9, fontWeight: 700,
                  letterSpacing: "0.18em", textTransform: "uppercase",
                  color: T.muted, fontFamily: "DM Sans, sans-serif",
                }}>CA Groupe aujourd&apos;hui</p>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}>
                  <span style={{
                    fontSize: 34, fontWeight: 700, color: T.dark,
                    fontFamily: "Oswald, sans-serif", lineHeight: 1,
                  }}>
                    {hasCa ? `${fmtEur(caTotal)} \u20AC` : "\u2014"}
                  </span>
                  {ca && ca.guestsNumber > 0 && (
                    <span style={{ fontSize: 12, color: T.muted }}>{ca.guestsNumber} couv.</span>
                  )}
                </div>
              </div>
              <TileIcon name="pilotage" size={24} color={T.terracotta} />
            </div>

            {/* Mini breakdown */}
            {hasCa && (
              <div style={{ display: "flex", gap: 16, marginTop: 12, paddingTop: 10, borderTop: `1px solid ${T.border}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.terracotta, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: T.muted }}>Bello Mio</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: T.terracotta, fontFamily: "Oswald, sans-serif" }}>
                    {fmtEur(ca?.totalSales ?? 0)} &euro;
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.jauneDark, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: T.muted }}>Piccola Mia</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: T.jauneDark, fontFamily: "Oswald, sans-serif" }}>
                    {fmtEur(caPM ?? 0)} &euro;
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Alertes Prix */}
          <Link href="/variations-prix" style={{ textDecoration: "none", color: "inherit" }}>
            <div style={{
              background: T.white, borderRadius: 16, padding: "14px 18px",
              border: `1.5px solid ${T.border}`,
              borderLeft: `4px solid ${T.sauge}`,
              marginBottom: 20, cursor: "pointer",
              display: "flex", justifyContent: "space-between", alignItems: "center",
              boxShadow: T.tileShadow,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <TileIcon name="variations" size={20} color={T.sauge} />
                <span style={{
                  fontFamily: "Oswald, sans-serif", fontWeight: 600,
                  fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase",
                  color: T.sauge,
                }}>Alertes Prix</span>
                {notifCount > 0 && (
                  <span style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    minWidth: 20, height: 20, borderRadius: 10,
                    background: T.terracotta, color: "#fff",
                    fontSize: 10, fontWeight: 700, padding: "0 6px",
                  }}>
                    {notifCount}
                  </span>
                )}
              </div>
              <span style={{ fontSize: 11, color: T.muted }}>
                {notifCount === 0 ? "Aucune alerte" : `${notifCount} variation${notifCount > 1 ? "s" : ""}`}
              </span>
            </div>
          </Link>

          {/* Etablissements */}
          <SectionLabel>Etablissements</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
            <Link href="/bello-mio" style={{ textDecoration: "none", color: "inherit" }}>
              <div style={{
                background: T.white, borderRadius: 16, padding: "16px 18px",
                borderTop: `4px solid ${T.terracotta}`,
                boxShadow: T.tileShadow,
                display: "flex", flexDirection: "column", minHeight: 120, cursor: "pointer",
                transition: "all 0.2s",
              }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = T.tileShadowHover; }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = T.tileShadow; }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: T.green, display: "inline-block" }} />
                  <span style={{
                    fontSize: 14, fontWeight: 700, color: T.dark,
                    fontFamily: "Oswald, sans-serif", letterSpacing: 0.5,
                  }}>Bello Mio</span>
                </div>
                <span style={{
                  fontSize: 22, fontWeight: 700, color: T.terracotta,
                  fontFamily: "Oswald, sans-serif",
                }}>
                  {ca ? `${fmtEur(ca.totalSales)} \u20ac` : "\u2014"}
                </span>
                <span style={{
                  display: "inline-flex", alignItems: "center", alignSelf: "flex-start",
                  height: 26, padding: "0 12px", borderRadius: 20, marginTop: "auto",
                  background: `${T.terracotta}14`, border: `1px solid ${T.terracotta}30`,
                  color: T.terracotta, fontSize: 10, fontWeight: 700,
                }}>Ouvrir &rarr;</span>
              </div>
            </Link>

            <Link href="/piccola-mia" style={{ textDecoration: "none", color: "inherit" }}>
              <div style={{
                background: T.white, borderRadius: 16, padding: "16px 18px",
                borderTop: `4px solid ${T.jaune}`,
                backgroundImage: T.stripedPM,
                backgroundSize: "100% 6px", backgroundPosition: "0 0", backgroundRepeat: "no-repeat",
                boxShadow: T.tileShadow,
                display: "flex", flexDirection: "column", minHeight: 120, cursor: "pointer",
                transition: "all 0.2s",
              }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = T.tileShadowHover; }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = T.tileShadow; }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: T.jaune, display: "inline-block" }} />
                  <span style={{
                    fontSize: 14, fontWeight: 700, color: T.dark,
                    fontFamily: "Oswald, sans-serif", letterSpacing: 0.5,
                  }}>Piccola Mia</span>
                </div>
                <span style={{
                  fontSize: 22, fontWeight: 700, color: T.jauneDark,
                  fontFamily: "Oswald, sans-serif",
                }}>
                  {caPM != null ? `${fmtEur(caPM)} \u20ac` : "\u2014"}
                </span>
                <span style={{
                  display: "inline-flex", alignItems: "center", alignSelf: "flex-start",
                  height: 26, padding: "0 12px", borderRadius: 20, marginTop: "auto",
                  background: `${T.jauneDark}14`, border: `1px solid ${T.jauneDark}30`,
                  color: T.jauneDark, fontSize: 10, fontWeight: 700,
                }}>Ouvrir &rarr;</span>
              </div>
            </Link>
          </div>

          {/* Evenements */}
          {events.length > 0 && (
            <>
              <SectionLabel>Evenements</SectionLabel>
              <Link href="/evenements" style={{ textDecoration: "none", color: "inherit" }}>
                <div style={{
                  background: T.white, borderRadius: 16, padding: "16px 18px",
                  border: `1.5px solid ${T.border}`,
                  borderLeft: `4px solid ${T.violet}`,
                  boxShadow: T.tileShadow, marginBottom: 20, cursor: "pointer",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <TileIcon name="evenements" size={18} color={T.violet} />
                    <span style={{
                      fontFamily: "Oswald, sans-serif", fontWeight: 600,
                      fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase",
                      color: T.violet,
                    }}>Evenements</span>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 6,
                      background: `${T.violet}14`, color: T.violet,
                    }}>{events.length} a venir</span>
                  </div>
                  <div style={{ display: "grid", gap: 6 }}>
                    {events.map(ev => (
                      <div key={ev.id} style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "8px 12px", background: `${T.violet}08`, borderRadius: 10,
                        border: `1px solid ${T.violet}15`,
                      }}>
                        <span style={{ fontWeight: 700, fontSize: 12, color: T.dark }}>{ev.name}</span>
                        <span style={{ fontSize: 10, color: T.muted, flexShrink: 0 }}>
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

          {/* Gestion */}
          <SectionLabel>Gestion</SectionLabel>
          {/* Commandes */}
          <Link href="/commandes" style={{ textDecoration: "none", color: "inherit" }}>
            <div style={{
              background: T.white, borderRadius: 16, padding: "14px 18px",
              border: `1.5px solid ${T.border}`,
              borderLeft: `4px solid ${T.sauge}`,
              marginBottom: 20, cursor: "pointer",
              display: "flex", justifyContent: "space-between", alignItems: "center",
              boxShadow: T.tileShadow,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <TileIcon name="commandes" size={20} color={T.sauge} />
                <span style={{
                  fontFamily: "Oswald, sans-serif", fontWeight: 600,
                  fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase",
                  color: T.sauge,
                }}>Commandes</span>
                {pendingCommandes > 0 && (
                  <span style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    minWidth: 20, height: 20, borderRadius: 10,
                    background: T.terracotta, color: "#fff",
                    fontSize: 10, fontWeight: 700, padding: "0 6px",
                  }}>
                    {pendingCommandes}
                  </span>
                )}
              </div>
              <span style={{ fontSize: 11, color: T.muted }}>
                {pendingCommandes === 0 ? "Aucune en attente" : `${pendingCommandes} a valider`}
              </span>
            </div>
          </Link>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
            <GestionTile href="/invoices"        iconName="factures"   title="Factures"   sub="Import fournisseurs"   accent={T.sauge} />
            <GestionTile href="/messagerie"      iconName="messagerie" title="Messagerie" sub="Chat interne equipe"   accent={T.sauge} />
            <GestionTile href="/admin/utilisateurs" iconName="admin"   title="Admin"      sub="Utilisateurs, roles"   accent={T.ardoise} />
          </div>

        </div>
      </div>
    </RequireRole>
  );
}

function GestionTile({ href, iconName, title, sub, accent }: {
  href: string; iconName: React.ComponentProps<typeof TileIcon>["name"]; title: string; sub: string; accent: string;
}) {
  return (
    <Link href={href} style={{ textDecoration: "none" }}>
      <div style={{
        background: T.white, borderRadius: 16, padding: "16px 18px",
        border: `1.5px solid ${T.border}`,
        borderLeft: `3px solid ${accent}`,
        minHeight: 90, display: "flex", flexDirection: "column",
        justifyContent: "space-between", cursor: "pointer",
        transition: "all 0.2s", boxShadow: T.tileShadow,
      }}
        onMouseEnter={e => {
          e.currentTarget.style.boxShadow = T.tileShadowHover;
          e.currentTarget.style.borderColor = accent;
        }}
        onMouseLeave={e => {
          e.currentTarget.style.boxShadow = T.tileShadow;
          e.currentTarget.style.borderColor = T.border;
          e.currentTarget.style.borderLeftColor = accent;
        }}
      >
        <div>
          <div style={{ marginBottom: 8 }}><TileIcon name={iconName} size={20} color={accent} /></div>
          <div style={{
            fontFamily: "Oswald, sans-serif", fontWeight: 600,
            fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase",
            color: accent,
          }}>{title}</div>
          <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 11, color: T.muted, marginTop: 3, lineHeight: 1.4 }}>{sub}</div>
        </div>
      </div>
    </Link>
  );
}
