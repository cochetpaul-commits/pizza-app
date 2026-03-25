"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { RequireRole } from "@/components/RequireRole";
import { useEtablissement } from "@/lib/EtablissementContext";
import { fetchApi } from "@/lib/fetchApi";

/* ── Tokens ── */
const T = {
  dark: "#1a1a1a", muted: "#999", border: "#ddd6c8", white: "#fff",
  terracotta: "#D4775A", sauge: "#4A7C59", dore: "#B8860B",
  creme: "#f2ede4", cremeDark: "#f0ebe3",
  salle: "#D4775A", pergolas: "#B8860B", terrasse: "#4A7C59", emporter: "#8B6914",
};

function fmtEur(n: number) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtEur2(n: number) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ── Types ── */
type DayData = {
  date: string; label: string; labelFull: string;
  ca: number; pax: number; ticketMoyen: number; isActive: boolean;
  services: {
    journee: { salle: number; pergolas: number; terrasse: number; emporter: number; total: number; totalHT: number; pax: number; ticketMoyen: number; ticketEmporter: number; ratioPiattiPizza: number };
    midi: { salle: number; pergolas: number; terrasse: number; emporter: number; total: number; pax: number; ticketMoyen: number };
    soir: { salle: number; pergolas: number; terrasse: number; emporter: number; total: number; pax: number; ticketMoyen: number };
  };
  topProducts: Array<{ name: string; quantity: number; totalSales: number }>;
  weather: { midi: { temp: number; condition: string; icon: string }; soir: { temp: number; condition: string; icon: string } } | null;
};

type PerfData = {
  week: string; weekLabel: string; isCurrentWeek: boolean; activeDays: number; today: string;
  apiError: string | null;
  kpis: {
    caSemaine: number; caHT: number; paxSemaine: number;
    ticketMoyenSurPlace: number; ticketMoyenEmporter: number;
    bestDay: { label: string; ca: number };
    variationCA: number; variationPax: number; variationTicket: number;
    caSemainePrec: number; paxSemainePrec: number; ticketMoyenPrec: number;
  };
  zones: { salle: number; pergolas: number; terrasse: number; emporter: number };
  zonePcts: { salle: number; pergolas: number; terrasse: number; emporter: number };
  days: DayData[];
  topSemaine: Array<{ name: string; quantity: number; totalSales: number; isNew: boolean; pctChange: number | null }>;
  topByCategory: Array<{ category: string; products: Array<{ name: string; quantity: number; totalSales: number; pctChange: number | null }> }>;
};

