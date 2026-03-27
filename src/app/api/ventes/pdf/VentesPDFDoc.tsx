import React from "react";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";

/* eslint-disable @typescript-eslint/no-explicit-any */

const c = {
  accent: "#D4775A",
  green: "#46655a",
  gold: "#c4a882",
  text: "#1a1a1a",
  muted: "#777",
  faint: "#bbb",
  border: "#e0d8ce",
  bg: "#f2ede4",
  white: "#fff",
};

const s = StyleSheet.create({
  page: { padding: 28, fontFamily: "Helvetica", fontSize: 9, color: c.text, backgroundColor: c.bg },
  header: { marginBottom: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: c.border },
  eyebrow: { fontSize: 7, textTransform: "uppercase", letterSpacing: 1.5, color: c.accent, marginBottom: 4 },
  title: { fontSize: 18, fontWeight: "bold", fontFamily: "Helvetica-Bold" },
  subtitle: { fontSize: 8, color: c.muted, marginTop: 3 },
  // Hero
  hero: { backgroundColor: c.accent, borderRadius: 10, padding: 16, marginBottom: 12, color: c.white },
  heroBig: { fontSize: 28, fontWeight: "bold", fontFamily: "Helvetica-Bold", color: c.white },
  heroSub: { fontSize: 8, color: "rgba(255,255,255,0.6)", marginTop: 3 },
  heroRow: { flexDirection: "row", marginTop: 12, paddingTop: 10, borderTopWidth: 0.5, borderTopColor: "rgba(255,255,255,0.15)", gap: 20 },
  heroKpiLabel: { fontSize: 6, textTransform: "uppercase", letterSpacing: 1, color: "rgba(255,255,255,0.5)", marginBottom: 3 },
  heroKpiVal: { fontSize: 16, fontWeight: "bold", fontFamily: "Helvetica-Bold", color: c.white },
  heroKpiSub: { fontSize: 7, color: "rgba(255,255,255,0.5)", marginTop: 2 },
  // Cards
  card: { backgroundColor: c.white, borderRadius: 8, padding: 12, marginBottom: 10, borderWidth: 0.5, borderColor: c.border },
  sec: { fontSize: 6, textTransform: "uppercase", letterSpacing: 1.2, color: c.muted, marginBottom: 8, fontFamily: "Helvetica-Bold" },
  // Grid
  row: { flexDirection: "row", gap: 8 },
  col: { flex: 1 },
  // Table
  tHead: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: c.border, paddingBottom: 4, marginBottom: 4 },
  tH: { fontSize: 6, textTransform: "uppercase", letterSpacing: 0.8, color: c.muted, fontFamily: "Helvetica-Bold" },
  tRow: { flexDirection: "row", paddingVertical: 3, borderBottomWidth: 0.3, borderBottomColor: "#f0ebe3" },
  tCell: { fontSize: 8 },
  tCellBold: { fontSize: 8, fontFamily: "Helvetica-Bold" },
  tCellAccent: { fontSize: 8, fontFamily: "Helvetica-Bold", color: c.accent },
  tCellMuted: { fontSize: 8, color: c.muted },
  // KPI tile
  kpi: { backgroundColor: c.white, borderRadius: 6, padding: 10, borderWidth: 0.5, borderColor: c.border, alignItems: "center" as const },
  kpiVal: { fontSize: 14, fontWeight: "bold", fontFamily: "Helvetica-Bold" },
  kpiLabel: { fontSize: 6, textTransform: "uppercase", letterSpacing: 0.8, color: c.muted, marginTop: 3 },
  // Bar
  barBg: { height: 4, backgroundColor: "#f0ebe3", borderRadius: 2, overflow: "hidden" as const },
  barFill: { height: 4, borderRadius: 2 },
  // Top3
  top3Card: { backgroundColor: c.white, borderRadius: 6, padding: 8, borderWidth: 0.5, borderColor: c.border },
  top3Cat: { fontSize: 6, textTransform: "uppercase", letterSpacing: 0.8, color: c.accent, fontFamily: "Helvetica-Bold", marginBottom: 5 },
  top3Row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2, borderBottomWidth: 0.3, borderBottomColor: "#f0ebe3" },
});

const fmt = (v: number) => Math.round(v).toLocaleString("fr-FR") + "\u20AC";

