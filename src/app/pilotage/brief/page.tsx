"use client";

import { useEffect, useState, useMemo } from "react";
import { RequireRole } from "@/components/RequireRole";
import { useEtablissement } from "@/lib/EtablissementContext";
import { PilotageSwipeWrapper } from "@/components/layout/PilotageSwipeWrapper";
import { fetchApi } from "@/lib/fetchApi";

/* ── Types ── */
type BriefData = {
  ca_ttc: number; ca_ht: number; couverts: number; tickets: number;
  day_ttc: number[]; day_ht: number[]; day_cov: number[];
  dates: string[]; days: string[];
  food_ttc?: number; food_ht?: number; drink_ttc?: number; drink_ht?: number;
  place_sur_ttc: number; place_emp_ttc: number; cov_sur: number; cov_emp: number;
  ratios: Record<string, { tables: number; coverts: number; ca_ttc: number; ca_ht: number }>;
  serveurs: string[]; serv_ca_ttc: number[]; serv_cov: number[];
  bottom5?: { n: string; qty: number; ca_ttc: number }[];
  top10_names: string[]; top10_ca_ttc: number[]; top10_qty: number[];
  duration: { avgDurMin: number };
};

type Objectifs = Record<string, { valeur: number; unite: string }>;

/* ── Helpers ── */
const OSWALD = "var(--font-oswald), Oswald, sans-serif";
const ACCENT = "#D4775A";
const GREEN = "#4a6741";
const fmt = (n: number) => Math.round(n).toLocaleString("fr-FR");

function getLastWeekRange(): { from: string; to: string; label: string } {
  const now = new Date();
  const dow = now.getDay() || 7;
  // Last Monday to last Friday
  const lastFri = new Date(now);
  lastFri.setDate(now.getDate() - dow - 2);
  const lastMon = new Date(lastFri);
  lastMon.setDate(lastFri.getDate() - 4);
  const from = lastMon.toISOString().slice(0, 10);
  const to = lastFri.toISOString().slice(0, 10);
  const label = `${lastMon.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} au ${lastFri.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`;
  return { from, to, label };
}

