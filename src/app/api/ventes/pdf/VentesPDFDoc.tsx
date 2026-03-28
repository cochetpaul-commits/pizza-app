import React from "react";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";

/* eslint-disable @typescript-eslint/no-explicit-any */

const c = {
  accent: "#D4775A", green: "#46655a", gold: "#c4a882",
  text: "#1a1a1a", muted: "#777", faint: "#bbb",
  border: "#e0d8ce", bg: "#f2ede4", white: "#fff",
};

const s = StyleSheet.create({
  page: { padding: 24, fontFamily: "Helvetica", fontSize: 8, color: c.text, backgroundColor: c.bg },
  header: { marginBottom: 10, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: c.border },
  eyebrow: { fontSize: 6, textTransform: "uppercase", letterSpacing: 1.5, color: c.accent, marginBottom: 3 },
  title: { fontSize: 16, fontWeight: "bold", fontFamily: "Helvetica-Bold" },
  subtitle: { fontSize: 7, color: c.muted, marginTop: 2 },
  hero: { backgroundColor: c.accent, borderRadius: 8, padding: 14, marginBottom: 10, color: c.white },
  heroBig: { fontSize: 24, fontWeight: "bold", fontFamily: "Helvetica-Bold", color: c.white },
  heroSub: { fontSize: 7, color: "rgba(255,255,255,0.7)", marginTop: 2 },
  heroRow: { flexDirection: "row", marginTop: 10, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: "rgba(255,255,255,0.15)", gap: 16 },
  heroKpiLabel: { fontSize: 5, textTransform: "uppercase", letterSpacing: 0.8, color: "rgba(255,255,255,0.6)", marginBottom: 2 },
  heroKpiVal: { fontSize: 13, fontWeight: "bold", fontFamily: "Helvetica-Bold", color: c.white },
  card: { backgroundColor: c.white, borderRadius: 6, padding: 10, marginBottom: 8, borderWidth: 0.5, borderColor: c.border },
  sec: { fontSize: 5, textTransform: "uppercase", letterSpacing: 1, color: c.muted, marginBottom: 6, fontFamily: "Helvetica-Bold" },
  row: { flexDirection: "row", gap: 6 },
  tHead: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: c.border, paddingBottom: 3, marginBottom: 3 },
  tH: { fontSize: 5, textTransform: "uppercase", letterSpacing: 0.6, color: c.muted, fontFamily: "Helvetica-Bold" },
  tRow: { flexDirection: "row", paddingVertical: 2, borderBottomWidth: 0.3, borderBottomColor: "#f0ebe3" },
  tCell: { fontSize: 7 },
  tCellBold: { fontSize: 7, fontFamily: "Helvetica-Bold" },
  tCellAccent: { fontSize: 7, fontFamily: "Helvetica-Bold", color: c.accent },
  tCellMuted: { fontSize: 7, color: c.muted },
  kpi: { backgroundColor: c.white, borderRadius: 5, padding: 8, borderWidth: 0.5, borderColor: c.border, alignItems: "center" as const },
  kpiVal: { fontSize: 12, fontWeight: "bold", fontFamily: "Helvetica-Bold" },
  kpiLabel: { fontSize: 5, textTransform: "uppercase", letterSpacing: 0.6, color: c.muted, marginTop: 2 },
  barBg: { height: 3, backgroundColor: "#f0ebe3", borderRadius: 1, overflow: "hidden" as const },
  barFill: { height: 3, borderRadius: 1 },
  top3Card: { backgroundColor: c.white, borderRadius: 5, padding: 6, borderWidth: 0.5, borderColor: c.border },
  top3Cat: { fontSize: 5, textTransform: "uppercase", letterSpacing: 0.6, color: c.accent, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  top3Row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 1.5, borderBottomWidth: 0.2, borderBottomColor: "#f0ebe3" },
});

const fmt = (v: number) => Math.round(v).toLocaleString("fr-FR") + "\u20AC";