export function VentesPDF({ stats, prev, mode, viewTab, rangeLabel, etabName }: {
  stats: any; prev: any; mode: string; viewTab: string; rangeLabel: string; etabName: string;
}) {
  const W = stats;
  const ca = mode === "ttc" ? W.ca_ttc : W.ca_ht;
  const prevCA = prev ? (mode === "ttc" ? prev.ca_ttc : prev.ca_ht) : null;
  const tm = W.couverts > 0 ? ca / W.couverts : (W.tickets > 0 ? ca / W.tickets : 0);

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          <Text style={s.eyebrow}>{etabName} · Rapport {viewTab === "jour" ? "journalier" : viewTab === "semaine" ? "hebdomadaire" : "mensuel"}</Text>
          <Text style={s.title}>{rangeLabel}</Text>
          <Text style={s.subtitle}>{W.tickets} tickets · {W.couverts} couverts · {W.days?.length ?? 0} jours · CA {mode.toUpperCase()}</Text>
        </View>

        {/* Hero CA */}
        <View style={s.hero}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <View>
              <Text style={{ fontSize: 7, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 4 }}>
                CA {mode.toUpperCase()}
              </Text>
              <Text style={s.heroBig}>{fmt(ca)}</Text>
              {mode === "ttc" && <Text style={s.heroSub}>HT {fmt(W.ca_ht)}</Text>}
            </View>
            {prevCA && (
              <View style={{ alignItems: "flex-end" as const }}>
                <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", color: ca >= prevCA ? "#a5d6a7" : "#ef9a9a" }}>
                  {ca >= prevCA ? "+" : ""}{((ca - prevCA) / prevCA * 100).toFixed(1)}%
                </Text>
                <Text style={{ fontSize: 7, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>vs A-1</Text>
              </View>
            )}
          </View>
          <View style={s.heroRow}>
            <View>
              <Text style={s.heroKpiLabel}>Couverts</Text>
              <Text style={s.heroKpiVal}>{W.couverts || W.tickets}</Text>
            </View>
            <View>
              <Text style={s.heroKpiLabel}>TM / couvert</Text>
              <Text style={s.heroKpiVal}>{"\u20AC"}{tm.toFixed(1)}</Text>
            </View>
            <View>
              <Text style={s.heroKpiLabel}>Annulations</Text>
              <Text style={s.heroKpiVal}>{W.ann_pct?.toFixed(1) ?? "0"}%</Text>
            </View>
            {prevCA && (
              <View>
                <Text style={s.heroKpiLabel}>vs A-1</Text>
                <Text style={{ ...s.heroKpiVal, color: ca >= prevCA ? "#a5d6a7" : "#ef9a9a" }}>
                  {ca >= prevCA ? "+" : ""}{fmt(Math.abs(ca - prevCA))}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* CA par jour */}
        {W.days && W.days.length > 1 && (
          <View style={s.card}>
            <Text style={s.sec}>CA {mode.toUpperCase()} par jour</Text>
            {W.days.map((d: string, i: number) => {
              const v = (mode === "ttc" ? W.day_ttc : W.day_ht)[i] ?? 0;
              const cov = W.day_cov?.[i] ?? 0;
              const tmDay = cov > 0 ? v / cov : 0;
              const maxV = Math.max(...(mode === "ttc" ? W.day_ttc : W.day_ht));
              return (
                <View key={d} style={{ flexDirection: "row", alignItems: "center", marginBottom: 5 }}>
                  <Text style={{ width: 55, fontSize: 8, fontFamily: "Helvetica-Bold" }}>{d}</Text>
                  <View style={{ flex: 1, ...s.barBg }}>
                    <View style={{ ...s.barFill, width: `${maxV ? v / maxV * 100 : 0}%`, backgroundColor: c.accent }} />
                  </View>
                  <Text style={{ width: 50, textAlign: "right", fontSize: 8, fontFamily: "Helvetica-Bold", color: c.accent }}>{fmt(v)}</Text>
                  <Text style={{ width: 30, textAlign: "right", fontSize: 7, color: c.muted }}>{cov}c</Text>
                  <Text style={{ width: 35, textAlign: "right", fontSize: 7, color: c.muted }}>{"\u20AC"}{tmDay.toFixed(0)}/c</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Zones */}
        {W.zones_ttc && (
          <View style={{ ...s.row, marginBottom: 10 }}>
            {Object.entries(mode === "ttc" ? W.zones_ttc : W.zones_ht).filter(([, vals]: [string, any]) => vals.some((v: number) => v > 0)).map(([zone, vals]: [string, any]) => {
              const tot = vals.reduce((a: number, b: number) => a + b, 0);
              const zc: Record<string, string> = { Salle: c.green, Pergolas: "#5e8278", Terrasse: c.gold, "\u00C0 emporter": c.accent };
              const color = zc[zone] ?? c.muted;
              return (
                <View key={zone} style={{ ...s.kpi, flex: 1 }}>
                  <Text style={{ fontSize: 6, textTransform: "uppercase", letterSpacing: 0.8, color, fontFamily: "Helvetica-Bold", marginBottom: 3 }}>{zone}</Text>
                  <Text style={{ ...s.kpiVal, color: c.text }}>{fmt(tot)}</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Sur place vs Emporter */}
        <View style={{ ...s.card, flexDirection: "row" }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 7, textTransform: "uppercase", letterSpacing: 0.8, color: c.green, fontFamily: "Helvetica-Bold", marginBottom: 4 }}>Sur place</Text>
            <Text style={{ fontSize: 14, fontFamily: "Helvetica-Bold" }}>{fmt(mode === "ttc" ? W.place_sur_ttc : W.place_sur_ht)}</Text>
            <Text style={{ fontSize: 7, color: c.muted, marginTop: 2 }}>{W.cov_sur} couverts</Text>
          </View>
          <View style={{ width: 0.5, backgroundColor: c.border, marginHorizontal: 12 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 7, textTransform: "uppercase", letterSpacing: 0.8, color: c.accent, fontFamily: "Helvetica-Bold", marginBottom: 4 }}>A emporter</Text>
            <Text style={{ fontSize: 14, fontFamily: "Helvetica-Bold" }}>{fmt(mode === "ttc" ? W.place_emp_ttc : W.place_emp_ht)}</Text>
            <Text style={{ fontSize: 7, color: c.muted, marginTop: 2 }}>{W.cov_emp} couverts</Text>
          </View>
        </View>

        {/* Recap services */}
        {W.services && W.services.length > 0 && (
          <View style={s.card}>
            <Text style={s.sec}>Par service · {mode.toUpperCase()}</Text>
            <View style={s.tHead}>
              <Text style={{ ...s.tH, width: 55 }}>Jour</Text>
              <Text style={{ ...s.tH, width: 30 }}>Svc</Text>
              <Text style={{ ...s.tH, width: 50, textAlign: "right" }}>CA</Text>
              <Text style={{ ...s.tH, width: 25, textAlign: "right" }}>Cov</Text>
              <Text style={{ ...s.tH, width: 35, textAlign: "right" }}>TM sp.</Text>
            </View>
            {W.services.map((svc: any, i: number) => (
              <View key={i} style={s.tRow}>
                <Text style={{ ...s.tCellBold, width: 55 }}>{svc.jour}</Text>
                <Text style={{ ...s.tCellMuted, width: 30 }}>{svc.svc === "midi" ? "Midi" : "Soir"}</Text>
                <Text style={{ ...s.tCellAccent, width: 50, textAlign: "right" }}>{fmt(mode === "ttc" ? svc.ttc : svc.ht)}</Text>
                <Text style={{ ...s.tCell, width: 25, textAlign: "right" }}>{svc.cov}</Text>
                <Text style={{ ...s.tCell, width: 35, textAlign: "right" }}>{"\u20AC"}{(mode === "ttc" ? svc.tm_sp_ttc : svc.tm_sp_ht).toFixed(0)}</Text>
              </View>
            ))}
          </View>
        )}
      </Page>

      {/* Page 2: Mix + Top 10 + Top 3 + Serveurs */}
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <Text style={s.eyebrow}>{etabName} · {rangeLabel}</Text>
          <Text style={{ ...s.title, fontSize: 14 }}>Detail des ventes</Text>
        </View>

        {/* Mix categories */}
        {W.mix_labels && (
          <View style={s.card}>
            <Text style={s.sec}>Ventes par categorie · CA {mode.toUpperCase()}</Text>
            {W.mix_labels.map((label: string, i: number) => {
              const v = (mode === "ttc" ? W.mix_ttc : W.mix_ht)[i] ?? 0;
              const total = (mode === "ttc" ? W.mix_ttc : W.mix_ht).reduce((a: number, b: number) => a + b, 0);
              const pct = total > 0 ? (v / total * 100).toFixed(0) : "0";
              const maxV = Math.max(...(mode === "ttc" ? W.mix_ttc : W.mix_ht));
              const colors = ["#D4775A", "#8fa8a0", "#46655a", "#7c5c3a", "#c4a882", "#e0b896", "#5e7a8a", "#a8b89c"];
              const barColor = colors[i % colors.length];
              return (
                <View key={label} style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
                  <Text style={{ width: 60, fontSize: 8 }}>{label}</Text>
                  <View style={{ flex: 1, ...s.barBg }}>
                    <View style={{ ...s.barFill, width: `${maxV ? v / maxV * 100 : 0}%`, backgroundColor: barColor }} />
                  </View>
                  <Text style={{ width: 45, textAlign: "right", fontSize: 8, fontFamily: "Helvetica-Bold" }}>{fmt(v)}</Text>
                  <Text style={{ width: 25, textAlign: "right", fontSize: 7, color: c.muted }}>{pct}%</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Top 10 */}
        {W.top10_names && (
          <View style={s.card}>
            <Text style={s.sec}>Top 10 produits · CA {mode.toUpperCase()}</Text>
            {W.top10_names.map((name: string, i: number) => {
              const v = (mode === "ttc" ? W.top10_ca_ttc : W.top10_ca_ht)[i] ?? 0;
              const qty = W.top10_qty[i] ?? 0;
              const maxV = Math.max(...(mode === "ttc" ? W.top10_ca_ttc : W.top10_ca_ht));
              return (
                <View key={name} style={{ flexDirection: "row", alignItems: "center", marginBottom: 3 }}>
                  <Text style={{ width: 12, fontSize: 7, color: c.faint, textAlign: "right" }}>{i + 1}</Text>
                  <Text style={{ width: 90, fontSize: 8, marginLeft: 5 }}>{name}</Text>
                  <View style={{ flex: 1, ...s.barBg }}>
                    <View style={{ ...s.barFill, width: `${maxV ? v / maxV * 100 : 0}%`, backgroundColor: c.accent, opacity: 1 - i * 0.07 }} />
                  </View>
                  <Text style={{ width: 45, textAlign: "right", fontSize: 8, fontFamily: "Helvetica-Bold" }}>{fmt(v)}</Text>
                  <Text style={{ width: 25, textAlign: "right", fontSize: 7, color: c.muted }}>{qty}x</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Top 3 par categorie */}
        {W.top3_cats && W.top3_cats.length > 0 && (
          <View style={s.card}>
            <Text style={s.sec}>Top 3 par categorie</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {W.top3_cats.map((cat: any, ci: number) => (
                <View key={ci} style={{ ...s.top3Card, width: "48%" }}>
                  <Text style={s.top3Cat}>{cat.cat}</Text>
                  {cat.rows.map((r: any, ri: number) => (
                    <View key={ri} style={s.top3Row}>
                      <Text style={{ fontSize: 7 }}>{ri + 1} {r.n}</Text>
                      <Text style={{ fontSize: 7, fontFamily: "Helvetica-Bold", color: c.accent }}>{mode === "ttc" ? r.ca_ttc : r.ca_ht}</Text>
                    </View>
                  ))}
                  {cat.flop && (
                    <View style={{ ...s.top3Row, borderTopWidth: 0.5, borderTopColor: c.border, borderTopStyle: "dashed", marginTop: 3 }}>
                      <Text style={{ fontSize: 7, color: c.muted }}>▼ {cat.flop.n}</Text>
                      <Text style={{ fontSize: 7, color: c.muted }}>{mode === "ttc" ? cat.flop.ca_ttc : cat.flop.ca_ht}</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Serveurs */}
        {W.serveurs && W.serveurs.length > 0 && (
          <View style={s.card}>
            <Text style={s.sec}>Performance serveurs · CA {mode.toUpperCase()}</Text>
            {W.serveurs.map((name: string, i: number) => {
              const v = (mode === "ttc" ? W.serv_ca_ttc : W.serv_ca_ht)[i] ?? 0;
              const maxV = Math.max(...(mode === "ttc" ? W.serv_ca_ttc : W.serv_ca_ht));
              const pct = W.ca_ttc > 0 ? (v / (mode === "ttc" ? W.ca_ttc : W.ca_ht) * 100).toFixed(0) : "0";
              return (
                <View key={name} style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
                  <Text style={{ width: 60, fontSize: 8, fontFamily: "Helvetica-Bold" }}>{name}</Text>
                  <View style={{ flex: 1, ...s.barBg }}>
                    <View style={{ ...s.barFill, width: `${maxV ? v / maxV * 100 : 0}%`, backgroundColor: c.green }} />
                  </View>
                  <Text style={{ width: 45, textAlign: "right", fontSize: 8, fontFamily: "Helvetica-Bold" }}>{fmt(v)}</Text>
                  <Text style={{ width: 25, textAlign: "right", fontSize: 7, color: c.muted }}>{pct}%</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Upsell ratios */}
        {W.ratios && (
          <View style={{ ...s.card, flexDirection: "row", gap: 10 }}>
            {[
              { label: "Antipasti", n: W.ratios.anti_n, emoji: "Antipasti" },
              { label: "Desserts", n: W.ratios.dolci_n, emoji: "Dolci" },
              { label: "Vins", n: W.ratios.vin_n, emoji: "Vins" },
            ].map(u => {
              const pct = W.tickets > 0 ? Math.round(u.n / W.tickets * 100) : 0;
              return (
                <View key={u.label} style={{ flex: 1, alignItems: "center" as const }}>
                  <Text style={{ fontSize: 16, fontFamily: "Helvetica-Bold", color: c.accent }}>{pct}%</Text>
                  <Text style={{ fontSize: 7, color: c.muted, marginTop: 2 }}>{u.label}</Text>
                  <Text style={{ fontSize: 6, color: c.faint }}>{u.n}/{W.tickets} tables</Text>
                </View>
              );
            })}
          </View>
        )}
      </Page>
    </Document>
  );
}