/* ── Page ── */
function BriefPage() {
  const { current: etab } = useEtablissement();
  const [data, setData] = useState<BriefData | null>(null);
  const [prev, setPrev] = useState<BriefData | null>(null);
  const [objectifs, setObjectifs] = useState<Objectifs>({});
  const [loading, setLoading] = useState(true);

  const range = useMemo(() => getLastWeekRange(), []);
  const accent = etab?.couleur ?? ACCENT;

  useEffect(() => {
    if (!etab) return;
    let cancelled = false;

    const fetchAll = async () => {
      try {
        const [statsRes, objRes] = await Promise.all([
          fetchApi(`/api/ventes/stats?etablissement_id=${etab.id}&from=${range.from}&to=${range.to}`),
          fetchApi(`/api/pilotage/objectifs?etablissement_id=${etab.id}`),
        ]);

        if (cancelled) return;

        const statsJson = await statsRes.json();
        if (statsJson.stats) setData(statsJson.stats);
        if (statsJson.prev) setPrev(statsJson.prev);

        const objJson = await objRes.json();
        if (objJson.objectifs) setObjectifs(objJson.objectifs);
      } catch (e) {
        console.error("[brief] load error:", e);
      }
      if (!cancelled) setLoading(false);
    };
    fetchAll();
    return () => { cancelled = true; };
  }, [etab?.id, range.from, range.to]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!etab) {
    return (
      <RequireRole permission="performances.pilotage">
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 16px", textAlign: "center", color: "#999" }}>
          Selectionnez un etablissement.
        </div>
      </RequireRole>
    );
  }

  const S = {
    card: { background: "#fff", borderRadius: 14, padding: 20, border: "1px solid #ddd6c8", marginBottom: 12 } as const,
    sec: { fontSize: 10, fontWeight: 700 as const, color: "#999", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 10 },
    kpi: { fontSize: 28, fontWeight: 700 as const, fontFamily: OSWALD, color: "#1a1a1a" },
    label: { fontSize: 11, color: "#999", marginTop: 4 },
  };

  const W = data;

  return (
    <PilotageSwipeWrapper accent={accent} dateFrom={range.from} dateTo={range.to}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "20px 16px 100px" }}>

        {/* Header */}
        <div style={{
          background: `linear-gradient(135deg, ${accent} 0%, ${accent}dd 100%)`,
          borderRadius: 16, padding: "24px 20px", color: "#fff", marginBottom: 14,
        }}>
          <div style={{ fontFamily: OSWALD, fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
            Brief du lundi · {etab.nom}
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,.8)" }}>
            Semaine du {range.label}
          </div>
        </div>

        {loading && <div style={{ textAlign: "center", padding: 40, color: "#999" }}>Chargement...</div>}

        {W && !loading && (<>

          {/* KPIs principaux */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
            <div style={S.card}>
              <div style={S.sec}>CA net TTC</div>
              <div style={S.kpi}>{fmt(W.ca_ttc)}{"\u20AC"}</div>
              {prev && prev.ca_ttc > 0 && (() => {
                const d = ((W.ca_ttc - prev.ca_ttc) / prev.ca_ttc * 100);
                return <div style={{ ...S.label, color: d >= 0 ? GREEN : "#DC2626", fontWeight: 600 }}>{d >= 0 ? "+" : ""}{d.toFixed(1)}% vs N-1</div>;
              })()}
            </div>
            <div style={S.card}>
              <div style={S.sec}>Couverts</div>
              <div style={S.kpi}>{W.couverts}</div>
              {prev && prev.couverts > 0 && (() => {
                const d = ((W.couverts - prev.couverts) / prev.couverts * 100);
                return <div style={{ ...S.label, color: d >= 0 ? GREEN : "#DC2626", fontWeight: 600 }}>{d >= 0 ? "+" : ""}{d.toFixed(1)}% vs N-1</div>;
              })()}
            </div>
            <div style={S.card}>
              <div style={S.sec}>Ticket moyen</div>
              <div style={S.kpi}>{W.cov_sur > 0 ? (W.place_sur_ttc / W.cov_sur).toFixed(1) : "0"}{"\u20AC"}</div>
              <div style={S.label}>sur place</div>
            </div>
            <div style={S.card}>
              <div style={S.sec}>vs Objectif</div>
              {(() => {
                const objCA = objectifs["ca_mensuel"]?.valeur;
                if (!objCA) return <div style={S.kpi}>{"\u2014"}</div>;
                const d = ((W.ca_ttc - objCA) / objCA * 100);
                return (<>
                  <div style={{ ...S.kpi, color: d >= 0 ? GREEN : "#DC2626" }}>{d >= 0 ? "+" : ""}{d.toFixed(1)}%</div>
                  <div style={S.label}>obj. {fmt(objCA)}{"\u20AC"}</div>
                </>);
              })()}
            </div>
          </div>

          {/* CA par jour */}
          <div style={S.card}>
            <div style={S.sec}>CA par jour</div>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${W.dates.length}, 1fr)`, gap: 6 }}>
              {W.dates.map((_, i) => {
                const maxCA = Math.max(...W.day_ttc, 1);
                const pct = W.day_ttc[i] / maxCA * 100;
                return (
                  <div key={i} style={{ textAlign: "center" }}>
                    <div style={{ height: 60, display: "flex", alignItems: "flex-end", justifyContent: "center", marginBottom: 4 }}>
                      <div style={{ width: "100%", maxWidth: 40, height: `${Math.max(pct, 3)}%`, background: accent, borderRadius: "4px 4px 0 0", opacity: 0.4 + 0.6 * (pct / 100) }} />
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, fontFamily: OSWALD }}>{fmt(W.day_ttc[i])}</div>
                    <div style={{ fontSize: 10, color: "#999" }}>{W.days[i]?.slice(0, 3)}</div>
                    <div style={{ fontSize: 10, color: "#999" }}>{W.day_cov[i]} cvt</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 3 points du matin */}
          <div style={{ ...S.card, borderLeft: `4px solid ${accent}` }}>
            <div style={{ ...S.sec, color: accent }}>3 points a dire ce matin</div>
            <div style={{ fontSize: 13, lineHeight: 1.7 }}>
              <div style={{ marginBottom: 8 }}>
                <strong>1.</strong> {prev ? (() => {
                  const d = ((W.ca_ttc - prev.ca_ttc) / prev.ca_ttc * 100);
                  return `${d >= 0 ? "+" : ""}${d.toFixed(1)}% vs l'an dernier : ${fmt(W.ca_ttc)}\u20AC de CA, ${W.couverts} couverts (${prev ? `${((W.couverts - prev.couverts) / prev.couverts * 100).toFixed(1)}%` : ""}). `;
                })() : `${fmt(W.ca_ttc)}\u20AC de CA cette semaine, ${W.couverts} couverts.`}
              </div>
              <div style={{ marginBottom: 8 }}>
                <strong>2.</strong> Ecarts d&apos;attache a combler :{" "}
                {(() => {
                  const gaps: string[] = [];
                  const check = (label: string, key: string, ratioKey: string) => {
                    const obj = objectifs[key]?.valeur;
                    const ratio = W.ratios[ratioKey as keyof typeof W.ratios];
                    if (!obj || !ratio) return;
                    const pct = W.tickets > 0 ? Math.round(ratio.tables / W.tickets * 100) : 0;
                    const diff = pct - obj;
                    if (diff < -5) gaps.push(`${label} (${pct}% / obj ${obj})`);
                  };
                  check("Desserts", "attache_desserts", "dolci");
                  check("Vins", "attache_vins", "vin");
                  check("Antipasti", "attache_antipasti", "anti");
                  check("Plats", "attache_plats", "plats");
                  return gaps.length > 0 ? gaps.join(" et ") + ". On pousse ces categories." : "Tous les objectifs d'attache sont atteints.";
                })()}
              </div>
              <div>
                <strong>3.</strong> {W.food_ttc && W.drink_ttc ? `Food ${Math.round((W.food_ttc / (W.food_ttc + W.drink_ttc)) * 100)}% / Boissons ${Math.round((W.drink_ttc / (W.food_ttc + W.drink_ttc)) * 100)}% du CA.` : ""}{" "}
                {W.duration?.avgDurMin ? `Duree moyenne de table : ${W.duration.avgDurMin} min.` : ""}
              </div>
            </div>
          </div>

          {/* Taux d'attache vs objectif */}
          <div style={S.card}>
            <div style={S.sec}>Taux d&apos;attache vs objectif</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {[
                { label: "Antipasti", key: "attache_antipasti", ratio: "anti", color: "#D4775A" },
                { label: "Pizzas", key: "attache_pizzas", ratio: "pizze", color: "#c94c2c" },
                { label: "Plats", key: "attache_plats", ratio: "plats", color: "#8a6b3e" },
                { label: "Desserts", key: "attache_desserts", ratio: "dolci", color: "#b5904a" },
                { label: "Vins", key: "attache_vins", ratio: "vin", color: "#7c5c3a" },
                { label: "Alcool", key: "attache_alcool", ratio: "alcool", color: "#c15f2e" },
              ].map(({ label, key, ratio, color }) => {
                const obj = objectifs[key]?.valeur ?? 0;
                const r = W.ratios[ratio as keyof typeof W.ratios];
                if (!r) return null;
                const pct = W.tickets > 0 ? Math.round(r.tables / W.tickets * 100) : 0;
                const diff = pct - obj;
                const isGap = diff < -5;
                return (
                  <div key={key} style={{ padding: "10px 12px", borderRadius: 10, background: isGap ? "#DC262608" : "#f9f6f0", border: isGap ? "1px solid #DC262620" : "1px solid transparent" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4 }}>{label}</div>
                    <div style={{ fontFamily: OSWALD, fontSize: 22, fontWeight: 700, color: "#1a1a1a" }}>{pct}%</div>
                    <div style={{ fontSize: 10, color: diff >= 0 ? GREEN : "#DC2626", fontWeight: 600 }}>
                      {diff >= 0 ? "+" : ""}{diff} pt · obj {obj}%
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Performance serveurs */}
          {W.serveurs.length > 0 && (
            <div style={S.card}>
              <div style={S.sec}>Performance serveurs</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #ddd6c8" }}>
                    <th style={{ textAlign: "left", padding: "8px 0", fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>Serveur</th>
                    <th style={{ textAlign: "right", padding: "8px 4px", fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>CA</th>
                    <th style={{ textAlign: "right", padding: "8px 4px", fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>Couverts</th>
                    <th style={{ textAlign: "right", padding: "8px 0", fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>TM</th>
                  </tr>
                </thead>
                <tbody>
                  {W.serveurs.map((s, i) => {
                    const ca = W.serv_ca_ttc[i] ?? 0;
                    const cov = W.serv_cov[i] ?? 0;
                    const tm = cov > 0 ? (ca / cov).toFixed(1) : "\u2014";
                    return (
                      <tr key={s} style={{ borderBottom: "1px solid #f0ebe3" }}>
                        <td style={{ padding: "8px 0", fontWeight: 600 }}>{s}</td>
                        <td style={{ padding: "8px 4px", textAlign: "right", fontFamily: OSWALD, fontWeight: 700, color: accent }}>{fmt(ca)}{"\u20AC"}</td>
                        <td style={{ padding: "8px 4px", textAlign: "right" }}>{cov}</td>
                        <td style={{ padding: "8px 0", textAlign: "right", fontWeight: 600 }}>{tm}{"\u20AC"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Plats qui dorment */}
          {W.bottom5 && W.bottom5.length > 0 && (
            <div style={S.card}>
              <div style={S.sec}>Plats qui dorment · a valoriser</div>
              {W.bottom5.map((p, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: i < W.bottom5!.length - 1 ? "1px solid #f0ebe3" : "none", fontSize: 12 }}>
                  <span style={{ color: "#555" }}>{p.n}</span>
                  <span style={{ color: "#999" }}>x{p.qty} · {fmt(p.ca_ttc)}{"\u20AC"}</span>
                </div>
              ))}
            </div>
          )}

          {/* Top 5 produits */}
          {W.top10_names.length > 0 && (
            <div style={S.card}>
              <div style={S.sec}>Top 5 produits</div>
              {W.top10_names.slice(0, 5).map((n, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: i < 4 ? "1px solid #f0ebe3" : "none", fontSize: 12 }}>
                  <span style={{ fontWeight: 500 }}><span style={{ color: "#bbb", marginRight: 6 }}>{i + 1}</span>{n}</span>
                  <span style={{ fontFamily: OSWALD, fontWeight: 700, color: accent }}>{fmt(W.top10_ca_ttc[i])}{"\u20AC"} <span style={{ color: "#999", fontWeight: 400, fontFamily: "inherit" }}>x{W.top10_qty[i]}</span></span>
                </div>
              ))}
            </div>
          )}

          {/* Footer */}
          <div style={{ textAlign: "center", fontSize: 10, color: "#bbb", padding: "20px 0" }}>
            Brief genere automatiquement · {etab.nom} · iFratelli Group
          </div>

        </>)}
      </div>
    </PilotageSwipeWrapper>
  );
}

export default function BriefPageWrapper() {
  return (
    <RequireRole permission="performances.pilotage">
      <BriefPage />
    </RequireRole>
  );
}
