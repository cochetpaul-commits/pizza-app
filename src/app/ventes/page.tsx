"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { RequireRole } from "@/components/RequireRole";
import { useEtablissement } from "@/lib/EtablissementContext";

const CARD: React.CSSProperties = { background: "#fff", borderRadius: 14, padding: 20, border: "1px solid #ddd6c8" };
const KPI: React.CSSProperties = { ...CARD, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 110 };

const JOURS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const METEO = ["☀️", "⛅", "🌧️", "❄️", "🌤️", "⛈️", "🌫️"];

function fmtEur(n: number) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function VentesPage() {
  const { current: etab } = useEtablissement();
  const etabColor = etab?.couleur ?? "#e27f57";

  // Placeholder data — will be connected to POS system later
  const [caTotal, setCaTotal] = useState(0);
  const [caPrev, setCaPrev] = useState(0);
  const [couverts, setCouverts] = useState(0);
  const [couvertsPrev, setCouvertsPrev] = useState(0);
  const [ticketMoyen, setTicketMoyen] = useState(0);
  const [loading, setLoading] = useState(true);

  // Daily data for the week (placeholder — will be filled by POS integration)
  const dailyData = useMemo(() => {
    const todayIdx = (new Date().getDay() + 6) % 7;
    return JOURS.map((jour, i) => ({
      jour,
      ca: 0,
      couverts: 0,
      ticket: 0,
      meteo: METEO[i % METEO.length],
      isToday: i === todayIdx,
    }));
  }, []);

  useEffect(() => {
    if (!etab) return;
    // In the future, this will connect to Popina/Kezia API
    // For now, set loading false with empty data
    setLoading(false);
  }, [etab]);

  const deltaCa = caTotal - caPrev;
  const deltaCouverts = couverts - couvertsPrev;

  if (loading) {
    return (
      <RequireRole allowedRoles={["group_admin"]}>
        <div style={{ textAlign: "center", padding: 60, color: "#999" }}>Chargement...</div>
      </RequireRole>
    );
  }

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 16px 60px" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 12, height: 12, borderRadius: "50%", background: etabColor }} />
            <h1 style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 24, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>
              Ventes — {etab?.nom ?? ""}
            </h1>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <span style={{ padding: "4px 12px", borderRadius: 20, background: "rgba(45,106,79,0.08)", color: "#2D6A4F", fontSize: 12, fontWeight: 600 }}>
              Semaine en cours
            </span>
          </div>
        </div>

        {/* KPIs principaux */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
          <div style={KPI}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", marginBottom: 6 }}>CA semaine</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#1a1a1a" }}>{fmtEur(caTotal)} €</div>
            <div style={{ fontSize: 11, color: deltaCa >= 0 ? "#2D6A4F" : "#DC2626", fontWeight: 600, marginTop: 4 }}>
              {deltaCa >= 0 ? "+" : ""}{fmtEur(deltaCa)} € vs S-1
            </div>
          </div>
          <div style={KPI}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", marginBottom: 6 }}>Couverts</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#1a1a1a" }}>{couverts}</div>
            <div style={{ fontSize: 11, color: deltaCouverts >= 0 ? "#2D6A4F" : "#DC2626", fontWeight: 600, marginTop: 4 }}>
              {deltaCouverts >= 0 ? "+" : ""}{deltaCouverts} vs S-1
            </div>
          </div>
          <div style={KPI}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", marginBottom: 6 }}>Ticket moyen</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#1a1a1a" }}>{ticketMoyen.toFixed(1)} €</div>
            <div style={{ fontSize: 11, color: "#999", marginTop: 4 }}>
              CA / couverts
            </div>
          </div>
          <div style={KPI}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", marginBottom: 6 }}>Ratio MS / CA</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#1a1a1a" }}>— %</div>
            <div style={{ fontSize: 11, color: "#999", marginTop: 4 }}>
              Objectif : {String((etab as Record<string, unknown>)?.objectif_cout_ventes ?? 37)}%
            </div>
          </div>
        </div>

        {/* Tableau journalier */}
        <div style={{ ...CARD, marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h2 style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 16, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>
              Récapitulatif de la semaine
            </h2>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #ddd6c8" }}>
                <th style={{ textAlign: "left", padding: "8px 0", fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>Jour</th>
                <th style={{ textAlign: "center", padding: "8px 0", fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>Météo</th>
                <th style={{ textAlign: "right", padding: "8px 0", fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>CA</th>
                <th style={{ textAlign: "right", padding: "8px 0", fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>Couverts</th>
                <th style={{ textAlign: "right", padding: "8px 0", fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>Ticket moyen</th>
              </tr>
            </thead>
            <tbody>
              {dailyData.map((d, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #f0ebe3", background: d.isToday ? "rgba(45,106,79,0.04)" : "transparent" }}>
                  <td style={{ padding: "10px 0", fontWeight: d.isToday ? 700 : 500, color: d.isToday ? "#1a1a1a" : "#666" }}>
                    {d.jour} {d.isToday && <span style={{ fontSize: 10, color: "#2D6A4F", marginLeft: 4 }}>Aujourd&apos;hui</span>}
                  </td>
                  <td style={{ padding: "10px 0", textAlign: "center", fontSize: 18 }}>{d.meteo}</td>
                  <td style={{ padding: "10px 0", textAlign: "right", fontWeight: 600, color: d.ca > 0 ? "#1a1a1a" : "#ccc" }}>
                    {d.ca > 0 ? `${fmtEur(d.ca)} €` : "—"}
                  </td>
                  <td style={{ padding: "10px 0", textAlign: "right", color: d.couverts > 0 ? "#1a1a1a" : "#ccc" }}>
                    {d.couverts > 0 ? d.couverts : "—"}
                  </td>
                  <td style={{ padding: "10px 0", textAlign: "right", color: d.ticket > 0 ? "#1a1a1a" : "#ccc" }}>
                    {d.ticket > 0 ? `${d.ticket.toFixed(1)} €` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 2 colonnes : Analyse + Actions */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
          {/* Analyse & insights */}
          <div style={CARD}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a", marginBottom: 12 }}>Analyse de la semaine</h3>
            <div style={{ padding: 14, borderRadius: 10, background: "#faf7f2", marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", marginBottom: 4 }}>Tendance</div>
              <p style={{ fontSize: 12, color: "#666", margin: 0, lineHeight: 1.5 }}>
                Connectez votre système de caisse pour voir les tendances de vente, l&apos;impact de la météo sur votre chiffre d&apos;affaires, et des recommandations personnalisées.
              </p>
            </div>
            <div style={{ padding: 14, borderRadius: 10, background: "#faf7f2", marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", marginBottom: 4 }}>Météo & impact</div>
              <p style={{ fontSize: 12, color: "#666", margin: 0, lineHeight: 1.5 }}>
                L&apos;analyse croisée météo/ventes permet d&apos;anticiper les besoins en personnel et en approvisionnement.
              </p>
            </div>
            <div style={{ padding: 14, borderRadius: 10, background: "#faf7f2" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", marginBottom: 4 }}>Axes d&apos;amélioration</div>
              <p style={{ fontSize: 12, color: "#666", margin: 0, lineHeight: 1.5 }}>
                Identifiez les créneaux sous-performants, les produits phares et les opportunités de croissance.
              </p>
            </div>
          </div>

          {/* Accès rapide */}
          <div style={CARD}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a", marginBottom: 12 }}>Accès rapide</h3>
            {[
              { label: "Chiffre d'affaires", href: "/ventes/ca", desc: "Évolution du CA jour par jour" },
              { label: "Tickets & couverts", href: "/ventes/tickets", desc: "Analyse des services midi/soir" },
              { label: "Produits vendus", href: "/ventes/produits", desc: "Top produits et catégories" },
              { label: "Analyse météo", href: "/ventes/meteo", desc: "Impact météo sur les ventes" },
            ].map(link => (
              <Link key={link.href} href={link.href} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "12px 0", borderBottom: "1px solid #f0ebe3",
                textDecoration: "none",
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>{link.label}</div>
                  <div style={{ fontSize: 11, color: "#999" }}>{link.desc}</div>
                </div>
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
              </Link>
            ))}
          </div>
        </div>

        {/* Banner intégration */}
        <div style={{
          ...CARD,
          background: `linear-gradient(135deg, ${etabColor}15 0%, ${etabColor}08 100%)`,
          border: `1px solid ${etabColor}30`,
          textAlign: "center", padding: "30px 20px",
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🔌</div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "#1a1a1a", marginBottom: 8 }}>Connectez votre système de caisse</h3>
          <p style={{ fontSize: 13, color: "#666", maxWidth: 500, margin: "0 auto 16px", lineHeight: 1.5 }}>
            Intégrez Popina, Kezia ou un autre logiciel de caisse pour alimenter automatiquement vos données de vente et débloquer toutes les analyses.
          </p>
          <Link href="/settings/etablissements" style={{
            display: "inline-block", padding: "10px 20px", borderRadius: 8,
            background: "#1a1a1a", color: "#fff", textDecoration: "none",
            fontSize: 13, fontWeight: 600,
          }}>
            Configurer l&apos;intégration
          </Link>
        </div>
      </div>
    </RequireRole>
  );
}
