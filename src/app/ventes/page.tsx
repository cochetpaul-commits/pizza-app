"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import { RequireRole } from "@/components/RequireRole";
import { useEtablissement } from "@/lib/EtablissementContext";

const CARD: React.CSSProperties = { background: "#fff", borderRadius: 14, padding: 20, border: "1px solid #ddd6c8" };

const JOURS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

function fmtEur(n: number) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function getWeekNumber(d: Date): number {
  const oneJan = new Date(d.getFullYear(), 0, 1);
  const days = Math.floor((d.getTime() - oneJan.getTime()) / 86400000);
  return Math.ceil((days + oneJan.getDay() + 1) / 7);
}

type DayData = {
  jour: string;
  salle: number;
  pergolas: number;
  terrasse: number;
  emporter: number;
  totalTTC: number;
  totalHT: number;
  pax: number;
  ticketMoy: number;
  ticketEmp: number;
  ratioPiatti: string;
  meteo: string;
  isToday: boolean;
};

export default function VentesPage() {
  const { current: etab } = useEtablissement();
  const etabColor = etab?.couleur ?? "#e27f57";
  const [loading, setLoading] = useState(true);

  // Popina data
  const [caData, setCaData] = useState<{ totalSales: number; guestsNumber: number } | null>(null);

  const weekNum = getWeekNumber(new Date());
  const todayIdx = (new Date().getDay() + 6) % 7;

  useEffect(() => {
    if (!etab) return;
    let cancelled = false;
    (async () => {
      // Try to load Popina data for Bello Mio
      if (etab.popina_location_id) {
        try {
          const res = await fetch("/api/popina/ca-jour");
          if (res.ok) {
            const d = await res.json();
            if (!cancelled) setCaData({ totalSales: d.totalSales ?? 0, guestsNumber: d.guestsNumber ?? 0 });
          }
        } catch { /* silently fail */ }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [etab]);

  // Placeholder daily data
  const dailyData: DayData[] = useMemo(() => {
    return JOURS.map((jour, i) => ({
      jour,
      salle: 0, pergolas: 0, terrasse: 0, emporter: 0,
      totalTTC: 0, totalHT: 0, pax: 0,
      ticketMoy: 0, ticketEmp: 0, ratioPiatti: "—",
      meteo: "—",
      isToday: i === todayIdx,
    }));
  }, [todayIdx]);

  // Zone data (cumul année)
  const zones = [
    { label: "Salle", value: 27509, pct: 43.7, color: "#e27f57" },
    { label: "Pergolas", value: 15380, pct: 24.4, color: "#2D6A4F" },
    { label: "Terrasse", value: 15291, pct: 24.3, color: "#D4775A" },
    { label: "À emporter", value: 4804, pct: 7.6, color: "#1a1a1a" },
  ];

  const caSemaine = caData?.totalSales ?? 0;
  const couvertsSemaine = caData?.guestsNumber ?? 0;
  const ticketMoyen = couvertsSemaine > 0 ? caSemaine / couvertsSemaine : 0;

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
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <span style={{ width: 12, height: 12, borderRadius: "50%", background: etabColor }} />
          <h1 style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 24, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>
            Ventes — {etab?.nom ?? ""}
          </h1>
        </div>

        {/* ═══ Répartition CA par Zone (semaine) ═══ */}
        <div style={{ ...CARD, marginBottom: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a", marginBottom: 12 }}>Répartition CA par zone</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            {zones.map(z => (
              <div key={z.label} style={{ padding: 14, borderRadius: 10, border: "1px solid #f0ebe3" }}>
                <div style={{ fontSize: 11, color: "#999", marginBottom: 4 }}>{z.label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#1a1a1a" }}>{fmtEur(z.value)} €</div>
                <div style={{ marginTop: 8, height: 4, borderRadius: 2, background: "#f0ebe3" }}>
                  <div style={{ height: "100%", borderRadius: 2, background: z.color, width: `${z.pct}%` }} />
                </div>
                <div style={{ fontSize: 10, color: "#999", marginTop: 4, textAlign: "right" }}>{z.pct}%</div>
              </div>
            ))}
          </div>
        </div>

        {/* ═══ Semaine XX ═══ */}
        <div style={{ ...CARD, marginBottom: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
            Semaine {weekNum}
          </h2>

          {/* CA section */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" strokeWidth="2"><rect x="1" y="5" width="22" height="16" rx="2" /><path d="M1 10h22" /></svg>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a" }}>Chiffre d&apos;affaires</span>
            </div>
            <div style={{ padding: 14, borderRadius: 10, background: "#faf7f2", marginBottom: 8 }}>
              <div style={{ fontSize: 10, color: "#999", marginBottom: 2 }}>CA Semaine</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: "#1a1a1a" }}>{fmtEur(caSemaine)} €</div>
            </div>
            <div style={{ display: "flex", gap: 16, marginBottom: 8 }}>
              <div><span style={{ fontSize: 11, color: "#999" }}>S-1</span><br /><span style={{ fontSize: 14, fontWeight: 600 }}>0 €</span></div>
              <div><span style={{ fontSize: 11, color: "#999" }}>Évolution</span><br /><span style={{ fontSize: 14, fontWeight: 600, color: "#2D6A4F" }}>+0.0%</span></div>
            </div>
            <div style={{ padding: 10, borderRadius: 8, background: "rgba(45,106,79,0.06)", border: "1px solid rgba(45,106,79,0.15)", marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: "#2D6A4F", fontWeight: 600 }}>Objectif +10%</span><br />
              <span style={{ fontSize: 13, fontWeight: 700, color: "#2D6A4F" }}>0 €</span><br />
              <span style={{ fontSize: 10, color: "#2D6A4F" }}>✓ Atteint</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#666" }}>
              <div>Cumul 2026<br />Moy. journalière</div>
              <div style={{ textAlign: "right", fontWeight: 600 }}>101 639,78 €<br />0 €</div>
            </div>
          </div>

          {/* Couverts section */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a" }}>Couverts</span>
            </div>
            <div style={{ padding: 14, borderRadius: 10, background: "#faf7f2", marginBottom: 8 }}>
              <div style={{ fontSize: 10, color: "#999", marginBottom: 2 }}>Total Semaine</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: "#1a1a1a" }}>{couvertsSemaine}</div>
            </div>
            <div style={{ display: "flex", gap: 16, marginBottom: 8 }}>
              <div><span style={{ fontSize: 11, color: "#999" }}>S-1</span><br /><span style={{ fontSize: 14, fontWeight: 600 }}>0</span></div>
              <div><span style={{ fontSize: 11, color: "#999" }}>Évolution</span><br /><span style={{ fontSize: 14, fontWeight: 600, color: "#2D6A4F" }}>+0.0%</span></div>
            </div>
            <div style={{ padding: 10, borderRadius: 8, background: "rgba(45,106,79,0.06)", border: "1px solid rgba(45,106,79,0.15)", marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: "#2D6A4F", fontWeight: 600 }}>Objectif +10%</span><br />
              <span style={{ fontSize: 13, fontWeight: 700, color: "#2D6A4F" }}>0</span><br />
              <span style={{ fontSize: 10, color: "#2D6A4F" }}>✓ Atteint</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#666" }}>
              <div>Ticket moyen<br />Ticket S-1</div>
              <div style={{ textAlign: "right", fontWeight: 600, color: "#D4775A" }}>{ticketMoyen.toFixed(2)} €<br />0.00 €</div>
            </div>
          </div>
        </div>

        {/* ═══ Répartition CA par Zone (cumul) ═══ */}
        <div style={{ ...CARD, marginBottom: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a", marginBottom: 12 }}>Répartition CA par zone</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            {zones.map(z => (
              <div key={`cumul-${z.label}`} style={{ padding: 12, borderRadius: 8, border: "1px solid #f0ebe3" }}>
                <div style={{ fontSize: 10, color: "#999" }}>{z.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#1a1a1a" }}>{fmtEur(z.value)} €</div>
                <div style={{ marginTop: 6, height: 3, borderRadius: 2, background: "#f0ebe3" }}>
                  <div style={{ height: "100%", borderRadius: 2, background: z.color, width: `${z.pct}%` }} />
                </div>
                <div style={{ fontSize: 10, color: "#999", marginTop: 2 }}>{z.pct}%</div>
              </div>
            ))}
          </div>
        </div>

        {/* ═══ Tableau journalier détaillé ═══ */}
        <div style={{ ...CARD, marginBottom: 16, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 900 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #ddd6c8" }}>
                {["Jour", "Salle €", "Pergolas €", "Terrasse €", "À emp. €", "Total TTC", "Total HT", "Pax", "Ticket moy.", "Ticket emp.", "Ratio P/atti/Pizza", "Météo", "Actions"].map(h => (
                  <th key={h} style={{ textAlign: h === "Jour" ? "left" : "center", padding: "8px 4px", fontSize: 10, fontWeight: 700, color: "#D4775A", textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dailyData.map((d, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #f0ebe3", background: d.isToday ? "rgba(45,106,79,0.04)" : "transparent" }}>
                  <td style={{ padding: "10px 4px", fontWeight: d.isToday ? 700 : 500, color: "#1a1a1a" }}>{d.jour.toLowerCase()}</td>
                  <td style={{ padding: "10px 4px", textAlign: "center", color: "#ccc" }}>—</td>
                  <td style={{ padding: "10px 4px", textAlign: "center", color: "#ccc" }}>—</td>
                  <td style={{ padding: "10px 4px", textAlign: "center", color: "#ccc" }}>—</td>
                  <td style={{ padding: "10px 4px", textAlign: "center", color: "#ccc" }}>—</td>
                  <td style={{ padding: "10px 4px", textAlign: "center", color: "#ccc", fontWeight: 600 }}>—</td>
                  <td style={{ padding: "10px 4px", textAlign: "center", color: "#ccc" }}>—</td>
                  <td style={{ padding: "10px 4px", textAlign: "center", color: "#ccc", fontWeight: 600 }}>—</td>
                  <td style={{ padding: "10px 4px", textAlign: "center", color: "#ccc" }}>—</td>
                  <td style={{ padding: "10px 4px", textAlign: "center", color: "#ccc" }}>—</td>
                  <td style={{ padding: "10px 4px", textAlign: "center", color: "#ccc" }}>—</td>
                  <td style={{ padding: "10px 4px", textAlign: "center", color: "#ccc" }}>—</td>
                  <td style={{ padding: "10px 4px", textAlign: "center" }}>
                    <span style={{ fontSize: 10, color: "#2D6A4F", cursor: "pointer" }}>+M</span>
                    {" "}
                    <span style={{ fontSize: 10, color: "#D4775A", cursor: "pointer" }}>+S</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ═══ Top 5 Cuisine ═══ */}
        <div style={{ ...CARD, marginBottom: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a", marginBottom: 12 }}>
            🍽️ Top 5 Cuisine
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            {[
              { icon: "🍕", label: "Top Pizze" },
              { icon: "🍝", label: "Top Piatti" },
              { icon: "🥗", label: "Top Antipasti" },
              { icon: "🍰", label: "Top Dolci" },
            ].map(cat => (
              <div key={cat.label} style={{ padding: 12, borderRadius: 8, border: "1px solid #f0ebe3" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", marginBottom: 4 }}>
                  {cat.icon} {cat.label}
                </div>
                <div style={{ fontSize: 11, color: "#999" }}>Aucune donnée</div>
              </div>
            ))}
          </div>
        </div>

        {/* ═══ Top 5 Boissons ═══ */}
        <div style={CARD}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a", marginBottom: 12 }}>
            🍷 Top 5 Boissons
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            {[
              { icon: "🍷", label: "Vins (Verres)" },
              { icon: "🍾", label: "Vins (Bouteilles)" },
              { icon: "🍹", label: "Spritz" },
              { icon: "🥂", label: "Cocktails" },
            ].map(cat => (
              <div key={cat.label} style={{ padding: 12, borderRadius: 8, border: "1px solid #f0ebe3" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", marginBottom: 4 }}>
                  {cat.icon} {cat.label}
                </div>
                <div style={{ fontSize: 11, color: "#999" }}>Aucune donnée</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </RequireRole>
  );
}
