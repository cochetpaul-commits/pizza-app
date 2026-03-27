"use client";

import { useEffect, useState, useRef, useCallback, type CSSProperties } from "react";
import { RequireRole } from "@/components/RequireRole";
import { useEtablissement } from "@/lib/EtablissementContext";
import Chart from "chart.js/auto";

/* ── Types ── */
type WeekData = {
  dates: string[];
  days: string[];
  ca_ttc: number; ca_ht: number; couverts: number; ann_pct: number;
  day_ttc: number[]; day_ht: number[]; day_cov: number[];
  tm_ttc: number[]; tm_ht: number[];
  zones: Record<string, number[]>;
  place_sur: number; place_emp: number; cov_sur: number; cov_emp: number;
  services: {
    jour: string; svc: string; ttc: number; ht: number; cov: number; tm: number;
    sp: number; emp: number; sp_tkt: number; tm_sp: number;
    z: Record<string, number>;
  }[];
  mix_labels: string[]; mix_ttc: number[]; mix_ht: number[];
  top10_names: string[]; top10_ca: number[]; top10_qty: number[];
  cat_products: Record<string, { n: string; qty: number; ca: number }[]>;
  top3_cats: { cat: string; rows: { n: string; ca: string }[]; flop: { n: string; ca: string; qty: number } | null }[];
  serveurs: string[]; serv_ca: number[];
  ratios: { anti: number; anti_n: number; dolci: number; dolci_n: number; vin: number; vin_n: number };
};

type ViewTab = "jour" | "semaine" | "mois";

/* ── Helpers ── */
const fmt = (v: number) => Math.round(v).toLocaleString("fr-FR") + "\u20AC";
const fmtK = (v: number) => "\u20AC" + Math.round(v / 1000) + "k";
const ZC: Record<string, string> = { Salle: "#46655a", Pergolas: "#5e8278", Terrasse: "#c4a882", emp: "#D4775A" };
const MIX_COLORS = ["#D4775A", "#8fa8a0", "#46655a", "#7c5c3a", "#c4a882", "#e0b896", "#5e7a8a", "#a8b89c"];

/* ── Chart helper ── */
const charts: Record<string, Chart> = {};
function destroyChart(id: string) { if (charts[id]) { charts[id].destroy(); delete charts[id]; } }

/* ── Styles ── */
const S = {
  card: { background: "#fff", borderRadius: 12, padding: "18px 20px", border: "1px solid #e0d8ce", marginBottom: 14 } as CSSProperties,
  sec: { fontSize: 9, textTransform: "uppercase" as const, letterSpacing: ".12em", color: "#777", fontWeight: 500, marginBottom: 12 } as CSSProperties,
  bigNum: { fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 46, fontWeight: 700, color: "#fff", lineHeight: 1, letterSpacing: "-.02em" } as CSSProperties,
};

/* ══════════════════════════════════════════════════════
   COMPONENT
   ══════════════════════════════════════════════════════ */

