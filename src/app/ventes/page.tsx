"use client";

import { useEffect, useState, useRef, useCallback, type CSSProperties } from "react";
import { RequireRole } from "@/components/RequireRole";
import { useEtablissement } from "@/lib/EtablissementContext";
import Chart from "chart.js/auto";

/* ── Types ── */
type WeekData = {
  dates: string[];
  days: string[];
  ca_ttc: number; ca_ht: number; couverts: number; tickets: number; ann_pct: number;
  day_ttc: number[]; day_ht: number[]; day_cov: number[];
  tm_ttc: number[]; tm_ht: number[];
  zones_ttc: Record<string, number[]>; zones_ht: Record<string, number[]>;
  place_sur_ttc: number; place_sur_ht: number;
  place_emp_ttc: number; place_emp_ht: number;
  cov_sur: number; cov_emp: number;
  services: {
    jour: string; svc: string; ttc: number; ht: number; cov: number;
    tm_ttc: number; tm_ht: number;
    sp_ttc: number; sp_ht: number; emp_ttc: number; emp_ht: number;
    sp_cov: number; tm_sp_ttc: number; tm_sp_ht: number;
    z_ttc: Record<string, number>; z_ht: Record<string, number>;
  }[];
  mix_labels: string[]; mix_ttc: number[]; mix_ht: number[];
  top10_names: string[]; top10_ca_ttc: number[]; top10_ca_ht: number[]; top10_qty: number[];
  cat_products: Record<string, { n: string; qty: number; ca_ttc: number; ca_ht: number }[]>;
  top3_cats: { cat: string; rows: { n: string; ca_ttc: string; ca_ht: string }[]; flop: { n: string; ca_ttc: string; ca_ht: string; qty: number } | null }[];
  serveurs: string[]; serv_ca_ttc: number[]; serv_ca_ht: number[]; serv_tickets: number[]; serv_cov: number[];
  ratios: {
    anti: { tables: number; coverts: number; ca_ttc: number; ca_ht: number };
    dolci: { tables: number; coverts: number; ca_ttc: number; ca_ht: number };
    vin: { tables: number; coverts: number; ca_ttc: number; ca_ht: number };
    alcool: { tables: number; coverts: number; ca_ttc: number; ca_ht: number };
    boissons: { tables: number; coverts: number; ca_ttc: number; ca_ht: number };
    digestif: { tables: number; coverts: number; ca_ttc: number; ca_ht: number };
    cafe: { tables: number; coverts: number; ca_ttc: number; ca_ht: number };
    avgCovPerTable: number;
  };
  pay: { l: string; v: number; pct: number }[];
  duration: {
    avgDurMin: number;
    byZone: { zone: string; avgDur: number; tables: number; couverts: number }[];
    bySvc: { svc: string; avgDur: number; tables: number }[];
    avgRotation: number;
    rotByZone: { zone: string; avgRotation: number; maxRotation: number }[];
    totalOrders: number;
  };
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
  const [prev, setPrev] = useState<WeekData | null>(null); // A-1
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const [exporting, setExporting] = useState(false);
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
        setPrev(null);
      } else {
        setData(json.stats);
        setPrev(json.prev ?? null);
      }
    } catch {
      setData(null);
      setPrev(null);
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

  // PDF export
  const handleExportPDF = async () => {
    if (!data || !etab) return;
    setExporting(true);
    try {
      const res = await fetch("/api/ventes/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stats: data, prev, mode, viewTab, rangeLabel, etabName: etab.nom ?? "Etablissement" }),
      });
      if (!res.ok) { setExporting(false); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rapport-${viewTab}-${etab.nom?.replace(/\s/g, "_")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* ignore */ }
    setExporting(false);
  };

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
              <input type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={e => {
                const f = e.target.files?.[0];
                if (f) handleImport(f);
                e.target.value = "";
              }} />
            </label>
            {data && (
              <button type="button" onClick={handleExportPDF} disabled={exporting} style={{
                padding: "7px 14px", borderRadius: 8, border: "1px solid #e0d8ce",
                background: "#fff", color: "#1a1a1a", fontSize: 12, fontWeight: 700, cursor: "pointer",
                opacity: exporting ? 0.5 : 1,
              }}>
                {exporting ? "Export..." : "PDF"}
              </button>
            )}
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
                background: `linear-gradient(135deg, #b85a3a 0%, ${accent} 50%, #e09070 100%)`,
                padding: "22px 24px 20px", position: "relative",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".16em", color: "rgba(255,255,255,.65)", fontWeight: 600, marginBottom: 8 }}>
                      CA {mode.toUpperCase()} — {viewTab === "jour" ? "Journee" : viewTab === "semaine" ? "Semaine courante" : "Mois"}
                    </div>
                    <div style={{ ...S.bigNum, textShadow: "0 2px 8px rgba(0,0,0,.15)" }}>{fmt(ca)}</div>
                    {mode === "ttc" && <div style={{ fontSize: 13, color: "rgba(255,255,255,.7)", marginTop: 6, fontWeight: 500 }}>HT <span style={{ color: "#fff", fontWeight: 700 }}>{fmt(W.ca_ht)}</span></div>}
                  </div>
                  {prev && (() => {
                    const prevCA = mode === "ttc" ? prev.ca_ttc : prev.ca_ht;
                    const d = ca - prevCA;
                    const pct = prevCA > 0 ? (d / prevCA * 100) : 0;
                    return (
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: d >= 0 ? "rgba(165,214,167,.9)" : "#fca5a5" }}>
                          {d >= 0 ? "+" : ""}{pct.toFixed(1)}%
                        </div>
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,.4)", marginTop: 2 }}>vs A-1</div>
                      </div>
                    );
                  })()}
                </div>
                <div style={{ display: "flex", gap: 28, marginTop: 18, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,.12)" }}>
                  <div>
                    <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".12em", color: "rgba(255,255,255,.6)", fontWeight: 600, marginBottom: 4 }}>Couverts</div>
                    <div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 24, fontWeight: 700, color: "#fff", textShadow: "0 1px 4px rgba(0,0,0,.1)" }}>{W.couverts}</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,.6)", marginTop: 2 }}>{W.tickets} tickets</div>
                    {prev && <DeltaBadge cur={W.couverts} prev={prev.couverts} />}
                  </div>
                  <div style={{ width: 1, background: "rgba(255,255,255,.1)" }} />
                  <div>
                    <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".12em", color: "rgba(255,255,255,.6)", fontWeight: 600, marginBottom: 4 }}>CVT moyen</div>
                    <div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 24, fontWeight: 700, color: "#fff", textShadow: "0 1px 4px rgba(0,0,0,.1)" }}>
                      {W.couverts > 0 ? "\u20AC" + (ca / W.couverts).toFixed(1) : "\u2014"}
                    </div>
                    {W.cov_sur > 0 && <div style={{ fontSize: 10, color: "rgba(255,255,255,.6)", marginTop: 2 }}>CVT M SP <span style={{ color: "#fff", fontWeight: 700 }}>{"\u20AC" + ((mode === "ttc" ? W.place_sur_ttc : W.place_sur_ht) / W.cov_sur).toFixed(1)}</span></div>}
                    {prev && prev.couverts > 0 && <DeltaBadge cur={ca / W.couverts} prev={(mode === "ttc" ? prev.ca_ttc : prev.ca_ht) / prev.couverts} decimals={1} prefix="\u20AC" />}
                  </div>
                  <div style={{ width: 1, background: "rgba(255,255,255,.1)" }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".12em", color: "rgba(255,255,255,.6)", fontWeight: 600, marginBottom: 4 }}>vs A-1</div>
                    {prev ? (() => {
                      const prevCA = mode === "ttc" ? prev.ca_ttc : prev.ca_ht;
                      const d = ca - prevCA;
                      return (
                        <>
                          <div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 24, fontWeight: 700, color: d >= 0 ? "#a5d6a7" : "#ef9a9a", lineHeight: 1 }}>
                            {d >= 0 ? "+" : ""}{fmt(Math.abs(d))}
                          </div>
                          <div style={{ fontSize: 10, color: "rgba(255,255,255,.45)", marginTop: 3 }}>A-1 : {fmt(prevCA)}</div>
                        </>
                      );
                    })() : (
                      <div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 24, fontWeight: 700, color: "rgba(255,255,255,.3)" }}>{"\u2014"}</div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Upsell ratios */}
            <div style={S.card}>
              <div style={{ ...S.sec, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Upsell · performance de la periode</span>
                <span style={{ fontSize: 10, color: "#777", textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>
                  {W.tickets} tables · {W.couverts} couverts · moy. {W.ratios.avgCovPerTable} cvt/table
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
                <UpsellCard label="Antipasti" emoji="🥗" data={W.ratios.anti} totalTables={W.tickets} totalCov={W.couverts} color="#D4775A" targets={{ ok: 30, good: 50, avgPrice: 12 }} mode={mode} action="Suggerer en debut de service" />
                <UpsellCard label="Desserts" emoji="🍮" data={W.ratios.dolci} totalTables={W.tickets} totalCov={W.couverts} color="#b5904a" targets={{ ok: 80, good: 100, avgPrice: 9 }} mode={mode} action="Proposer systematiquement en fin de plat" />
                <UpsellCard label="Vins" emoji="🍷" data={W.ratios.vin} totalTables={W.tickets} totalCov={W.couverts} color="#7c5c3a" targets={{ ok: 60, good: 80, avgPrice: 6 }} mode={mode} action="Suggerer un verre a l'ouverture du menu" />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14 }}>
                <UpsellCardMini label="Alcool (hors vin)" emoji="🍹" data={W.ratios.alcool} totalTables={W.tickets} color="#c15f2e" mode={mode} />
                <UpsellCardMini label="Boissons (tout)" emoji="🥤" data={W.ratios.boissons} totalTables={W.tickets} color="#5e7a8a" mode={mode} />
                <UpsellCardMini label="Cafe / Chaud" emoji="☕" data={W.ratios.cafe} totalTables={W.tickets} color="#6f5c3a" mode={mode} />
                <UpsellCardMini label="Digestifs" emoji="🥃" data={W.ratios.digestif} totalTables={W.tickets} color="#46655a" mode={mode} />
              </div>
            </div>

            {/* Duration & Rotation */}
            {W.duration && W.duration.totalOrders > 0 && (() => {
              const P = prev?.duration;
              return (
              <div style={S.card}>
                <div style={S.sec}>Duree & rotation des tables</div>
                {/* KPIs row */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
                  <div style={{ background: "#f9f6f0", borderRadius: 10, padding: "12px 14px", textAlign: "center" }}>
                    <div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 28, fontWeight: 700, color: "#D4775A" }}>{W.duration.avgDurMin}<span style={{ fontSize: 14, fontWeight: 500, color: "#777" }}>min</span></div>
                    <div style={{ fontSize: 10, color: "#777", marginTop: 4 }}>Duree moy. / table</div>
                    {P && P.avgDurMin > 0 && <DeltaBadgeSmall cur={W.duration.avgDurMin} prev={P.avgDurMin} suffix="min" inverse />}
                  </div>
                  <div style={{ background: "#f9f6f0", borderRadius: 10, padding: "12px 14px", textAlign: "center" }}>
                    <div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 28, fontWeight: 700, color: "#46655a" }}>{W.duration.avgRotation}x</div>
                    <div style={{ fontSize: 10, color: "#777", marginTop: 4 }}>Rotation moy. / table</div>
                    {P && P.avgRotation > 0 && <DeltaBadgeSmall cur={W.duration.avgRotation} prev={P.avgRotation} suffix="x" />}
                  </div>
                  <div style={{ background: "#f9f6f0", borderRadius: 10, padding: "12px 14px", textAlign: "center" }}>
                    <div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 28, fontWeight: 700, color: "#7c5c3a" }}>{W.duration.totalOrders}</div>
                    <div style={{ fontSize: 10, color: "#777", marginTop: 4 }}>Tables servies</div>
                    {P && P.totalOrders > 0 && <DeltaBadgeSmall cur={W.duration.totalOrders} prev={P.totalOrders} />}
                  </div>
                </div>
                {/* By zone */}
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${W.duration.byZone.length}, 1fr)`, gap: 10, marginBottom: 10 }}>
                  {W.duration.byZone.map(z => {
                    const rot = W.duration.rotByZone.find(r => r.zone === z.zone);
                    const zKey = z.zone === "\u00C0 emporter" ? "emp" : z.zone;
                    const color = ZC[zKey] ?? "#777";
                    return (
                      <div key={z.zone} style={{ background: "#fff", borderRadius: 8, padding: "10px 12px", border: "1px solid #f0ebe3" }}>
                        <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".1em", color, fontWeight: 600, marginBottom: 6 }}>{z.zone}</div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <div>
                            <div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 20, fontWeight: 700 }}>{z.avgDur}<span style={{ fontSize: 11, color: "#777" }}>min</span></div>
                            <div style={{ fontSize: 9, color: "#777" }}>duree moy.</div>
                          </div>
                          {rot && (
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 20, fontWeight: 700, color }}>{rot.avgRotation}x</div>
                              <div style={{ fontSize: 9, color: "#777" }}>rotation</div>
                            </div>
                          )}
                        </div>
                        <div style={{ fontSize: 10, color: "#777" }}>{z.tables} tables · {z.couverts} cvts</div>
                        {rot && rot.maxRotation > 1 && (
                          <div style={{ fontSize: 10, color, fontWeight: 500, marginTop: 2 }}>max {rot.maxRotation}x rotation</div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {/* By service — Soir first, then Midi */}
                <div style={{ display: "flex", gap: 10 }}>
                  {[...W.duration.bySvc].sort((a, b) => a.svc === "soir" ? -1 : 1).map(sv => (
                    <div key={sv.svc} style={{ flex: 1, background: "#fff", borderRadius: 8, padding: "8px 12px", border: "1px solid #f0ebe3", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: sv.svc === "midi" ? "#5e8278" : "#1a1a1a" }}>{sv.svc === "midi" ? "Midi" : "Soir"}</span>
                        <span style={{ fontSize: 10, color: "#777", marginLeft: 6 }}>{sv.tables} tables</span>
                      </div>
                      <div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 18, fontWeight: 700 }}>{sv.avgDur}<span style={{ fontSize: 10, color: "#777" }}>min</span></div>
                    </div>
                  ))}
                </div>
              </div>
              );
            })()}

            {/* Zones */}
            {W.days.length > 0 && (() => {
              // Zone capacity config (tables × max couverts)
              const ZONE_CAPACITY: Record<string, { tables: number; maxCov: number }> = {
                Salle: { tables: 17, maxCov: 8 * 2 + 4 * 4 + 3 * 5 + 2 * 4 }, // 8×2 + 4×4 + 3×5 + 2×4 = 55
                Pergolas: { tables: 8, maxCov: 6 * 2 + 2 * 4 }, // 6×2 + 2×4 = 20
                Terrasse: { tables: 16, maxCov: 10 * 2 + 5 * 4 + 1 * 6 }, // 10×2 + 5×4 + 1×6 = 46
              };
              const zones = mode === "ttc" ? W.zones_ttc : W.zones_ht;
              const activeZones = Object.entries(zones).filter(([, vals]) => vals.some(v => v > 0));
              const totalCA = activeZones.reduce((s, [, vals]) => s + vals.reduce((a, b) => a + b, 0), 0);

              return (
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${activeZones.length}, 1fr)`, gap: 10, marginBottom: 6 }}>
                {activeZones.map(([zone, vals]) => {
                  const tot = vals.reduce((a, b) => a + b, 0);
                  const maxV = Math.max(...vals.filter(Boolean));
                  const zKey = zone === "\u00C0 emporter" ? "emp" : zone;
                  const color = ZC[zKey] ?? "#888";
                  const cap = ZONE_CAPACITY[zone];
                  const pctCA = totalCA > 0 ? Math.round(tot / totalCA * 100) : 0;

                  return (
                    <div key={zone} style={{ ...S.card, padding: "14px 16px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".1em", color, fontWeight: 600 }}>{zone}</div>
                        <div style={{ fontSize: 10, color: "#777" }}>{pctCA}% du CA</div>
                      </div>
                      <div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 26, fontWeight: 700, marginBottom: 4 }}>{fmt(tot)}</div>
                      {cap && (
                        <div style={{ fontSize: 10, color: "#777", marginBottom: 10 }}>
                          {cap.tables} tables · {cap.maxCov} cvts max
                        </div>
                      )}
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
              );
            })()}

            {/* Sur place vs emporter */}
            <div style={S.card}>
              <div style={S.sec}>Sur place vs a emporter</div>
              <div style={{ display: "flex", gap: 0 }}>
                {(() => {
                  const surCA = mode === "ttc" ? W.place_sur_ttc : W.place_sur_ht;
                  const empCA = mode === "ttc" ? W.place_emp_ttc : W.place_emp_ht;
                  const tot = surCA + empCA;
                  return (<>
                    <PlaceBlock label="Sur place" color="#46655a" ca={surCA} pct={tot > 0 ? Math.round(surCA / tot * 100) : 0} couverts={W.cov_sur} tm={W.cov_sur > 0 ? (surCA / W.cov_sur).toFixed(1) : "0"} />
                    <div style={{ width: 1, background: "rgba(0,0,0,.08)", margin: "0 20px", flexShrink: 0 }} />
                    <PlaceBlock label="A emporter" color="#D4775A" ca={empCA} pct={tot > 0 ? Math.round(empCA / tot * 100) : 0} couverts={W.cov_emp} tm={W.cov_emp > 0 ? (empCA / W.cov_emp).toFixed(1) : "0"} />
                  </>);
                })()}
              </div>
            </div>

            {/* Comparatif A-1 */}
            {prev && W.days.length > 1 && (
              <div style={S.card}>
                <div style={S.sec}>Comparatif · CA {mode.toUpperCase()} par jour vs A-1</div>
                <div style={{ marginBottom: 8, display: "flex", gap: 16 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#777" }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: accent }} /> {new Date(from + "T12:00:00").getFullYear()} (courante)
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#777" }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: "#46655a" }} /> {new Date(from + "T12:00:00").getFullYear() - 1} (A-1)
                  </span>
                </div>
                {W.days.map((d, i) => {
                  const cur = (mode === "ttc" ? W.day_ttc : W.day_ht)[i] ?? 0;
                  const prevDay = (mode === "ttc" ? prev.day_ttc : prev.day_ht)[i] ?? 0;
                  const maxV = Math.max(...(mode === "ttc" ? W.day_ttc : W.day_ht), ...(mode === "ttc" ? prev.day_ttc : prev.day_ht));
                  const diff = cur - prevDay;
                  return (
                    <div key={d} style={{ marginBottom: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3, fontSize: 11 }}>
                        <span style={{ width: 72, fontWeight: 500 }}>{d}</span>
                        <div style={{ flex: 1, height: 10, background: `${accent}22`, borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${maxV ? cur / maxV * 100 : 0}%`, background: accent, borderRadius: 3 }} />
                        </div>
                        <span style={{ width: 58, textAlign: "right", fontWeight: 600, color: accent, fontSize: 11 }}>{fmt(cur)}</span>
                        <span style={{ width: 62, textAlign: "right", fontSize: 10, fontWeight: 500, color: diff >= 0 ? "#2e7d32" : "#c62828" }}>
                          {diff >= 0 ? "+" : ""}{fmt(Math.abs(diff))}
                        </span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
                        <span style={{ width: 72, fontSize: 10, color: "#777" }}>A-1</span>
                        <div style={{ flex: 1, height: 7, background: "rgba(70,101,90,.12)", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${maxV ? prevDay / maxV * 100 : 0}%`, background: "#46655a", opacity: .6, borderRadius: 3 }} />
                        </div>
                        <span style={{ width: 58, textAlign: "right", color: "#777", fontSize: 11 }}>{prevDay > 0 ? fmt(prevDay) : "\u2014"}</span>
                        <span style={{ width: 62 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Recap table */}
            {W.services.length > 0 && (
              <div style={S.card}>
                <div style={S.sec}>Par service · {mode.toUpperCase()} · couverts</div>
                <div style={{ overflow: "hidden", borderRadius: 8, border: "1px solid #e0d8ce" }}>
                  <RecapTable services={W.services} mode={mode} />
                </div>
              </div>
            )}

            {/* Top 10 */}
            <div style={S.card}>
              <div style={S.sec}>Top 10 produits · CA {mode.toUpperCase()}</div>
              <ChartCanvas id="top10" height={380} data={W} mode={mode} type="top10" />
            </div>

            {/* Top 3 par categorie */}
            {W.top3_cats.length > 0 && (
              <div style={S.card}>
                <div style={S.sec}>Top 3 par categorie · CA {mode.toUpperCase()}</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                  {W.top3_cats.map((cat, ci) => (
                    <div key={ci} style={{ background: "#fff", borderRadius: 10, padding: "12px 14px", border: "1px solid rgba(0,0,0,.08)" }}>
                      <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".1em", color: MIX_COLORS[ci] ?? "#777", fontWeight: 600, marginBottom: 8 }}>{cat.cat}</div>
                      {cat.rows.map((r, ri) => (
                        <div key={ri} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: "1px solid rgba(0,0,0,.04)", fontSize: 11 }}>
                          <span><span style={{ fontSize: 9, color: "#bbb", marginRight: 4 }}>{ri + 1}</span>{r.n}</span>
                          <span style={{ fontFamily: "var(--font-cormorant), Cormorant Garamond, serif", fontSize: 13, fontWeight: 600, color: accent }}>{mode === "ttc" ? r.ca_ttc : r.ca_ht}</span>
                        </div>
                      ))}
                      {cat.flop && (
                        <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0 2px", marginTop: 4, borderTop: "1px dashed rgba(0,0,0,.08)", fontSize: 11 }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ fontSize: 9, color: "#c62828", fontWeight: 600 }}>▼</span><span style={{ color: "#777" }}>{cat.flop.n}</span></span>
                          <span style={{ fontFamily: "var(--font-cormorant), Cormorant Garamond, serif", fontSize: 13, fontWeight: 600, color: "#777" }}>{mode === "ttc" ? cat.flop.ca_ttc : cat.flop.ca_ht}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Ventes par categorie */}
            <div style={S.card}>
              <div style={{ ...S.sec, marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Ventes par categorie · CA {mode.toUpperCase()}</span>
                <span style={{ fontSize: 10, color: "#777", fontStyle: "italic", textTransform: "none", letterSpacing: 0 }}>Cliquer une barre pour le detail</span>
              </div>
              <ChartCanvas id="mix" height={220} data={W} mode={mode} type="mix" onBarClick={(label, color) => setMixDDOpen({ label, color })} />
              {mixDDOpen && W.cat_products[mixDDOpen.label] && (
                <MixDropdown label={mixDDOpen.label} color={mixDDOpen.color} products={W.cat_products[mixDDOpen.label]} onClose={() => setMixDDOpen(null)} mode={mode} />
              )}
            </div>

            {/* Serveurs */}
            {W.serveurs.length > 0 && (
              <div style={S.card}>
                <div style={S.sec}>Performance serveurs · CA {mode.toUpperCase()}</div>
                <ChartCanvas id="serv" height={Math.max(120, W.serveurs.length * 38)} data={W} mode={mode} type="serv" />
              </div>
            )}

            {/* Paiements */}
            {W.pay && W.pay.length > 0 && (
              <div style={S.card}>
                <div style={S.sec}>Modes de paiement</div>
                <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 20, alignItems: "center" }}>
                  <ChartCanvas id="payChart" height={140} data={W} mode={mode} type="pay" />
                  <div>
                    {W.pay.map((p, i) => {
                      const colors = ["#c8960a", "#e0b020", "#f0c840", "#f5d96a", "#f9e9a0"];
                      return (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: "1px solid rgba(0,0,0,.05)" }}>
                          <div style={{ width: 8, height: 8, borderRadius: "50%", background: colors[i % colors.length], flexShrink: 0 }} />
                          <div style={{ flex: 1, fontSize: 12, color: "#777" }}>{p.l}</div>
                          <div style={{ fontFamily: "var(--font-cormorant), Cormorant Garamond, serif", fontSize: 15, fontWeight: 600 }}>{fmt(p.v)}</div>
                          <div style={{ width: 28, textAlign: "right", fontSize: 10, color: "#777" }}>{p.pct}%</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </RequireRole>
  );
}

/* ── Sub-components ── */

function DeltaBadgeSmall({ cur, prev, suffix = "", inverse = false }: { cur: number; prev: number; suffix?: string; inverse?: boolean }) {
  const d = cur - prev;
  const pct = prev > 0 ? (d / prev * 100) : 0;
  const good = inverse ? d <= 0 : d >= 0;
  return (
    <div style={{ fontSize: 10, marginTop: 4, fontWeight: 500, color: good ? "#2e7d32" : "#c62828" }}>
      {d >= 0 ? "\u2191 +" : "\u2193 "}{Math.abs(d).toFixed(d % 1 !== 0 ? 1 : 0)}{suffix} ({Math.abs(pct).toFixed(1)}%)
      <span style={{ color: "#bbb", fontWeight: 400 }}> vs A-1</span>
    </div>
  );
}

function DeltaBadge({ cur, prev, decimals = 0, prefix = "" }: { cur: number; prev: number; decimals?: number; prefix?: string }) {
  const d = cur - prev;
  const pct = prev > 0 ? (d / prev * 100) : 0;
  const up = d >= 0;
  const val = decimals > 0 ? Math.abs(d).toFixed(decimals) : Math.round(Math.abs(d)).toLocaleString("fr-FR");
  return (
    <div style={{ fontSize: 10, color: up ? "rgba(165,214,167,.9)" : "#fca5a5", marginTop: 2, fontWeight: 500 }}>
      {up ? "\u2191 +" : "\u2193 "}{prefix}{val} ({Math.abs(pct).toFixed(1)}%)
    </div>
  );
}

type UpsellData = { tables: number; coverts: number; ca_ttc: number; ca_ht: number };

function UpsellCard({ label, emoji, data, totalTables, totalCov, color, targets, mode, action }: {
  label: string; emoji: string; data: UpsellData; totalTables: number; totalCov: number; color: string;
  targets: { ok: number; good: number; avgPrice: number }; mode: string; action: string;
}) {
  const pct = totalTables > 0 ? Math.round(data.tables / totalTables * 100) : 0;
  const pctCov = totalCov > 0 ? Math.round(data.coverts / totalCov * 100) : 0;
  const missing = Math.max(0, totalTables - data.tables);
  const gain = missing * targets.avgPrice;
  const ca = mode === "ttc" ? data.ca_ttc : data.ca_ht;
  const tmPerCov = data.coverts > 0 ? ca / data.coverts : 0;

  const status = pct >= targets.good ? { t: "\u2713 Objectif atteint", c: "#2e7d32", bg: "#e8f5e9" }
    : pct >= targets.ok ? { t: "\u2192 En progression", c: "#e65100", bg: "#fff3e0" }
    : { t: "\u2191 A travailler", c: "#c62828", bg: "#ffebee" };

  return (
    <div style={{ padding: "14px 16px", background: "#f9f6f0", borderRadius: 10, height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 18 }}>{emoji}</span>
        <span style={{ fontSize: 12, fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 28, fontWeight: 700, color, lineHeight: 1, marginBottom: 4 }}>{pct}%</div>
      <div style={{ fontSize: 11, color: "#777", marginBottom: 6 }}>
        des tables · <strong style={{ color: "#1a1a1a" }}>{data.coverts > 0 ? `1 cvt sur ${Math.round(totalCov / data.coverts)}` : "\u2014"}</strong>
      </div>
      {/* Tables + Couverts */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8, fontSize: 10 }}>
        <div style={{ background: "#fff", borderRadius: 6, padding: "5px 8px" }}>
          <div style={{ color: "#777" }}>Tables</div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{data.tables}<span style={{ color: "#bbb", fontWeight: 400 }}>/{totalTables}</span></div>
        </div>
        <div style={{ background: "#fff", borderRadius: 6, padding: "5px 8px" }}>
          <div style={{ color: "#777" }}>Couverts</div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{data.coverts}<span style={{ color: "#bbb", fontWeight: 400 }}> ({pctCov}%)</span></div>
        </div>
      </div>
      {/* CA + TM/couvert */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8, fontSize: 10 }}>
        <div style={{ background: "#fff", borderRadius: 6, padding: "5px 8px" }}>
          <div style={{ color: "#777" }}>CA {mode.toUpperCase()}</div>
          <div style={{ fontWeight: 700, fontSize: 13, color }}>{fmt(ca)}</div>
        </div>
        <div style={{ background: "#fff", borderRadius: 6, padding: "5px 8px" }}>
          <div style={{ color: "#777" }}>Potentiel</div>
          <div style={{ fontWeight: 700, fontSize: 13, color }}>{gain > 0 ? `+${fmt(gain)}` : "\u2014"}</div>
        </div>
      </div>
      {/* Progress bar */}
      <div style={{ position: "relative", height: 8, background: "rgba(0,0,0,.07)", borderRadius: 4, overflow: "hidden", marginBottom: 6 }}>
        <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: `${Math.min(100, pct)}%`, background: color, borderRadius: 4, transition: "width .5s" }} />
        <div style={{ position: "absolute", top: 0, left: `${targets.ok}%`, height: "100%", width: 2, background: "rgba(0,0,0,.15)" }} />
        <div style={{ position: "absolute", top: 0, left: `${Math.min(100, targets.good)}%`, height: "100%", width: 2, background: "rgba(0,0,0,.25)" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#bbb", marginBottom: 8 }}>
        <span>0%</span><span>obj. {targets.ok}%</span><span>top {targets.good}%</span>
      </div>
      <div style={{ display: "inline-block", padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 500, background: status.bg, color: status.c, marginBottom: 4 }}>{status.t}</div>
      <div style={{ fontSize: 10, color: "#777", lineHeight: 1.5, fontStyle: "italic" }}>{action}</div>
    </div>
  );
}

function UpsellCardMini({ label, emoji, data, totalTables, color, mode }: {
  label: string; emoji: string; data: UpsellData; totalTables: number; color: string; mode: string;
}) {
  const pct = totalTables > 0 ? Math.round(data.tables / totalTables * 100) : 0;
  const ca = mode === "ttc" ? data.ca_ttc : data.ca_ht;
  return (
    <div style={{ padding: "12px 14px", background: "#f9f6f0", borderRadius: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 14 }}>{emoji}</span>
        <span style={{ fontSize: 10, fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 22, fontWeight: 700, color, lineHeight: 1, marginBottom: 4 }}>{pct}%</div>
      <div style={{ fontSize: 10, color: "#777", marginBottom: 6 }}>{data.tables}/{totalTables} tables</div>
      <div style={{ height: 5, background: "rgba(0,0,0,.07)", borderRadius: 3, overflow: "hidden", marginBottom: 6 }}>
        <div style={{ height: "100%", width: `${Math.min(100, pct)}%`, background: color, borderRadius: 3 }} />
      </div>
      <div style={{ fontSize: 11, fontWeight: 600, color }}>{fmt(ca)}</div>
    </div>
  );
}

function PlaceBlock({ label, color, ca, pct, couverts, tm }: { label: string; color: string; ca: number; pct: number; couverts: number; tm: string }) {
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
        <div><div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 20, fontWeight: 700 }}>{couverts}</div><div style={{ fontSize: 9, color: "#777", textTransform: "uppercase", marginTop: 2 }}>Couverts</div></div>
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
          <th style={thSt()}>Cvts</th>
          <th style={thSt()}>CVT M SP</th>
        </tr>
      </thead>
      <tbody>
        {days.map((jour, di) => {
          const svcs = byDay[jour];
          return svcs.map((s, si) => {
            const caVal = mode === "ttc" ? s.ttc : s.ht;
            const z = mode === "ttc" ? s.z_ttc : s.z_ht;
            const tmSp = mode === "ttc" ? s.tm_sp_ttc : s.tm_sp_ht;
            const bg = di % 2 === 0 ? "#fff" : "#faf7f2";
            const tmColor = tmSp >= 80 ? "#2e7d32" : tmSp >= 65 ? "#e65100" : "#c62828";
            const tmBg = tmSp >= 80 ? "#e8f5e9" : tmSp >= 65 ? "#fff3e0" : "#ffebee";
            return (
              <tr key={`${jour}-${s.svc}`} style={{ background: bg, borderTop: si === 0 && di > 0 ? "1px solid #e0d8ce" : si > 0 ? "1px solid rgba(0,0,0,.05)" : "none" }}>
                {si === 0 && <td rowSpan={svcs.length} style={{ padding: "0 16px", fontWeight: 700, fontSize: 15, verticalAlign: "middle", borderRight: "1px solid #e0d8ce" }}>{jour}</td>}
                <td style={tdSt}><span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: s.svc === "midi" ? ZC.Pergolas : "#1a1a1a" }}>{s.svc === "midi" ? "Midi" : "Soir"}</span></td>
                {zCell(z?.Salle, ZC.Salle)}
                {zCell(z?.Pergolas, ZC.Pergolas)}
                {zCell(z?.Terrasse, ZC.Terrasse)}
                {zCell(z?.emp, ZC.emp)}
                <td style={{ ...tdSt, fontWeight: 700, fontSize: 13, color: "#D4775A" }}>{fmt(caVal)}</td>
                <td style={{ ...tdSt, fontWeight: 600 }}>{s.cov}</td>
                <td style={tdSt}><span style={{ background: tmBg, color: tmColor, padding: "3px 9px", borderRadius: 5, fontSize: 11, fontWeight: 700 }}>{tmSp.toFixed(0)}{"\u20AC"}</span></td>
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

function renderProductRows(
  prods: { n: string; qty: number; ca_ttc: number; ca_ht: number }[],
  getCA: (p: { ca_ttc: number; ca_ht: number }) => number,
  maxCA: number, total: number, color: string,
) {
  return prods.map((p, i) => {
    const pca = getCA(p);
    return (
      <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: "1px solid rgba(0,0,0,.04)", fontSize: 12 }}>
        <span style={{ fontSize: 10, color: "#bbb", width: 16, textAlign: "right", flexShrink: 0 }}>{i + 1}</span>
        <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.n}</span>
        <div style={{ width: 80, height: 4, background: "rgba(0,0,0,.06)", borderRadius: 2, overflow: "hidden", flexShrink: 0 }}>
          <div style={{ height: "100%", width: `${maxCA ? Math.round(pca / maxCA * 100) : 0}%`, background: color, opacity: .75, borderRadius: 2 }} />
        </div>
        <span style={{ width: 36, textAlign: "right", color: "#777", flexShrink: 0, fontSize: 10 }}>{total ? (pca / total * 100).toFixed(1) : 0}%</span>
        <span style={{ width: 55, textAlign: "right", fontWeight: 500, flexShrink: 0, fontFamily: "var(--font-cormorant), Cormorant Garamond, serif", fontSize: 14 }}>{pca.toLocaleString("fr-FR")}{"\u20AC"}</span>
        <span style={{ width: 34, textAlign: "right", color: "#bbb", flexShrink: 0, fontSize: 10 }}>{p.qty}x</span>
      </div>
    );
  });
}

function MixDropdown({ label, color, products, onClose, mode = "ttc" }: {
  label: string; color: string; products: { n: string; qty: number; ca_ttc: number; ca_ht: number }[]; onClose: () => void; mode?: "ttc" | "ht";
}) {
  const getCA = (p: { ca_ttc: number; ca_ht: number }) => mode === "ttc" ? p.ca_ttc : p.ca_ht;
  const total = products.reduce((s, p) => s + getCA(p), 0);
  const maxCA = products[0] ? getCA(products[0]) : 1;

  // For Vins: separate Verres (V. prefix) from Bouteilles (Btl. prefix)
  const isVins = label.toLowerCase().includes("vin");
  const verres = isVins ? products.filter(p => !p.n.toLowerCase().startsWith("btl")) : [];
  const bouteilles = isVins ? products.filter(p => p.n.toLowerCase().startsWith("btl")) : [];
  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(0,0,0,.08)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".1em", color }}>{label} — {products.length} produits</div>
        <button type="button" onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 16, color: "#777", padding: "0 4px" }}>&times;</button>
      </div>
      {isVins && verres.length > 0 && bouteilles.length > 0 ? (
        <>
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: "#7c5c3a", marginBottom: 4, marginTop: 4 }}>Verres</div>
          {renderProductRows(verres, getCA, maxCA, total, color)}
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: "#7c5c3a", marginBottom: 4, marginTop: 10, paddingTop: 8, borderTop: "1px solid rgba(0,0,0,.08)" }}>Bouteilles</div>
          {renderProductRows(bouteilles, getCA, maxCA, total, color)}
        </>
      ) : (
        renderProductRows(products, getCA, maxCA, total, color)
      )}
    </div>
  );
}

/* ── Chart component ── */
function ChartCanvas({ id, height, data, mode, type, onBarClick }: {
  id: string; height: number; data: WeekData; mode: "ttc" | "ht"; type: "mix" | "top10" | "serv" | "pay";
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
        data: { labels: data.top10_names, datasets: [{ data: mode === "ttc" ? data.top10_ca_ttc : data.top10_ca_ht, backgroundColor: colors, borderRadius: 4 }] },
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
        data: { labels: data.serveurs, datasets: [{ data: mode === "ttc" ? data.serv_ca_ttc : data.serv_ca_ht, backgroundColor: colors, borderRadius: 4 }] },
        options: {
          indexAxis: "y", responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => {
            const i = ctx.dataIndex;
            const caVal = ctx.raw as number;
            const tkt = data.serv_tickets?.[i] ?? 0;
            const cov = data.serv_cov?.[i] ?? 0;
            const cvtM = cov > 0 ? (caVal / cov).toFixed(1) : "—";
            return [`CA : ${fmt(caVal)} (${(caVal / (mode === "ttc" ? data.ca_ttc : data.ca_ht) * 100).toFixed(1)}%)`, `${tkt} tickets · ${cov} cvts · CVT M ${"\u20AC"}${cvtM}`];
          } } } },
          scales: {
            x: { grid: { color: "rgba(0,0,0,0.05)" }, ticks: { callback: v => fmtK(v as number), color: "#aaa", font: { size: 11 } }, border: { display: false } },
            y: { grid: { display: false }, ticks: { color: "#444", font: { size: 12 } }, border: { display: false } },
          },
        },
      });
    }

    if (type === "pay" && data.pay && data.pay.length > 0) {
      const payColors = ["#c8960a", "#e0b020", "#f0c840", "#f5d96a", "#f9e9a0"];
      charts[id] = new Chart(canvasRef.current, {
        type: "doughnut",
        data: {
          labels: data.pay.map(p => p.l),
          datasets: [{ data: data.pay.map(p => p.v), backgroundColor: payColors.slice(0, data.pay.length), borderWidth: 2, borderColor: "#fff" }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.label} : ${fmt(ctx.raw as number)}` } } },
          cutout: "62%",
        },
      });
    }

    return () => { destroyChart(id); };
  }, [id, data, mode, type, onBarClick]);

  return <div style={{ position: "relative", height }}><canvas ref={canvasRef} /></div>;
}