/* ── Helpers ── */
function getISOWeek(dateStr?: string): string {
  const d = dateStr ? new Date(dateStr + "T12:00:00Z") : new Date();
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-${String(week).padStart(2, "0")}`;
}

function prevWeek(w: string): string {
  const [y, wn] = w.split("-").map(Number);
  if (wn <= 1) return `${y - 1}-52`;
  return `${y}-${String(wn - 1).padStart(2, "0")}`;
}

function nextWeek(w: string): string {
  const [y, wn] = w.split("-").map(Number);
  if (wn >= 52) return `${y + 1}-01`;
  return `${y}-${String(wn + 1).padStart(2, "0")}`;
}

/* ── Main Page ── */
export default function PerformancesPage() {
  const { current: etab } = useEtablissement();
  const etabColor = etab?.couleur ?? T.terracotta;

  const [week, setWeek] = useState(getISOWeek);
  const [data, setData] = useState<PerfData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<DayData | null>(null);

  const currentWeek = getISOWeek();

  const load = useCallback(async (w: string) => {
    setLoading(true);
    try {
      const res = await fetchApi(`/api/popina/performances?week=${w}`);
      if (res.ok) setData(await res.json());
    } catch { /* silencieux */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(week); }, [week, load]); // eslint-disable-line react-hooks/set-state-in-effect

  const CARD: React.CSSProperties = {
    background: T.white, borderRadius: 14, padding: "16px 20px",
    border: `1.5px solid ${T.border}`,
  };

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 16px 60px" }}>

        {/* ── Week Selector ── */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "12px 24px", background: T.creme, borderRadius: 12,
          marginBottom: 16, border: `1px solid ${T.border}`,
        }}>
          <button type="button" onClick={() => setWeek(prevWeek(week))} style={{
            background: "none", border: "none", cursor: "pointer", padding: 8,
            color: T.terracotta, fontSize: 18, fontWeight: 700,
          }}>&larr;</button>
          <span style={{
            fontFamily: "DM Sans, sans-serif", fontSize: 14, fontWeight: 600, color: T.dark,
          }}>
            {data?.weekLabel ?? `Semaine ${week}`}
          </span>
          <button type="button" onClick={() => { if (week < currentWeek) setWeek(nextWeek(week)); }}
            style={{
              background: "none", border: "none", cursor: "pointer", padding: 8,
              color: week < currentWeek ? T.terracotta : T.border, fontSize: 18, fontWeight: 700,
            }}>&rarr;</button>
        </div>

        {/* ── Back link ── */}
        <Link href="/ventes" style={{ fontSize: 12, color: T.muted, textDecoration: "none", display: "flex", alignItems: "center", gap: 4, marginBottom: 12 }}>
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
          Retour aux ventes
        </Link>

        {loading && !data ? (
          <div style={{ textAlign: "center", padding: 60, color: T.muted }}>Chargement...</div>
        ) : data ? (
          <>
            {/* ── API Error Banner ── */}
            {data.apiError && (
              <div style={{
                background: "#FEF2F2", border: "1.5px solid #FECACA", borderRadius: 12,
                padding: "14px 18px", marginBottom: 16,
                display: "flex", alignItems: "center", gap: 10,
              }}>
                <span style={{ fontSize: 18 }}>&#9888;</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#991B1B" }}>Connexion Popina impossible</div>
                  <div style={{ fontSize: 12, color: "#B91C1C", marginTop: 2 }}>{data.apiError}</div>
                </div>
              </div>
            )}

            {/* ── CHIFFRES CLES SEMAINE ── */}
            <SectionLabel>Chiffres cles &middot; Semaine</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
              <KpiCard label="CA Semaine" value={`${fmtEur(data.kpis.caSemaine)} €`}
                variation={data.kpis.variationCA} />
              <KpiCard label="Couverts" value={String(data.kpis.paxSemaine)}
                variation={data.kpis.variationPax} />
              <KpiCard label="Panier moyen" value={`${fmtEur2(data.kpis.ticketMoyenSurPlace)} €`}
                variation={data.kpis.variationTicket} />
              <KpiCard label="Meilleur jour" value={data.kpis.bestDay.label}
                sub={`${fmtEur(data.kpis.bestDay.ca)} €`} />
            </div>

            {/* ── KPIs GLOBAUX (CA Global, Couverts, Ticket SP, Ticket Emporter) ── */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
              <div style={{ ...CARD }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>CA Global TTC</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: T.dark, fontFamily: "var(--font-oswald), Oswald, sans-serif" }}>{fmtEur(data.kpis.caSemaine)} &euro;</div>
                <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>HT: {fmtEur(data.kpis.caHT)} &euro;</div>
              </div>
              <div style={{ ...CARD }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Couverts totaux</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: T.dark, fontFamily: "var(--font-oswald), Oswald, sans-serif" }}>{data.kpis.paxSemaine}</div>
              </div>
              <div style={{ ...CARD }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Ticket moyen sur place</div>
                <div style={{
                  fontSize: 22, fontWeight: 700, fontFamily: "var(--font-oswald), Oswald, sans-serif",
                  color: T.dark,
                  display: "inline-block", padding: "2px 10px", borderRadius: 6,
                  background: data.kpis.ticketMoyenSurPlace >= 42 ? "#DEF7EC" : "#FEF3CD",
                }}>
                  {fmtEur2(data.kpis.ticketMoyenSurPlace)}&euro;
                </div>
                <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>Objectif: &ge; 42&euro;</div>
              </div>
              <div style={{ ...CARD }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Ticket moyen a emporter</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: T.dark, fontFamily: "var(--font-oswald), Oswald, sans-serif" }}>{fmtEur(data.kpis.ticketMoyenEmporter)} &euro;</div>
              </div>
            </div>

            {/* ── REPARTITION CA PAR ZONE ── */}
            <div style={{ ...CARD, marginBottom: 20 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: T.dark, marginBottom: 14 }}>Repartition CA par Zone</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                {(["salle", "pergolas", "terrasse", "emporter"] as const).map(zone => {
                  const colors = { salle: T.salle, pergolas: T.pergolas, terrasse: T.terrasse, emporter: T.emporter };
                  const labels = { salle: "Salle", pergolas: "Pergolas", terrasse: "Terrasse", emporter: "A Emporter" };
                  const bgColors = { salle: "#FDF2EF", pergolas: "#FFF8E7", terrasse: "#EFF8F1", emporter: "#F5F0E8" };
                  return (
                    <div key={zone} style={{
                      background: bgColors[zone], borderRadius: 12, padding: "14px 16px",
                      border: `1px solid ${colors[zone]}20`,
                    }}>
                      <div style={{ fontSize: 11, color: T.muted, fontWeight: 600, marginBottom: 4 }}>{labels[zone]}</div>
                      <div style={{ fontSize: 22, fontWeight: 700, color: T.dark, fontFamily: "var(--font-oswald), Oswald, sans-serif" }}>
                        {fmtEur(data.zones[zone])} &euro;
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                        <div style={{ flex: 1, height: 4, borderRadius: 2, background: `${colors[zone]}20` }}>
                          <div style={{ height: "100%", borderRadius: 2, background: colors[zone], width: `${data.zonePcts[zone]}%` }} />
                        </div>
                        <span style={{ fontSize: 11, color: T.muted, fontWeight: 600 }}>{data.zonePcts[zone]}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── CA SEMAINE (bar chart) + TOP 5 PRODUITS ── */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
              {/* Bar chart */}
              <div style={CARD}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: T.dark, marginBottom: 2 }}>CA Semaine</h3>
                <div style={{ fontSize: 11, color: T.muted, marginBottom: 16 }}>Clique sur une barre pour le detail</div>
                <BarChart days={data.days} onDayClick={setSelectedDay} etabColor={etabColor} />
              </div>

              {/* Top 5 produits */}
              <div style={CARD}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: T.dark, marginBottom: 12 }}>Top 5 Produits &middot; Semaine</h3>
                <div style={{ display: "grid", gap: 6 }}>
                  {data.topSemaine.map((p, i) => (
                    <div key={p.name} style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "10px 12px", borderRadius: 10,
                      borderBottom: `3px solid ${i === 0 ? T.terracotta : i === 1 ? T.dore : T.border}`,
                      background: T.white,
                    }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700,
                        color: i < 3 ? T.terracotta : T.muted,
                        minWidth: 20,
                      }}>#{i + 1}</span>
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: T.dark }}>{p.name}</span>
                      {p.pctChange != null && (
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                          background: p.pctChange > 0 ? "#DEF7EC" : p.pctChange < 0 ? "#FDE8E8" : "#F3F4F6",
                          color: p.pctChange > 0 ? "#03543F" : p.pctChange < 0 ? "#9B1C1C" : T.muted,
                        }}>
                          {p.pctChange > 0 ? "+" : ""}{p.pctChange}%
                        </span>
                      )}
                      {p.isNew && p.pctChange == null && (
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                          background: "#FEF3CD", color: T.dore,
                        }}>Nouveau</span>
                      )}
                      <span style={{ fontSize: 13, fontWeight: 700, color: T.terracotta }}>{fmtEur(p.totalSales)} &euro;</span>
                      <span style={{ fontSize: 11, color: T.muted }}>{p.quantity}x</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── TABLEAU DETAILLE SEMAINE ── */}
            <div style={{ ...CARD, marginBottom: 20, overflowX: "auto" }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: T.dark, marginBottom: 14 }}>Detail par jour</h3>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: `linear-gradient(135deg, ${T.terracotta}, #B85A3A)` }}>
                    {["Jour", "Service", "Salle €", "Pergolas €", "Terrasse €", "A Emp. €", "Total TTC", "Total HT", "Pax", "Ticket moy.", "Ratio P/P", "Meteo"].map(h => (
                      <th key={h} style={{
                        padding: "10px 8px", color: "#fff", fontWeight: 700,
                        fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em",
                        textAlign: h === "Jour" || h === "Service" ? "left" : "right",
                        whiteSpace: "nowrap",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.days.filter(d => d.isActive).map((day) => (
                    <DayTableRows key={day.date} day={day} />
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── TOP PRODUITS PAR CATEGORIE ── */}
            {data.topByCategory.length > 0 && (
              <>
                {/* Food categories */}
                {data.topByCategory.filter(c => !c.category.includes("Vin") && c.category !== "Cocktails & Alcools" && c.category !== "Sans alcool").length > 0 && (
                  <>
                    <SectionLabel>Top Plats</SectionLabel>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
                      {data.topByCategory
                        .filter(c => !c.category.includes("Vin") && c.category !== "Cocktails & Alcools" && c.category !== "Sans alcool")
                        .slice(0, 4)
                        .map(cat => (
                        <CategoryCard key={cat.category} cat={cat} />
                      ))}
                    </div>
                  </>
                )}

                {/* Drink categories */}
                {data.topByCategory.filter(c => c.category.includes("Vin") || c.category === "Cocktails & Alcools" || c.category === "Sans alcool").length > 0 && (
                  <>
                    <SectionLabel>Top Boissons</SectionLabel>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
                      {data.topByCategory
                        .filter(c => c.category.includes("Vin") || c.category === "Cocktails & Alcools" || c.category === "Sans alcool")
                        .slice(0, 4)
                        .map(cat => (
                        <CategoryCard key={cat.category} cat={cat} />
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </>
        ) : (
          <div style={{ textAlign: "center", padding: 60, color: T.muted }}>Erreur de chargement</div>
        )}

        {/* ── DAY DETAIL POPUP ── */}
        {selectedDay && (
          <DayDetailPopup day={selectedDay} onClose={() => setSelectedDay(null)} />
        )}
      </div>
    </RequireRole>
  );
}

/* ── KpiCard ── */
function KpiCard({ label, value, variation, sub }: {
  label: string; value: string; variation?: number; sub?: string;
}) {
  return (
    <div style={{
      background: T.white, borderRadius: 14, padding: "16px 18px",
      border: `1.5px solid ${T.border}`,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: T.dark, fontFamily: "var(--font-oswald), Oswald, sans-serif", lineHeight: 1.1 }}>{value}</div>
      {variation !== undefined && (
        <div style={{
          fontSize: 12, fontWeight: 600, marginTop: 6,
          color: variation > 0 ? T.sauge : variation < 0 ? "#DC2626" : T.muted,
        }}>
          {variation > 0 ? "↑" : variation < 0 ? "↓" : ""} {variation > 0 ? "+" : ""}{variation}%
        </div>
      )}
      {sub && <div style={{ fontSize: 13, fontWeight: 700, color: T.terracotta, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

/* ── BarChart ── */
function BarChart({ days, onDayClick, etabColor }: {
  days: DayData[]; onDayClick: (d: DayData) => void; etabColor: string;
}) {
  const maxCA = Math.max(...days.map(d => d.ca), 1);
  const barColor = etabColor;

  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 180 }}>
      {days.map(day => {
        const h = day.ca > 0 ? Math.max(8, (day.ca / maxCA) * 160) : 4;
        return (
          <div key={day.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 10, color: T.muted, fontWeight: 600 }}>{day.ca > 0 ? `${fmtEur(day.ca)}€` : ""}</span>
            <div
              onClick={() => day.isActive && day.ca > 0 && onDayClick(day)}
              style={{
                width: "100%", maxWidth: 48, height: h, borderRadius: "6px 6px 0 0",
                background: day.isActive ? barColor : `${barColor}30`,
                cursor: day.isActive && day.ca > 0 ? "pointer" : "default",
                transition: "all 0.2s",
                position: "relative",
              }}
              title={day.isActive ? `${day.labelFull} — ${fmtEur(day.ca)} €` : ""}
            />
            <span style={{ fontSize: 11, fontWeight: 600, color: T.dark }}>{day.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ── Weather badge ── */
function WeatherBadge({ temp, condition }: { temp: number; condition: string }) {
  const iconMap: Record<string, string> = {
    "ciel degage": "☀️", "clear sky": "☀️",
    "peu nuageux": "⛅", "few clouds": "⛅",
    "partiellement nuageux": "⛅", "scattered clouds": "⛅",
    "nuageux": "☁️", "broken clouds": "☁️", "overcast clouds": "☁️",
    "couvert": "☁️",
    "pluie legere": "\u{1F327}️", "light rain": "\u{1F327}️",
    "pluie moderee": "\u{1F327}️", "moderate rain": "\u{1F327}️",
    "pluie": "\u{1F327}️", "rain": "\u{1F327}️",
    "forte pluie": "\u{1F327}️", "heavy rain": "\u{1F327}️",
    "orage": "⛈️", "thunderstorm": "⛈️",
    "neige": "\u{1F328}️", "snow": "\u{1F328}️",
    "brouillard": "\u{1F32B}️", "mist": "\u{1F32B}️", "fog": "\u{1F32B}️",
  };
  const cond = condition.toLowerCase();
  const icon = iconMap[cond] ?? (cond.includes("pluie") || cond.includes("rain") ? "\u{1F327}️" : cond.includes("nuag") || cond.includes("cloud") || cond.includes("couvert") ? "☁️" : cond.includes("soleil") || cond.includes("clear") || cond.includes("degage") ? "☀️" : "☁️");

  return (
    <span style={{ fontSize: 11, whiteSpace: "nowrap" }}>
      {icon} {temp}&deg;
    </span>
  );
}

/* ── DayTableRows ── */
function DayTableRows({ day }: { day: DayData }) {
  const { services, weather } = day;
  const tdStyle = (bold: boolean, align: "left" | "right" = "right"): React.CSSProperties => ({
    padding: "8px 8px", textAlign: align, fontWeight: bold ? 700 : 400,
    color: bold ? T.dark : T.muted, whiteSpace: "nowrap", fontSize: 12,
  });
  const borderBottom = `1px solid ${T.cremeDark}`;

  return (
    <>
      {/* JOURNEE row */}
      <tr style={{ borderBottom, background: "#FAFAF8" }}>
        <td rowSpan={3} style={{ ...tdStyle(true, "left"), fontWeight: 700, fontSize: 13, verticalAlign: "top", paddingTop: 12 }}>{day.labelFull}</td>
        <td style={{ ...tdStyle(true, "left"), fontSize: 11 }}>Journee</td>
        <td style={tdStyle(true)}>{fmtEur(services.journee.salle)} &euro;</td>
        <td style={tdStyle(true)}>{fmtEur(services.journee.pergolas)} &euro;</td>
        <td style={tdStyle(true)}>{fmtEur(services.journee.terrasse)} &euro;</td>
        <td style={tdStyle(true)}>{fmtEur(services.journee.emporter)} &euro;</td>
        <td style={{ ...tdStyle(true), color: T.dark, fontWeight: 700 }}>{fmtEur(services.journee.total)} &euro;</td>
        <td style={tdStyle(true)}>{fmtEur(services.journee.totalHT)} &euro;</td>
        <td style={tdStyle(true)}>{services.journee.pax}</td>
        <td style={tdStyle(true)}>
          <span style={{
            display: "inline-block", padding: "2px 6px", borderRadius: 4, fontSize: 11,
            background: services.journee.ticketMoyen >= 42 ? "#DEF7EC" : services.journee.ticketMoyen > 0 ? "#FEF3CD" : "transparent",
            color: services.journee.ticketMoyen >= 42 ? "#03543F" : T.dore, fontWeight: 700,
          }}>
            {services.journee.ticketMoyen > 0 ? `${fmtEur2(services.journee.ticketMoyen)}€` : "—"}
          </span>
        </td>
        <td style={tdStyle(true)}>
          {services.journee.ratioPiattiPizza > 0 ? `${services.journee.ratioPiattiPizza}%` : "—"}
        </td>
        <td rowSpan={3} style={{ ...tdStyle(false, "left"), verticalAlign: "top", paddingTop: 10 }}>
          {weather ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 10, color: T.muted }}>Midi</span>
                <WeatherBadge temp={weather.midi.temp} condition={weather.midi.condition} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 10, color: T.muted }}>Soir</span>
                <WeatherBadge temp={weather.soir.temp} condition={weather.soir.condition} />
              </div>
            </div>
          ) : (
            <span style={{ fontSize: 11, color: T.muted }}>{"—"}</span>
          )}
        </td>
      </tr>
      {/* MIDI row */}
      <tr style={{ borderBottom }}>
        <td style={{ ...tdStyle(false, "left"), fontSize: 11 }}>
          <span style={{ marginRight: 4 }}>&#9728;&#65039;</span>Midi
        </td>
        <td style={tdStyle(false)}>{fmtEur(services.midi.salle)} &euro;</td>
        <td style={tdStyle(false)}>{fmtEur(services.midi.pergolas)} &euro;</td>
        <td style={tdStyle(false)}>{fmtEur(services.midi.terrasse)} &euro;</td>
        <td style={tdStyle(false)}>{fmtEur(services.midi.emporter)} &euro;</td>
        <td style={tdStyle(false)}>{fmtEur(services.midi.total)} &euro;</td>
        <td style={tdStyle(false)}></td>
        <td style={tdStyle(false)}>{services.midi.pax}</td>
        <td style={tdStyle(false)}>{services.midi.ticketMoyen > 0 ? `${fmtEur(services.midi.ticketMoyen)}€` : "—"}</td>
        <td style={tdStyle(false)}></td>
      </tr>
      {/* SOIR row */}
      <tr style={{ borderBottom: `2px solid ${T.border}` }}>
        <td style={{ ...tdStyle(false, "left"), fontSize: 11 }}>
          <span style={{ marginRight: 4 }}>&#127769;</span>Soir
        </td>
        <td style={tdStyle(false)}>{fmtEur(services.soir.salle)} &euro;</td>
        <td style={tdStyle(false)}>{fmtEur(services.soir.pergolas)} &euro;</td>
        <td style={tdStyle(false)}>{fmtEur(services.soir.terrasse)} &euro;</td>
        <td style={tdStyle(false)}>{fmtEur(services.soir.emporter)} &euro;</td>
        <td style={tdStyle(false)}>{fmtEur(services.soir.total)} &euro;</td>
        <td style={tdStyle(false)}></td>
        <td style={tdStyle(false)}>{services.soir.pax}</td>
        <td style={tdStyle(false)}>{services.soir.ticketMoyen > 0 ? `${fmtEur(services.soir.ticketMoyen)}€` : "—"}</td>
        <td style={tdStyle(false)}></td>
      </tr>
    </>
  );
}

/* ── Day Detail Popup ── */
function DayDetailPopup({ day, onClose }: { day: DayData; onClose: () => void }) {
  const dateObj = new Date(day.date + "T12:00:00");
  const dateLabel = dateObj.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000,
      display: "flex", alignItems: "flex-end", justifyContent: "center",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: T.white, borderRadius: "20px 20px 0 0", padding: "24px 24px 32px",
        width: "100%", maxWidth: 1100, maxHeight: "70vh", overflowY: "auto",
        boxShadow: "0 -8px 40px rgba(0,0,0,0.15)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{
            fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 20, fontWeight: 700,
            color: T.dark, textTransform: "uppercase",
          }}>{dateLabel}</h3>
          <button type="button" onClick={onClose} style={{
            background: "none", border: "none", cursor: "pointer", fontSize: 20, color: T.muted, padding: 8,
          }}>&times;</button>
        </div>

        {/* 3 KPI cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
          <div style={{ background: T.creme, borderRadius: 12, padding: "14px 18px", textAlign: "center" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.muted, textTransform: "uppercase", marginBottom: 4 }}>CA</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: T.dark, fontFamily: "var(--font-oswald), Oswald, sans-serif" }}>{fmtEur(day.ca)} &euro;</div>
          </div>
          <div style={{ background: T.creme, borderRadius: 12, padding: "14px 18px", textAlign: "center" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.muted, textTransform: "uppercase", marginBottom: 4 }}>Couverts</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: T.dark, fontFamily: "var(--font-oswald), Oswald, sans-serif" }}>{day.pax}</div>
          </div>
          <div style={{ background: T.creme, borderRadius: 12, padding: "14px 18px", textAlign: "center" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.muted, textTransform: "uppercase", marginBottom: 4 }}>Ticket moy.</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: T.dark, fontFamily: "var(--font-oswald), Oswald, sans-serif" }}>{fmtEur2(day.ticketMoyen)} &euro;</div>
          </div>
        </div>

        {/* Top 5 produits du jour */}
        {day.topProducts.length > 0 && (
          <>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: T.muted, marginBottom: 10 }}>
              Top 5 produits
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              {day.topProducts.map((p, i) => (
                <div key={p.name} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "12px 16px", borderRadius: 10,
                  background: T.creme, border: `1px solid ${T.border}`,
                }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700,
                    color: i < 3 ? T.terracotta : T.muted, minWidth: 20,
                  }}>#{i + 1}</span>
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: T.dark }}>{p.name}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: T.terracotta }}>{fmtEur(p.totalSales)} &euro;</span>
                  <span style={{ fontSize: 12, color: T.muted }}>{p.quantity}x</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ── CategoryCard ── */
function CategoryCard({ cat }: { cat: { category: string; products: Array<{ name: string; quantity: number; totalSales: number; pctChange: number | null }> } }) {
  const CARD_STYLE: React.CSSProperties = {
    background: T.white, borderRadius: 14, padding: "14px 16px",
    border: `1.5px solid ${T.border}`,
  };
  return (
    <div style={CARD_STYLE}>
      <h4 style={{ fontSize: 13, fontWeight: 700, color: T.dark, marginBottom: 10 }}>
        {cat.category}
      </h4>
      <div style={{ display: "grid", gap: 4 }}>
        {cat.products.map((p, i) => (
          <div key={p.name} style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "5px 0", borderBottom: i < cat.products.length - 1 ? `1px solid ${T.cremeDark}` : "none",
          }}>
            <span style={{ fontSize: 10, color: T.muted, minWidth: 14 }}>{i + 1}</span>
            <span style={{ flex: 1, fontSize: 12, color: T.dark, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
            <span style={{ fontSize: 10, color: T.muted, flexShrink: 0 }}>{p.quantity}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: T.terracotta, flexShrink: 0 }}>{fmtEur(p.totalSales)} &euro;</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── SectionLabel ── */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: "DM Sans, sans-serif", fontSize: 10, fontWeight: 700,
      letterSpacing: "0.16em", textTransform: "uppercase",
      color: T.muted, marginBottom: 10, marginTop: 4,
    }}>{children}</div>
  );
}
