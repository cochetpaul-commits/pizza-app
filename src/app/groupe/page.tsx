"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useProfile } from "@/lib/ProfileContext";
import { useEtablissement } from "@/lib/EtablissementContext";
import type { Etablissement } from "@/types/etablissement";

// ── Types ────────────────────────────────────────────────────────────────────

type EtabKpi = {
  caJour: number | null;
  couverts: number | null;
  deltaCaHier: number | null;
};

type Alert = {
  id: string;
  label: string;
  type: "commande" | "event" | "food_cost";
  color: string;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtEur(v: number) {
  return v.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtDelta(v: number | null) {
  if (v == null) return "—";
  const sign = v >= 0 ? "+" : "";
  return `${sign}${fmtEur(v)} €`;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function GroupePage() {
  const router = useRouter();
  const { isAdmin } = useProfile();
  const { etablissements, setCurrent, isGroupAdmin, setGroupView } = useEtablissement();

  const [kpis, setKpis] = useState<Map<string, EtabKpi>>(new Map());
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  // Redirect non-group-admins
  useEffect(() => {
    if (!isGroupAdmin && !isAdmin) router.replace("/");
  }, [isGroupAdmin, isAdmin, router]);

  // Fetch KPIs
  useEffect(() => {
    async function load() {
      const today = new Date().toISOString().slice(0, 10);
      const alertList: Alert[] = [];

      // Upcoming events
      const { data: upcomingEvents } = await supabase
        .from("events")
        .select("id,name,date,status")
        .gte("date", today)
        .not("status", "in", '("termine","annule")')
        .order("date", { ascending: true })
        .limit(5);

      for (const ev of upcomingEvents ?? []) {
        alertList.push({
          id: `event-${ev.id}`,
          label: `${ev.name} — ${ev.date ? new Date(ev.date + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : ""}`,
          type: "event",
          color: "#D4775A",
        });
      }

      // Pending orders
      const { data: pendingOrders } = await supabase
        .from("commande_sessions")
        .select("id,fournisseur,semaine,statut")
        .in("statut", ["brouillon", "en_attente"])
        .limit(5);

      for (const cmd of pendingOrders ?? []) {
        alertList.push({
          id: `cmd-${cmd.id}`,
          label: `Commande ${cmd.fournisseur} (${cmd.semaine}) — ${cmd.statut}`,
          type: "commande",
          color: "#EA580C",
        });
      }

      setAlerts(alertList);

      // Fetch CA per establishment from Popina
      const kpiMap = new Map<string, EtabKpi>();
      for (const etab of etablissements) {
        if (etab.popina_location_id) {
          try {
            const res = await fetch(`/api/popina/ca-jour?locationId=${etab.popina_location_id}`);
            if (res.ok) {
              const d = await res.json();
              kpiMap.set(etab.id, {
                caJour: d.totalSales ?? null,
                couverts: d.guestsNumber ?? null,
                deltaCaHier: d.deltaSales ?? null,
              });
            } else {
              kpiMap.set(etab.id, { caJour: null, couverts: null, deltaCaHier: null });
            }
          } catch {
            kpiMap.set(etab.id, { caJour: null, couverts: null, deltaCaHier: null });
          }
        } else {
          kpiMap.set(etab.id, { caJour: null, couverts: null, deltaCaHier: null });
        }
      }

      setKpis(kpiMap);
      setLoading(false);
    }

    if (etablissements.length > 0) load();
  }, [etablissements]);

  function enterEtablissement(e: Etablissement) {
    setCurrent(e);
    router.push("/");
  }

  // Total CA across all establishments
  const totalCa = Array.from(kpis.values()).reduce((s: number, k: EtabKpi) => s + (k.caJour ?? 0), 0);

  return (
    <main className="page-root" style={{
      minHeight: "100dvh",
      background: "#f2ede4",
      width: "100%",
      boxSizing: "border-box",
    }}>
      {/* ── Header ── */}
      <div style={{
        padding: "18px 20px",
        marginBottom: 16,
        width: "100vw",
        marginLeft: "calc(-50vw + 50%)",
        borderBottom: "1px solid rgba(0,0,0,0.06)",
        display: "flex",
        justifyContent: "center",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Image
            src="/logo-ifratelli.png"
            alt="iFratelli Group"
            width={48}
            height={48}
            style={{ height: 56, width: "auto", objectFit: "contain", mixBlendMode: "multiply" }}
            priority
          />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
            <span style={{
              fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif",
              fontSize: 22, fontWeight: 600, fontStyle: "italic", color: "#D4775A", lineHeight: 1.1,
            }}>
              iFratelli
            </span>
            <span style={{
              fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
              fontSize: 11, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase",
              color: "#999", lineHeight: 1,
            }}>
              GROUP
            </span>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 700, margin: "0 auto", padding: "0 16px 40px" }}>

        {/* ── KPI consolidé ── */}
        <div style={{
          background: "#fff",
          border: "1px solid #ddd6c8",
          borderRadius: 14,
          padding: "20px 20px",
          marginBottom: 16,
          textAlign: "center",
        }}>
          <p style={{
            margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: 2.5,
            textTransform: "uppercase", color: "#999",
            fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
          }}>CA GROUPE AUJOURD&apos;HUI</p>
          <p style={{
            margin: "8px 0 0", fontSize: 42, fontWeight: 700, color: "#2f3a33", lineHeight: 1,
            fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
          }}>
            {loading ? "…" : `${fmtEur(totalCa)} €`}
          </p>
        </div>

        {/* ── Établissements columns ── */}
        <div style={{
          display: "grid",
          gridTemplateColumns: etablissements.length > 1 ? "1fr 1fr" : "1fr",
          gap: 12,
          marginBottom: 16,
        }}>
          {etablissements.map(etab => {
            const kpi = kpis.get(etab.id);
            return (
              <div key={etab.id} style={{
                background: "#fff",
                border: `2px solid ${etab.couleur}30`,
                borderRadius: 14,
                padding: "16px 16px 20px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <span style={{
                    width: 10, height: 10, borderRadius: "50%",
                    background: etab.couleur, flexShrink: 0,
                  }} />
                  <p style={{
                    margin: 0, fontSize: 14, fontWeight: 800, letterSpacing: 1,
                    textTransform: "uppercase", color: etab.couleur,
                    fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
                  }}>{etab.nom}</p>
                </div>

                {/* KPI rows */}
                <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#6f6a61" }}>CA du jour</span>
                    <span style={{
                      fontSize: 24, fontWeight: 700, color: "#2f3a33",
                      fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
                    }}>
                      {loading ? "…" : kpi?.caJour != null ? `${fmtEur(kpi.caJour)} €` : "—"}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#6f6a61" }}>Couverts</span>
                    <span style={{ fontSize: 18, fontWeight: 700, color: "#2f3a33" }}>
                      {loading ? "…" : kpi?.couverts ?? "—"}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#6f6a61" }}>Delta vs hier</span>
                    <span style={{
                      fontSize: 14, fontWeight: 700,
                      color: kpi?.deltaCaHier != null && kpi.deltaCaHier >= 0 ? "#4a6741" : "#DC2626",
                    }}>
                      {loading ? "…" : fmtDelta(kpi?.deltaCaHier ?? null)}
                    </span>
                  </div>
                </div>

                {/* Enter button */}
                <button
                  type="button"
                  onClick={() => enterEtablissement(etab)}
                  style={{
                    width: "100%",
                    padding: "10px 0",
                    borderRadius: 10,
                    border: `2px solid ${etab.couleur}`,
                    background: `${etab.couleur}10`,
                    color: etab.couleur,
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Entrer dans {etab.nom} →
                </button>
              </div>
            );
          })}
        </div>

        {/* ── Alertes ── */}
        {alerts.length > 0 && (
          <div style={{
            background: "#fff",
            border: "1px solid #ddd6c8",
            borderRadius: 14,
            padding: "14px 16px",
            marginBottom: 16,
          }}>
            <p style={{
              margin: "0 0 10px", fontSize: 10, fontWeight: 700, letterSpacing: 2,
              textTransform: "uppercase", color: "#b0a894",
              fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
            }}>ALERTES</p>
            <div style={{ display: "grid", gap: 6 }}>
              {alerts.map(a => (
                <div key={a.id} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "8px 12px",
                  background: `${a.color}08`,
                  borderRadius: 8,
                  border: `1px solid ${a.color}20`,
                  fontSize: 12, fontWeight: 600, color: "#2f3a33",
                }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: "50%",
                    background: a.color, flexShrink: 0,
                  }} />
                  {a.label}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Footer / sign out ── */}
        <div style={{ textAlign: "center", marginTop: 30 }}>
          <button
            type="button"
            onClick={() => { setGroupView(false); router.push("/"); }}
            style={{
              background: "none", border: "none", color: "#b0a894",
              fontSize: 12, fontWeight: 600, cursor: "pointer",
            }}
          >
            Quitter la vue groupe
          </button>
        </div>
      </div>
    </main>
  );
}