export default function PerformancesPage() {
  const { current: etab } = useEtablissement();
  const accent = etab?.couleur ?? "#D4775A";

  const [viewTab, setViewTab] = useState<ViewTab>("semaine");
  const [mode, setMode] = useState<"ttc" | "ht">("ttc");
  const [data, setData] = useState<WeekData | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const [mixDDOpen, setMixDDOpen] = useState<{ label: string; color: string } | null>(null);

  // Date navigation
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));

  // Compute date range based on viewTab
  const getRange = useCallback(() => {
    const d = new Date(selectedDate + "T12:00:00");
    if (viewTab === "jour") {
      return { from: selectedDate, to: selectedDate };
    }
    if (viewTab === "semaine") {
      const dow = d.getDay() || 7;
      const mon = new Date(d);
      mon.setDate(d.getDate() - dow + 1);
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);
      return { from: mon.toISOString().slice(0, 10), to: sun.toISOString().slice(0, 10) };
    }
    // mois
    const first = new Date(d.getFullYear(), d.getMonth(), 1);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) };
  }, [selectedDate, viewTab]);

  // Load data
  const loadData = useCallback(async () => {
    if (!etab) return;
    setLoading(true);
    const { from, to } = getRange();
    try {
      const res = await fetch(`/api/ventes/stats?etablissement_id=${etab.id}&from=${from}&to=${to}`);
      const json = await res.json();
      if (json.empty || !json.stats) {
        setData(null);
      } else {
        setData(json.stats);
      }
    } catch {
      setData(null);
    }
    setLoading(false);
  }, [etab, getRange]);

  useEffect(() => { loadData(); }, [loadData]);

  // Import handler
  const handleImport = async (file: File) => {
    if (!etab) return;
    setImporting(true);
    setImportMsg("");
    const fd = new FormData();
    fd.append("file", file);
    fd.append("etablissement_id", etab.id);
    try {
      const res = await fetch("/api/ventes/import", { method: "POST", body: fd });
      const json = await res.json();
      if (json.ok) {
        setImportMsg(`${json.inserted} lignes importees (${json.range})`);
        loadData();
      } else {
        setImportMsg("Erreur : " + (json.error || "inconnue"));
      }
    } catch (e) {
      setImportMsg("Erreur : " + String(e));
    }
    setImporting(false);
  };

  // Navigate dates
  const navigate = (dir: -1 | 1) => {
    const d = new Date(selectedDate + "T12:00:00");
    if (viewTab === "jour") d.setDate(d.getDate() + dir);
    else if (viewTab === "semaine") d.setDate(d.getDate() + dir * 7);
    else d.setMonth(d.getMonth() + dir);
    setSelectedDate(d.toISOString().slice(0, 10));
  };

  const { from, to } = getRange();
  const rangeLabel = viewTab === "jour"
    ? new Date(selectedDate + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : viewTab === "semaine"
      ? `Semaine du ${new Date(from + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} au ${new Date(to + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}`
      : new Date(selectedDate + "T12:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  const W = data;
  const ca = W ? (mode === "ttc" ? W.ca_ttc : W.ca_ht) : 0;

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "16px 16px 60px" }}>

        {/* ── Import + View tabs ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", gap: 0, background: "#fff", border: "1px solid rgba(0,0,0,.08)", borderRadius: 10, overflow: "hidden" }}>
            {(["jour", "semaine", "mois"] as ViewTab[]).map(t => (
              <button key={t} type="button" onClick={() => setViewTab(t)} style={{
                padding: "8px 18px", border: "none", borderRight: "1px solid rgba(0,0,0,.08)",
                background: viewTab === t ? accent : "transparent",
                color: viewTab === t ? "#fff" : "#777",
                fontSize: 12, fontWeight: 600, cursor: "pointer",
                fontFamily: "var(--font-oswald), Oswald, sans-serif", textTransform: "uppercase", letterSpacing: ".05em",
              }}>
                {t === "jour" ? "Journalier" : t === "semaine" ? "Hebdomadaire" : "Mensuel"}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <label style={{
              padding: "7px 14px", borderRadius: 8, border: "none",
              background: accent, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer",
            }}>
              {importing ? "Import..." : "Importer XLSX"}
              <input type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={e => {
                const f = e.target.files?.[0];
                if (f) handleImport(f);
                e.target.value = "";
              }} />
            </label>
            <div style={{ display: "flex", gap: 0, background: "#fff", border: "1px solid rgba(0,0,0,.08)", borderRadius: 20, padding: 3 }}>
              <button type="button" onClick={() => setMode("ttc")} style={{
                padding: "4px 14px", borderRadius: 16, border: "none", cursor: "pointer",
                background: mode === "ttc" ? accent : "transparent", color: mode === "ttc" ? "#fff" : "#777",
                fontSize: 11, fontWeight: 500,
              }}>TTC</button>
              <button type="button" onClick={() => setMode("ht")} style={{
                padding: "4px 14px", borderRadius: 16, border: "none", cursor: "pointer",
                background: mode === "ht" ? accent : "transparent", color: mode === "ht" ? "#fff" : "#777",
                fontSize: 11, fontWeight: 500,
              }}>HT</button>
            </div>
          </div>
        </div>
        {importMsg && <div style={{ fontSize: 12, color: accent, marginBottom: 10 }}>{importMsg}</div>}

        {/* ── Date navigation ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, paddingBottom: 14, borderBottom: "1px solid rgba(70,101,90,.2)" }}>
          <div>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".16em", color: accent, fontWeight: 500, marginBottom: 4 }}>
              {etab?.nom ?? "Etablissement"} · {viewTab === "jour" ? "Rapport journalier" : viewTab === "semaine" ? "Briefing hebdomadaire" : "Rapport mensuel"}
            </div>
            <h1 style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: "-.01em" }}>
              {rangeLabel}
            </h1>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => navigate(-1)} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid #e0d8ce", background: "#fff", cursor: "pointer", fontSize: 16 }}>&larr;</button>
            <button type="button" onClick={() => navigate(1)} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid #e0d8ce", background: "#fff", cursor: "pointer", fontSize: 16 }}>&rarr;</button>
          </div>
        </div>

        {/* ── Loading / Empty ── */}
        {loading && <div style={{ textAlign: "center", padding: 60, color: "#999" }}>Chargement...</div>}

        {!loading && !W && (
          <div style={{ ...S.card, textAlign: "center", padding: 60 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#1a1a1a", marginBottom: 6 }}>Aucune donnee pour cette periode</div>
            <div style={{ fontSize: 12, color: "#777" }}>Importez un fichier XLSX pour alimenter le dashboard.</div>
          </div>
        )}

        {/* ── Dashboard ── */}
        {!loading && W && (
          <>
            {/* CA Hero card */}
            <div style={{ ...S.card, padding: 0, overflow: "hidden", marginBottom: 18 }}>
              <div style={{
                background: `linear-gradient(135deg, ${accent}cc 0%, ${accent} 60%, ${accent}bb 100%)`,
                padding: "22px 24px 20px", position: "relative",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".16em", color: "rgba(255,255,255,.5)", fontWeight: 500, marginBottom: 8 }}>
                      CA {mode.toUpperCase()} — {viewTab === "jour" ? "Journee" : viewTab === "semaine" ? "Semaine" : "Mois"}
                    </div>
                    <div style={S.bigNum}>{fmt(ca)}</div>
                    {mode === "ttc" && <div style={{ fontSize: 12, color: "rgba(255,255,255,.55)", marginTop: 6 }}>HT <span style={{ color: "rgba(255,255,255,.7)", fontWeight: 500 }}>{fmt(W.ca_ht)}</span></div>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 28, marginTop: 18, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,.12)" }}>
                  <div>
                    <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".12em", color: "rgba(255,255,255,.45)", fontWeight: 500, marginBottom: 4 }}>Tickets</div>
                    <div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 24, fontWeight: 700, color: "#fff" }}>{W.couverts}</div>
                  </div>
                  <div style={{ width: 1, background: "rgba(255,255,255,.1)" }} />
                  <div>
                    <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".12em", color: "rgba(255,255,255,.45)", fontWeight: 500, marginBottom: 4 }}>TM / ticket</div>
                    <div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 24, fontWeight: 700, color: "#fff" }}>
                      {W.couverts > 0 ? "\u20AC" + (ca / W.couverts).toFixed(1) : "\u2014"}
                    </div>
                    {W.cov_sur > 0 && <div style={{ fontSize: 10, color: "rgba(255,255,255,.5)", marginTop: 2 }}>Sur place <span style={{ color: "rgba(255,255,255,.7)", fontWeight: 500 }}>{"\u20AC" + (W.place_sur / W.cov_sur).toFixed(1)}</span></div>}
                  </div>
                  <div style={{ width: 1, background: "rgba(255,255,255,.1)" }} />
                  <div>
                    <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".12em", color: "rgba(255,255,255,.45)", fontWeight: 500, marginBottom: 4 }}>Annulations</div>
                    <div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 24, fontWeight: 700, color: "#fff" }}>{W.ann_pct.toFixed(1)}%</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Upsell ratios */}
            <div style={S.card}>
              <div style={S.sec}>Upsell · performance</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                <UpsellCard label="Antipasti" emoji="🥗" n={W.ratios.anti_n} total={W.couverts} color="#D4775A" targets={{ ok: 30, good: 50, avg: 12 }} />
                <UpsellCard label="Desserts" emoji="🍮" n={W.ratios.dolci_n} total={W.couverts} color="#b5904a" targets={{ ok: 80, good: 100, avg: 9 }} />
                <UpsellCard label="Vins" emoji="🍷" n={W.ratios.vin_n} total={W.couverts} color="#7c5c3a" targets={{ ok: 60, good: 80, avg: 6 }} />
              </div>
            </div>

            {/* Zones */}
            {W.days.length > 1 && (
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${Object.keys(W.zones).filter(z => W.zones[z].some(v => v > 0)).length}, 1fr)`, gap: 10, marginBottom: 6 }}>
                {Object.entries(W.zones).filter(([, vals]) => vals.some(v => v > 0)).map(([zone, vals]) => {
                  const tot = vals.reduce((a, b) => a + b, 0);
                  const maxV = Math.max(...vals.filter(Boolean));
                  const color = ZC[zone === "\u00C0 emporter" ? "emp" : zone] ?? "#888";
                  return (
                    <div key={zone} style={{ ...S.card, padding: "14px 16px" }}>
                      <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".1em", color, fontWeight: 600, marginBottom: 8 }}>{zone}</div>
                      <div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 26, fontWeight: 700, marginBottom: 10 }}>{fmt(tot)}</div>
                      {W.days.map((d, i) => (
                        <div key={d} style={{ marginBottom: 7 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
                            <span style={{ color: "#777" }}>{d.slice(0, 3)}</span>
                            {vals[i] > 0 ? <span style={{ fontWeight: 500 }}>{fmt(vals[i])}</span> : <span style={{ color: "#bbb" }}>{"\u2014"}</span>}
                          </div>
                          <div style={{ height: 4, background: "rgba(0,0,0,.07)", borderRadius: 2, overflow: "hidden" }}>
                            {vals[i] > 0 && <div style={{ height: "100%", width: `${maxV ? (vals[i] / maxV * 100) : 0}%`, background: color, borderRadius: 2 }} />}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Sur place vs emporter */}
            <div style={S.card}>
              <div style={S.sec}>Sur place vs a emporter</div>
              <div style={{ display: "flex", gap: 0 }}>
                <PlaceBlock label="Sur place" color="#46655a" ca={W.place_sur} pct={W.place_sur + W.place_emp > 0 ? Math.round(W.place_sur / (W.place_sur + W.place_emp) * 100) : 0} tickets={W.cov_sur} tm={W.cov_sur > 0 ? (W.place_sur / W.cov_sur).toFixed(1) : "0"} />
                <div style={{ width: 1, background: "rgba(0,0,0,.08)", margin: "0 20px", flexShrink: 0 }} />
                <PlaceBlock label="A emporter" color="#D4775A" ca={W.place_emp} pct={W.place_sur + W.place_emp > 0 ? Math.round(W.place_emp / (W.place_sur + W.place_emp) * 100) : 0} tickets={W.cov_emp} tm={W.cov_emp > 0 ? (W.place_emp / W.cov_emp).toFixed(1) : "0"} />
              </div>
            </div>

            {/* Recap table */}
            {W.services.length > 0 && (
              <div style={S.card}>
                <div style={S.sec}>Par service · {mode.toUpperCase()} · tickets</div>
                <div style={{ overflow: "hidden", borderRadius: 8, border: "1px solid #e0d8ce" }}>
                  <RecapTable services={W.services} mode={mode} />
                </div>
              </div>
            )}

            {/* Mix chart */}
            <div style={S.card}>
              <div style={{ ...S.sec, marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Ventes par categorie · CA {mode.toUpperCase()}</span>
                <span style={{ fontSize: 10, color: "#777", fontStyle: "italic", textTransform: "none", letterSpacing: 0 }}>Cliquer une barre pour le detail</span>
              </div>
              <ChartCanvas id="mix" height={220} data={W} mode={mode} type="mix" onBarClick={(label, color) => setMixDDOpen({ label, color })} />
              {mixDDOpen && W.cat_products[mixDDOpen.label] && (
                <MixDropdown label={mixDDOpen.label} color={mixDDOpen.color} products={W.cat_products[mixDDOpen.label]} onClose={() => setMixDDOpen(null)} />
              )}
            </div>

            {/* Top 10 */}
            <div style={S.card}>
              <div style={S.sec}>Top 10 produits · CA TTC</div>
              <ChartCanvas id="top10" height={380} data={W} mode={mode} type="top10" />
            </div>

            {/* Top 3 par categorie */}
            {W.top3_cats.length > 0 && (
              <div style={S.card}>
                <div style={S.sec}>Top 3 par categorie</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                  {W.top3_cats.map((cat, ci) => (
                    <div key={ci} style={{ background: "#fff", borderRadius: 10, padding: "12px 14px", border: "1px solid rgba(0,0,0,.08)" }}>
                      <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".1em", color: MIX_COLORS[ci] ?? "#777", fontWeight: 500, marginBottom: 8 }}>{cat.cat}</div>
                      {cat.rows.map((r, ri) => (
                        <div key={ri} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: "1px solid rgba(0,0,0,.04)", fontSize: 11 }}>
                          <span><span style={{ fontSize: 9, color: "#bbb", marginRight: 4 }}>{ri + 1}</span>{r.n}</span>
                          <span style={{ fontFamily: "var(--font-cormorant), Cormorant Garamond, serif", fontSize: 13, fontWeight: 600, color: accent }}>{r.ca}</span>
                        </div>
                      ))}
                      {cat.flop && (
                        <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0 2px", marginTop: 4, borderTop: "1px dashed rgba(0,0,0,.08)", fontSize: 11 }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ fontSize: 9, color: "#c62828", fontWeight: 600 }}>▼</span><span style={{ color: "#777" }}>{cat.flop.n}</span></span>
                          <span style={{ fontFamily: "var(--font-cormorant), Cormorant Garamond, serif", fontSize: 13, fontWeight: 600, color: "#777" }}>{cat.flop.ca}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Serveurs */}
            {W.serveurs.length > 0 && (
              <div style={S.card}>
                <div style={S.sec}>Performance serveurs · CA TTC</div>
                <ChartCanvas id="serv" height={Math.max(120, W.serveurs.length * 38)} data={W} mode={mode} type="serv" />
              </div>
            )}
          </>
        )}
      </div>
    </RequireRole>
  );
}

/* ── Sub-components ── */

function UpsellCard({ label, emoji, n, total, color, targets }: {
  label: string; emoji: string; n: number; total: number; color: string;
  targets: { ok: number; good: number; avg: number };
}) {
  const pct = total > 0 ? Math.round(n / total * 100) : 0;
  const missing = Math.max(0, total - n);
  const gain = missing * targets.avg;
  const status = pct >= targets.good ? { t: "Objectif atteint", c: "#2e7d32", bg: "#e8f5e9" }
    : pct >= targets.ok ? { t: "En progression", c: "#e65100", bg: "#fff3e0" }
    : { t: "A travailler", c: "#c62828", bg: "#ffebee" };

  return (
    <div style={{ padding: "14px 16px", background: "#f9f6f0", borderRadius: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 18 }}>{emoji}</span>
        <span style={{ fontSize: 12, fontWeight: 500 }}>{label}</span>
      </div>
      <div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 26, fontWeight: 700, color, lineHeight: 1, marginBottom: 4 }}>{pct}%</div>
      <div style={{ fontSize: 12, color: "#777", marginBottom: 10 }}>des tables · <strong style={{ color: "#1a1a1a" }}>{n > 0 ? `1 table sur ${Math.round(total / n)}` : "\u2014"}</strong></div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 8 }}>
        <span style={{ color: "#777" }}>{n} sur {total} tickets</span>
        <span style={{ color, fontWeight: 500 }}>+{fmt(gain)} potentiel</span>
      </div>
      <div style={{ position: "relative", height: 8, background: "rgba(0,0,0,.07)", borderRadius: 4, overflow: "hidden", marginBottom: 8 }}>
        <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: `${Math.min(100, pct)}%`, background: color, borderRadius: 4 }} />
        <div style={{ position: "absolute", top: 0, left: `${targets.ok}%`, height: "100%", width: 2, background: "rgba(0,0,0,.15)" }} />
        <div style={{ position: "absolute", top: 0, left: `${targets.good}%`, height: "100%", width: 2, background: "rgba(0,0,0,.25)" }} />
      </div>
      <div style={{ display: "inline-block", padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 500, background: status.bg, color: status.c }}>{status.t}</div>
    </div>
  );
}

function PlaceBlock({ label, color, ca, pct, tickets, tm }: { label: string; color: string; ca: number; pct: number; tickets: number; tm: string }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".1em", fontWeight: 600, color }}>{label}</div>
        <div style={{ fontSize: 10, color: "#777" }}>{pct}% du CA</div>
      </div>
      <div style={{ height: 4, background: "rgba(0,0,0,.06)", borderRadius: 2, overflow: "hidden", marginBottom: 14 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 2 }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        <div><div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 20, fontWeight: 700 }}>{fmt(ca)}</div><div style={{ fontSize: 9, color: "#777", textTransform: "uppercase", marginTop: 2 }}>CA</div></div>
        <div><div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 20, fontWeight: 700 }}>{tickets}</div><div style={{ fontSize: 9, color: "#777", textTransform: "uppercase", marginTop: 2 }}>Tickets</div></div>
        <div><div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 20, fontWeight: 700, color }}>{"\u20AC" + tm}</div><div style={{ fontSize: 9, color: "#777", textTransform: "uppercase", marginTop: 2 }}>TM</div></div>
      </div>
    </div>
  );
}

function RecapTable({ services, mode }: { services: WeekData["services"]; mode: "ttc" | "ht" }) {
  const byDay: Record<string, WeekData["services"]> = {};
  for (const s of services) {
    if (!byDay[s.jour]) byDay[s.jour] = [];
    byDay[s.jour].push(s);
  }
  const days = Object.keys(byDay);

  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
      <thead>
        <tr style={{ background: "#f5f0e8" }}>
          <th style={thSt("left")}>Jour</th>
          <th style={thSt("left")}>Svc</th>
          <th style={{ ...thSt(), color: ZC.Salle }}>Salle</th>
          <th style={{ ...thSt(), color: ZC.Pergolas }}>Pergolas</th>
          <th style={{ ...thSt(), color: ZC.Terrasse }}>Terrasse</th>
          <th style={{ ...thSt(), color: ZC.emp }}>Emp.</th>
          <th style={{ ...thSt(), color: "#D4775A" }}>Total</th>
          <th style={thSt()}>TM sp.</th>
        </tr>
      </thead>
      <tbody>
        {days.map((jour, di) => {
          const svcs = byDay[jour];
          return svcs.map((s, si) => {
            const caVal = mode === "ttc" ? s.ttc : s.ht;
            const bg = di % 2 === 0 ? "#fff" : "#faf7f2";
            const tmColor = s.tm_sp >= 80 ? "#2e7d32" : s.tm_sp >= 65 ? "#e65100" : "#c62828";
            const tmBg = s.tm_sp >= 80 ? "#e8f5e9" : s.tm_sp >= 65 ? "#fff3e0" : "#ffebee";
            return (
              <tr key={`${jour}-${s.svc}`} style={{ background: bg, borderTop: si === 0 && di > 0 ? "1px solid #e0d8ce" : si > 0 ? "1px solid rgba(0,0,0,.05)" : "none" }}>
                {si === 0 && <td rowSpan={svcs.length} style={{ padding: "0 16px", fontWeight: 700, fontSize: 15, verticalAlign: "middle", borderRight: "1px solid #e0d8ce" }}>{jour}</td>}
                <td style={tdSt}><span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: s.svc === "midi" ? ZC.Pergolas : "#1a1a1a" }}>{s.svc === "midi" ? "Midi" : "Soir"}</span></td>
                {zCell(s.z.Salle, ZC.Salle)}
                {zCell(s.z.Pergolas, ZC.Pergolas)}
                {zCell(s.z.Terrasse, ZC.Terrasse)}
                {zCell(s.z.emp, ZC.emp)}
                <td style={{ ...tdSt, fontWeight: 700, fontSize: 13, color: "#D4775A" }}>{fmt(caVal)}</td>
                <td style={tdSt}><span style={{ background: tmBg, color: tmColor, padding: "3px 9px", borderRadius: 5, fontSize: 11, fontWeight: 700 }}>{s.tm_sp.toFixed(0)}{"\u20AC"}</span></td>
              </tr>
            );
          });
        })}
      </tbody>
    </table>
  );
}

function zCell(val: number | undefined, color: string) {
  if (!val) return <td style={{ ...tdSt, color: "rgba(0,0,0,.2)" }}>{"\u2014"}</td>;
  return <td style={{ ...tdSt, fontWeight: 600, color }}>{fmt(val)}</td>;
}

const thSt = (align: "left" | "right" = "right"): CSSProperties => ({
  fontSize: 9, textTransform: "uppercase", letterSpacing: ".1em", fontWeight: 600,
  padding: "11px 14px", textAlign: align, whiteSpace: "nowrap", borderBottom: "1px solid #e0d8ce",
  color: "#777",
});

const tdSt: CSSProperties = { padding: "13px 14px", textAlign: "right" };

function MixDropdown({ label, color, products, onClose }: {
  label: string; color: string; products: { n: string; qty: number; ca: number }[]; onClose: () => void;
}) {
  const total = products.reduce((s, p) => s + p.ca, 0);
  const maxCA = products[0]?.ca ?? 1;
  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(0,0,0,.08)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".1em", color }}>{label} — {products.length} produits</div>
        <button type="button" onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 16, color: "#777", padding: "0 4px" }}>&times;</button>
      </div>
      {products.map((p, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: "1px solid rgba(0,0,0,.04)", fontSize: 12 }}>
          <span style={{ fontSize: 10, color: "#bbb", width: 16, textAlign: "right", flexShrink: 0 }}>{i + 1}</span>
          <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.n}</span>
          <div style={{ width: 80, height: 4, background: "rgba(0,0,0,.06)", borderRadius: 2, overflow: "hidden", flexShrink: 0 }}>
            <div style={{ height: "100%", width: `${maxCA ? Math.round(p.ca / maxCA * 100) : 0}%`, background: color, opacity: .75, borderRadius: 2 }} />
          </div>
          <span style={{ width: 36, textAlign: "right", color: "#777", flexShrink: 0, fontSize: 10 }}>{total ? (p.ca / total * 100).toFixed(1) : 0}%</span>
          <span style={{ width: 55, textAlign: "right", fontWeight: 500, flexShrink: 0, fontFamily: "var(--font-cormorant), Cormorant Garamond, serif", fontSize: 14 }}>{p.ca.toLocaleString("fr-FR")}{"\u20AC"}</span>
          <span style={{ width: 34, textAlign: "right", color: "#bbb", flexShrink: 0, fontSize: 10 }}>{p.qty}x</span>
        </div>
      ))}
    </div>
  );
}

/* ── Chart component ── */
function ChartCanvas({ id, height, data, mode, type, onBarClick }: {
  id: string; height: number; data: WeekData; mode: "ttc" | "ht"; type: "mix" | "top10" | "serv";
  onBarClick?: (label: string, color: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    destroyChart(id);

    if (type === "mix") {
      const vals = mode === "ttc" ? data.mix_ttc : data.mix_ht;
      const total = vals.reduce((a, b) => a + b, 0);
      charts[id] = new Chart(canvasRef.current, {
        type: "bar",
        data: { labels: data.mix_labels, datasets: [{ data: vals, backgroundColor: MIX_COLORS.slice(0, vals.length), borderRadius: 4, borderSkipped: false }] },
        options: {
          indexAxis: "y", responsive: true, maintainAspectRatio: false,
          layout: { padding: { right: 80 } },
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${fmt(ctx.raw as number)} — ${((ctx.raw as number) / total * 100).toFixed(1)}%` } } },
          scales: {
            x: { grid: { color: "rgba(0,0,0,0.05)" }, ticks: { callback: v => fmtK(v as number), color: "#aaa", font: { size: 11 } }, border: { display: false } },
            y: { grid: { display: false }, ticks: { color: "#444", font: { size: 12 } }, border: { display: false } },
          },
          onClick: (_evt, elements) => {
            if (elements.length && onBarClick) {
              const i = elements[0].index;
              onBarClick(data.mix_labels[i], MIX_COLORS[i % MIX_COLORS.length]);
            }
          },
        },
        plugins: [{
          id: "barLabels",
          afterDatasetsDraw(chart) {
            const ctx = chart.ctx;
            chart.data.datasets.forEach((ds, di) => {
              chart.getDatasetMeta(di).data.forEach((bar, i) => {
                const val = ds.data[i] as number;
                const pct = (val / total * 100).toFixed(0);
                ctx.save();
                ctx.font = "500 11px DM Sans, sans-serif";
                ctx.fillStyle = "#555";
                ctx.textAlign = "left";
                ctx.textBaseline = "middle";
                ctx.fillText(`${Math.round(val / 1000)}k\u20AC  ${pct}%`, bar.x + 6, bar.y);
                ctx.restore();
              });
            });
          },
        }],
      });
    }

    if (type === "top10") {
      const gradStart = [196, 90, 54], gradEnd = [240, 196, 180];
      const n = data.top10_names.length;
      const colors = data.top10_names.map((_, i) => {
        const t = n > 1 ? i / (n - 1) : 0;
        return `rgb(${Math.round(gradStart[0] + (gradEnd[0] - gradStart[0]) * t)},${Math.round(gradStart[1] + (gradEnd[1] - gradStart[1]) * t)},${Math.round(gradStart[2] + (gradEnd[2] - gradStart[2]) * t)})`;
      });
      charts[id] = new Chart(canvasRef.current, {
        type: "bar",
        data: { labels: data.top10_names, datasets: [{ data: data.top10_ca, backgroundColor: colors, borderRadius: 4 }] },
        options: {
          indexAxis: "y", responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `CA : \u20AC${(ctx.raw as number).toLocaleString("fr-FR")} \u00b7 ${data.top10_qty[ctx.dataIndex]} ventes` } } },
          scales: {
            x: { grid: { color: "rgba(0,0,0,0.05)" }, ticks: { callback: v => "\u20AC" + v, color: "#aaa", font: { size: 11 } }, border: { display: false } },
            y: { grid: { display: false }, ticks: { color: "#444", font: { size: 11 } }, border: { display: false } },
          },
        },
      });
    }

    if (type === "serv") {
      const gradStart = [46, 101, 90], gradEnd = [155, 195, 185];
      const n = data.serveurs.length;
      const colors = data.serveurs.map((_, i) => {
        const t = n > 1 ? i / (n - 1) : 0;
        return `rgb(${Math.round(gradStart[0] + (gradEnd[0] - gradStart[0]) * t)},${Math.round(gradStart[1] + (gradEnd[1] - gradStart[1]) * t)},${Math.round(gradStart[2] + (gradEnd[2] - gradStart[2]) * t)})`;
      });
      charts[id] = new Chart(canvasRef.current, {
        type: "bar",
        data: { labels: data.serveurs, datasets: [{ data: data.serv_ca, backgroundColor: colors, borderRadius: 4 }] },
        options: {
          indexAxis: "y", responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `CA : ${fmt(ctx.raw as number)} (${((ctx.raw as number) / data.ca_ttc * 100).toFixed(1)}%)` } } },
          scales: {
            x: { grid: { color: "rgba(0,0,0,0.05)" }, ticks: { callback: v => fmtK(v as number), color: "#aaa", font: { size: 11 } }, border: { display: false } },
            y: { grid: { display: false }, ticks: { color: "#444", font: { size: 12 } }, border: { display: false } },
          },
        },
      });
    }

    return () => { destroyChart(id); };
  }, [id, data, mode, type, onBarClick]);

  return <div style={{ position: "relative", height }}><canvas ref={canvasRef} /></div>;
}