export function VentesPDF({ stats, prev, mode, viewTab, rangeLabel, etabName }: {
  stats: any; prev: any; mode: string; viewTab: string; rangeLabel: string; etabName: string;
}) {
  const W = stats;
  const ca = mode === "ttc" ? W.ca_ttc : W.ca_ht;
  const prevCA = prev ? (mode === "ttc" ? prev.ca_ttc : prev.ca_ht) : null;
  const tm = W.couverts > 0 ? ca / W.couverts : (W.tickets > 0 ? ca / W.tickets : 0);

  // Limit services for PDF to avoid overflow
  const maxServices = viewTab === "mois" ? 40 : 20;
  const pdfServices = (W.services ?? []).slice(0, maxServices);

  return (
    <Document>
      {/* PAGE 1: KPIs + Zones + Services */}
      <Page size="A4" style={s.page} wrap>
        <View style={s.header}>
          <Text style={s.eyebrow}>{etabName} · Rapport {viewTab === "jour" ? "journalier" : viewTab === "semaine" ? "hebdomadaire" : "mensuel"}</Text>
          <Text style={s.title}>{rangeLabel}</Text>
          <Text style={s.subtitle}>{W.tickets} tickets · {W.couverts} couverts · {W.days?.length ?? 0} jours · CA {mode.toUpperCase()}</Text>
        </View>

        {/* Hero */}
        <View style={s.hero}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <View>
              <Text style={{ fontSize: 6, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>CA {mode.toUpperCase()}</Text>
              <Text style={s.heroBig}>{fmt(ca)}</Text>
              {mode === "ttc" && <Text style={s.heroSub}>HT {fmt(W.ca_ht)}</Text>}
            </View>
            {prevCA && prevCA > 0 && (
              <View style={{ alignItems: "flex-end" as const }}>
                <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: ca >= prevCA ? "#a5d6a7" : "#ef9a9a" }}>
                  {ca >= prevCA ? "+" : ""}{((ca - prevCA) / prevCA * 100).toFixed(1)}%
                </Text>
                <Text style={{ fontSize: 6, color: "rgba(255,255,255,0.5)", marginTop: 1 }}>vs comparaison</Text>
              </View>
            )}
          </View>
          <View style={s.heroRow}>
            <View><Text style={s.heroKpiLabel}>Couverts</Text><Text style={s.heroKpiVal}>{W.couverts || W.tickets}</Text></View>
            <View><Text style={s.heroKpiLabel}>CVT moyen</Text><Text style={s.heroKpiVal}>{"\u20AC"}{tm.toFixed(1)}</Text></View>
            <View><Text style={s.heroKpiLabel}>Tickets</Text><Text style={s.heroKpiVal}>{W.tickets}</Text></View>
            <View><Text style={s.heroKpiLabel}>Annulations</Text><Text style={s.heroKpiVal}>{W.ann_pct?.toFixed(1) ?? "0"}%</Text></View>
          </View>
        </View>

        {/* Zones row */}
        {W.zones_ttc && (
          <View style={{ ...s.row, marginBottom: 8 }}>
            {Object.entries(mode === "ttc" ? W.zones_ttc : W.zones_ht).filter(([, vals]: [string, any]) => vals.some((v: number) => v > 0)).map(([zone, vals]: [string, any]) => {
              const tot = vals.reduce((a: number, b: number) => a + b, 0);
              const zc: Record<string, string> = { Salle: c.green, Pergolas: "#5e8278", Terrasse: c.gold, "\u00C0 emporter": c.accent };
              return (
                <View key={zone} style={{ ...s.kpi, flex: 1 }}>
                  <Text style={{ fontSize: 5, textTransform: "uppercase", letterSpacing: 0.6, color: zc[zone] ?? c.muted, fontFamily: "Helvetica-Bold", marginBottom: 2 }}>{zone}</Text>
                  <Text style={{ ...s.kpiVal, color: c.text }}>{fmt(tot)}</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Sur place vs Emporter */}
        <View style={{ ...s.card, flexDirection: "row" }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 6, textTransform: "uppercase", letterSpacing: 0.6, color: c.green, fontFamily: "Helvetica-Bold", marginBottom: 3 }}>Sur place</Text>
            <Text style={{ fontSize: 12, fontFamily: "Helvetica-Bold" }}>{fmt(mode === "ttc" ? W.place_sur_ttc : W.place_sur_ht)}</Text>
            <Text style={{ fontSize: 6, color: c.muted, marginTop: 1 }}>{W.cov_sur} cvts</Text>
          </View>
          <View style={{ width: 0.5, backgroundColor: c.border, marginHorizontal: 10 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 6, textTransform: "uppercase", letterSpacing: 0.6, color: c.accent, fontFamily: "Helvetica-Bold", marginBottom: 3 }}>A emporter</Text>
            <Text style={{ fontSize: 12, fontFamily: "Helvetica-Bold" }}>{fmt(mode === "ttc" ? W.place_emp_ttc : W.place_emp_ht)}</Text>
            <Text style={{ fontSize: 6, color: c.muted, marginTop: 1 }}>{W.cov_emp} cvts</Text>
          </View>
        </View>

        {/* Recap services */}
        {pdfServices.length > 0 && (
          <View style={s.card} wrap>
            <Text style={s.sec}>Par service · {mode.toUpperCase()} · couverts</Text>
            <View style={s.tHead}>
              <Text style={{ ...s.tH, width: 50 }}>Jour</Text>
              <Text style={{ ...s.tH, width: 25 }}>Svc</Text>
              <Text style={{ ...s.tH, width: 45, textAlign: "right" }}>CA</Text>
              <Text style={{ ...s.tH, width: 20, textAlign: "right" }}>Cvt</Text>
              <Text style={{ ...s.tH, width: 30, textAlign: "right" }}>CVT M</Text>
            </View>
            {pdfServices.map((svc: any, i: number) => (
              <View key={i} style={s.tRow} wrap={false}>
                <Text style={{ ...s.tCellBold, width: 50 }}>{svc.jour}</Text>
                <Text style={{ ...s.tCellMuted, width: 25 }}>{svc.svc === "midi" ? "M" : "S"}</Text>
                <Text style={{ ...s.tCellAccent, width: 45, textAlign: "right" }}>{fmt(mode === "ttc" ? svc.ttc : svc.ht)}</Text>
                <Text style={{ ...s.tCell, width: 20, textAlign: "right" }}>{svc.cov}</Text>
                <Text style={{ ...s.tCell, width: 30, textAlign: "right" }}>{"\u20AC"}{(mode === "ttc" ? svc.tm_sp_ttc : svc.tm_sp_ht).toFixed(0)}</Text>
              </View>
            ))}
          </View>
        )}
      </Page>

      {/* PAGE 2: Produits + Categories */}
      <Page size="A4" style={s.page} wrap>
        <View style={s.header}>
          <Text style={s.eyebrow}>{etabName} · {rangeLabel}</Text>
          <Text style={{ ...s.title, fontSize: 12 }}>Detail des ventes</Text>
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
              return (
                <View key={label} style={{ flexDirection: "row", alignItems: "center", marginBottom: 3 }}>
                  <Text style={{ width: 55, fontSize: 7 }}>{label}</Text>
                  <View style={{ flex: 1, ...s.barBg }}>
                    <View style={{ ...s.barFill, width: `${maxV ? v / maxV * 100 : 0}%`, backgroundColor: colors[i % colors.length] }} />
                  </View>
                  <Text style={{ width: 40, textAlign: "right", fontSize: 7, fontFamily: "Helvetica-Bold" }}>{fmt(v)}</Text>
                  <Text style={{ width: 22, textAlign: "right", fontSize: 6, color: c.muted }}>{pct}%</Text>
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
                <View key={name} style={{ flexDirection: "row", alignItems: "center", marginBottom: 2 }} wrap={false}>
                  <Text style={{ width: 10, fontSize: 6, color: c.faint, textAlign: "right" }}>{i + 1}</Text>
                  <Text style={{ width: 80, fontSize: 7, marginLeft: 4 }}>{name}</Text>
                  <View style={{ flex: 1, ...s.barBg }}>
                    <View style={{ ...s.barFill, width: `${maxV ? v / maxV * 100 : 0}%`, backgroundColor: c.accent }} />
                  </View>
                  <Text style={{ width: 40, textAlign: "right", fontSize: 7, fontFamily: "Helvetica-Bold" }}>{fmt(v)}</Text>
                  <Text style={{ width: 22, textAlign: "right", fontSize: 6, color: c.muted }}>{qty}x</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Top 3 par categorie */}
        {W.top3_cats && W.top3_cats.length > 0 && (
          <View style={s.card}>
            <Text style={s.sec}>Top 3 par categorie</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
              {W.top3_cats.slice(0, 8).map((cat: any, ci: number) => (
                <View key={ci} style={{ ...s.top3Card, width: "24%" }}>
                  <Text style={s.top3Cat}>{cat.cat}</Text>
                  {cat.rows.map((r: any, ri: number) => (
                    <View key={ri} style={s.top3Row}>
                      <Text style={{ fontSize: 6 }}>{ri + 1} {r.n}</Text>
                      <Text style={{ fontSize: 6, fontFamily: "Helvetica-Bold", color: c.accent }}>{mode === "ttc" ? r.ca_ttc : r.ca_ht}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Serveurs + Upsell */}
        <View style={{ flexDirection: "row", gap: 6 }}>
          {W.serveurs && W.serveurs.length > 0 && (
            <View style={{ ...s.card, flex: 1 }}>
              <Text style={s.sec}>Serveurs · CA {mode.toUpperCase()}</Text>
              {W.serveurs.map((name: string, i: number) => {
                const v = (mode === "ttc" ? W.serv_ca_ttc : W.serv_ca_ht)[i] ?? 0;
                const maxV = Math.max(...(mode === "ttc" ? W.serv_ca_ttc : W.serv_ca_ht));
                return (
                  <View key={name} style={{ flexDirection: "row", alignItems: "center", marginBottom: 3 }}>
                    <Text style={{ width: 50, fontSize: 7, fontFamily: "Helvetica-Bold" }}>{name}</Text>
                    <View style={{ flex: 1, ...s.barBg }}>
                      <View style={{ ...s.barFill, width: `${maxV ? v / maxV * 100 : 0}%`, backgroundColor: c.green }} />
                    </View>
                    <Text style={{ width: 40, textAlign: "right", fontSize: 7, fontFamily: "Helvetica-Bold" }}>{fmt(v)}</Text>
                  </View>
                );
              })}
            </View>
          )}
          {W.ratios && (
            <View style={{ ...s.card, flex: 1 }}>
              <Text style={s.sec}>Upsell</Text>
              {[
                { label: "Antipasti", data: W.ratios.anti, color: c.accent },
                { label: "Desserts", data: W.ratios.dolci, color: "#b5904a" },
                { label: "Vins", data: W.ratios.vin, color: "#7c5c3a" },
                { label: "Alcool", data: W.ratios.alcool, color: "#c15f2e" },
                { label: "Cafe", data: W.ratios.cafe, color: "#6f5c3a" },
              ].map(u => {
                const tables = u.data?.tables ?? 0;
                const pct = W.tickets > 0 ? Math.round(tables / W.tickets * 100) : 0;
                return (
                  <View key={u.label} style={{ flexDirection: "row", alignItems: "center", marginBottom: 3 }}>
                    <Text style={{ width: 45, fontSize: 7 }}>{u.label}</Text>
                    <View style={{ flex: 1, height: 3, backgroundColor: "#f0ebe3", borderRadius: 1, overflow: "hidden" as const }}>
                      <View style={{ height: 3, width: `${Math.min(100, pct)}%`, backgroundColor: u.color, borderRadius: 1 }} />
                    </View>
                    <Text style={{ width: 25, textAlign: "right", fontSize: 7, fontFamily: "Helvetica-Bold", color: u.color }}>{pct}%</Text>
                    <Text style={{ width: 30, textAlign: "right", fontSize: 6, color: c.muted }}>{tables}t</Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </Page>
    </Document>
  );
}
