import React from "react";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";

/* eslint-disable @typescript-eslint/no-explicit-any */

const c = {
  accent: "#D4775A", green: "#46655a", gold: "#c4a882",
  text: "#1a1a1a", muted: "#777", faint: "#bbb",
  border: "#e0d8ce", bg: "#f2ede4", white: "#fff",
  good: "#2e7d32", bad: "#c62828",
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
const fmtNum = (v: number) => Math.round(v).toLocaleString("fr-FR");

type Props = {
  stats: any;
  prev: any;
  mode: string;
  viewTab: string;
  rangeLabel: string;
  etabName: string;
  briefing?: string[] | null;
  exportType?: "ventes" | "produits" | "complet";
};

/* ══════════════════════════════════════════════════
   SECTION BUILDERS
   ══════════════════════════════════════════════════ */

function HeaderBlock({ etabName, rangeLabel, stats, exportType }: { etabName: string; rangeLabel: string; stats: any; exportType: string }) {
  const typeLabel = exportType === "produits" ? "Produits" : exportType === "complet" ? "Rapport complet" : "Ventes";
  return (
    <View style={s.header}>
      <Text style={s.eyebrow}>{etabName} · {typeLabel}</Text>
      <Text style={s.title}>{rangeLabel}</Text>
      <Text style={s.subtitle}>{stats.tickets} tickets · {stats.couverts} couverts · {stats.days?.length ?? 0} jours</Text>
    </View>
  );
}

function HeroCard({ stats, prev, mode }: { stats: any; prev: any; mode: string }) {
  const W = stats;
  const ca = mode === "ttc" ? W.ca_ttc : W.ca_ht;
  const prevCA = prev ? (mode === "ttc" ? prev.ca_ttc : prev.ca_ht) : null;
  const tm = W.couverts > 0 ? ca / W.couverts : (W.tickets > 0 ? ca / W.tickets : 0);
  return (
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
            <Text style={{ fontSize: 6, color: "rgba(255,255,255,0.5)", marginTop: 1 }}>vs A-1</Text>
          </View>
        )}
      </View>
      <View style={s.heroRow}>
        <View><Text style={s.heroKpiLabel}>Couverts</Text><Text style={s.heroKpiVal}>{W.couverts || W.tickets}</Text></View>
        <View><Text style={s.heroKpiLabel}>CVT moyen</Text><Text style={s.heroKpiVal}>{tm.toFixed(1)}{"\u20AC"}</Text></View>
        <View><Text style={s.heroKpiLabel}>Tickets</Text><Text style={s.heroKpiVal}>{W.tickets}</Text></View>
        <View><Text style={s.heroKpiLabel}>Annulations</Text><Text style={s.heroKpiVal}>{W.ann_pct?.toFixed(1) ?? "0"}%</Text></View>
      </View>
    </View>
  );
}

function MargeCard({ stats }: { stats: any }) {
  const W = stats;
  const margeTotal = W.marge_total ?? 0;
  const margePct = W.marge_pct ?? 0;
  if (margeTotal === 0 && margePct === 0) return null;
  const dayMarge: number[] = W.day_marge ?? [];
  const dayTM: number[] = W.day_taux_marque ?? [];
  const avgTM = dayTM.filter((v) => v > 0).length > 0
    ? dayTM.filter((v) => v > 0).reduce((acc, v) => acc + v, 0) / dayTM.filter((v) => v > 0).length
    : 0;
  const maxMarge = Math.max(...dayMarge, 1);
  const labels: string[] = W.days ?? [];

  return (
    <View style={s.card}>
      <Text style={s.sec}>Marge & taux de marque</Text>
      <View style={{ flexDirection: "row", gap: 6, marginBottom: 8 }}>
        <View style={{ ...s.kpi, flex: 1 }}>
          <Text style={{ ...s.kpiVal, color: c.green }}>{fmt(margeTotal)}</Text>
          <Text style={s.kpiLabel}>Marge totale</Text>
        </View>
        <View style={{ ...s.kpi, flex: 1 }}>
          <Text style={{ ...s.kpiVal, color: margePct >= 25 ? c.green : margePct >= 15 ? "#e65100" : c.bad }}>{margePct.toFixed(1)}%</Text>
          <Text style={s.kpiLabel}>Marge / CA HT</Text>
        </View>
        <View style={{ ...s.kpi, flex: 1 }}>
          <Text style={{ ...s.kpiVal, color: c.accent }}>{(avgTM * 100).toFixed(1)}%</Text>
          <Text style={s.kpiLabel}>Taux de marque moy.</Text>
        </View>
      </View>
      {dayMarge.length > 1 && (
        <View>
          <Text style={{ ...s.sec, marginBottom: 4 }}>Marge par jour</Text>
          {dayMarge.map((m, i) => {
            const tm = dayTM[i] ?? 0;
            const pct = maxMarge > 0 ? (m / maxMarge) * 100 : 0;
            const tmColor = tm >= 0.25 ? c.green : tm >= 0.15 ? "#e65100" : c.bad;
            return (
              <View key={i} style={{ flexDirection: "row", alignItems: "center", marginBottom: 2 }}>
                <Text style={{ width: 40, fontSize: 6 }}>{labels[i] ?? ""}</Text>
                <View style={{ flex: 1, ...s.barBg }}>
                  <View style={{ ...s.barFill, width: `${pct}%`, backgroundColor: c.green }} />
                </View>
                <Text style={{ width: 42, textAlign: "right", fontSize: 7, fontFamily: "Helvetica-Bold", color: c.green }}>{fmt(m)}</Text>
                <Text style={{ width: 30, textAlign: "right", fontSize: 6, fontFamily: "Helvetica-Bold", color: tmColor }}>{(tm * 100).toFixed(1)}%</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function HourlyCard({ stats }: { stats: any }) {
  const h: number[] = stats.hourly_totals ?? [];
  if (!h.length || !h.some((v) => v > 0)) return null;
  const maxH = Math.max(...h, 1);
  let startH = h.findIndex((v) => v > 0);
  let endH = h.length - 1 - [...h].reverse().findIndex((v) => v > 0) + 1;
  if (startH < 0) { startH = 10; endH = 22; }
  startH = Math.max(0, startH - 1);
  endH = Math.min(24, endH + 1);
  const hours = Array.from({ length: endH - startH }, (_, i) => startH + i);

  return (
    <View style={s.card}>
      <Text style={s.sec}>Repartition horaire des ventes (articles)</Text>
      <View style={{ flexDirection: "row", alignItems: "flex-end" as const, gap: 2, height: 80 }}>
        {hours.map((hour) => {
          const val = h[hour] ?? 0;
          const pct = maxH > 0 ? (val / maxH) * 100 : 0;
          return (
            <View key={hour} style={{ flex: 1, alignItems: "center" as const, justifyContent: "flex-end" as const, height: "100%" }}>
              <View style={{ width: "100%", height: `${Math.max(pct, 2)}%`, backgroundColor: val > 0 ? c.accent : "#ddd6c8", borderRadius: 1 }} />
              <Text style={{ fontSize: 5, color: c.muted, marginTop: 1 }}>{hour}h</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function ZonesRow({ stats, mode }: { stats: any; mode: string }) {
  const W = stats;
  if (!W.zones_ttc) return null;
  const entries = Object.entries(mode === "ttc" ? W.zones_ttc : W.zones_ht).filter(([, vals]: [string, any]) => vals.some((v: number) => v > 0));
  if (!entries.length) return null;
  return (
    <View style={{ ...s.row, marginBottom: 8 }}>
      {entries.map(([zone, vals]: [string, any]) => {
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
  );
}

function SurPlaceEmporterCard({ stats, mode }: { stats: any; mode: string }) {
  const W = stats;
  if (!W.place_emp_ttc && !W.place_sur_ttc) return null;
  return (
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
  );
}

function ComparatifCard({ stats, prev, mode }: { stats: any; prev: any; mode: string }) {
  const W = stats;
  if (!prev || !prev.day_ttc || prev.day_ttc.length === 0 || !W.days || W.days.length < 2) return null;
  const curVals: number[] = (mode === "ttc" ? W.day_ttc : W.day_ht) ?? [];
  const prevVals: number[] = (mode === "ttc" ? prev.day_ttc : prev.day_ht) ?? [];
  if (!curVals.length) return null;
  const maxVal = Math.max(...curVals, ...prevVals, 1);
  const labels: string[] = W.days ?? [];
  const limited = curVals.slice(0, 14);

  return (
    <View style={s.card}>
      <Text style={s.sec}>Comparatif · CA {mode.toUpperCase()} vs A-1</Text>
      {limited.map((cur, i) => {
        const prv = prevVals[i] ?? 0;
        const diff = cur - prv;
        return (
          <View key={i} style={{ marginBottom: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 1 }}>
              <Text style={{ width: 40, fontSize: 6 }}>{labels[i] ?? ""}</Text>
              <View style={{ flex: 1, ...s.barBg, height: 4 }}>
                <View style={{ ...s.barFill, height: 4, width: `${(cur / maxVal) * 100}%`, backgroundColor: c.accent }} />
              </View>
              <Text style={{ width: 42, textAlign: "right", fontSize: 6, fontFamily: "Helvetica-Bold", color: c.accent }}>{fmt(cur)}</Text>
              <Text style={{ width: 38, textAlign: "right", fontSize: 6, fontFamily: "Helvetica-Bold", color: diff >= 0 ? c.good : c.bad }}>
                {diff >= 0 ? "+" : ""}{fmt(Math.abs(diff))}
              </Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={{ width: 40, fontSize: 5, color: c.muted }}>A-1</Text>
              <View style={{ flex: 1, ...s.barBg, height: 3 }}>
                <View style={{ ...s.barFill, height: 3, width: `${(prv / maxVal) * 100}%`, backgroundColor: c.green, opacity: 0.6 }} />
              </View>
              <Text style={{ width: 42, textAlign: "right", fontSize: 5, color: c.muted }}>{prv > 0 ? fmt(prv) : "\u2014"}</Text>
              <Text style={{ width: 38 }} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

function ServicesTable({ stats, mode, viewTab }: { stats: any; mode: string; viewTab: string }) {
  const W = stats;
  const maxServices = viewTab === "mois" || viewTab === "perso" ? 40 : 20;
  const services = (W.services ?? []).slice(0, maxServices);
  if (!services.length) return null;
  return (
    <View style={s.card} wrap>
      <Text style={s.sec}>Par service · {mode.toUpperCase()} · couverts</Text>
      <View style={s.tHead}>
        <Text style={{ ...s.tH, width: 50 }}>Jour</Text>
        <Text style={{ ...s.tH, width: 25 }}>Svc</Text>
        <Text style={{ ...s.tH, width: 45, textAlign: "right" }}>CA</Text>
        <Text style={{ ...s.tH, width: 20, textAlign: "right" }}>Cvt</Text>
        <Text style={{ ...s.tH, width: 30, textAlign: "right" }}>CVT M</Text>
      </View>
      {services.map((svc: any, i: number) => (
        <View key={i} style={s.tRow} wrap={false}>
          <Text style={{ ...s.tCellBold, width: 50 }}>{svc.jour}</Text>
          <Text style={{ ...s.tCellMuted, width: 25 }}>{svc.svc === "midi" ? "M" : "S"}</Text>
          <Text style={{ ...s.tCellAccent, width: 45, textAlign: "right" }}>{fmt(mode === "ttc" ? svc.ttc : svc.ht)}</Text>
          <Text style={{ ...s.tCell, width: 20, textAlign: "right" }}>{svc.cov}</Text>
          <Text style={{ ...s.tCell, width: 30, textAlign: "right" }}>{(mode === "ttc" ? svc.tm_sp_ttc : svc.tm_sp_ht).toFixed(0)}{"\u20AC"}</Text>
        </View>
      ))}
    </View>
  );
}

function UpsellCard({ stats }: { stats: any }) {
  const W = stats;
  if (!W.ratios) return null;
  const items = [
    { label: "Antipasti", data: W.ratios.anti, color: c.accent },
    { label: "Desserts", data: W.ratios.dolci, color: "#b5904a" },
    { label: "Vins", data: W.ratios.vin, color: "#7c5c3a" },
    { label: "Alcool", data: W.ratios.alcool, color: "#c15f2e" },
    { label: "Boissons", data: W.ratios.boissons, color: "#5e7a8a" },
    { label: "Cafe", data: W.ratios.cafe, color: "#6f5c3a" },
  ];
  return (
    <View style={{ ...s.card, flexDirection: "row", gap: 6 }}>
      {items.map((u) => {
        const tables = u.data?.tables ?? 0;
        const pct = W.tickets > 0 ? Math.round((tables / W.tickets) * 100) : 0;
        return (
          <View key={u.label} style={{ flex: 1, alignItems: "center" as const }}>
            <Text style={{ fontSize: 12, fontFamily: "Helvetica-Bold", color: u.color }}>{pct}%</Text>
            <Text style={{ fontSize: 5, color: c.muted, marginTop: 1 }}>{u.label}</Text>
            <Text style={{ fontSize: 5, color: c.faint }}>{tables}/{W.tickets}t</Text>
          </View>
        );
      })}
    </View>
  );
}

function DurationCard({ stats }: { stats: any }) {
  const W = stats;
  if (!W.duration || !W.duration.totalOrders || W.duration.totalOrders === 0) return null;
  return (
    <View style={{ ...s.card, flexDirection: "row", gap: 12 }}>
      <View style={{ flex: 1, alignItems: "center" as const }}>
        <Text style={{ fontSize: 14, fontFamily: "Helvetica-Bold", color: c.accent }}>{W.duration.avgDurMin}<Text style={{ fontSize: 8, color: c.muted }}>min</Text></Text>
        <Text style={{ fontSize: 5, color: c.muted }}>Duree moy.</Text>
      </View>
      <View style={{ flex: 1, alignItems: "center" as const }}>
        <Text style={{ fontSize: 14, fontFamily: "Helvetica-Bold", color: c.green }}>{W.duration.avgRotation}x</Text>
        <Text style={{ fontSize: 5, color: c.muted }}>Rotation</Text>
      </View>
      <View style={{ flex: 1, alignItems: "center" as const }}>
        <Text style={{ fontSize: 14, fontFamily: "Helvetica-Bold", color: "#7c5c3a" }}>{W.duration.totalOrders}</Text>
        <Text style={{ fontSize: 5, color: c.muted }}>Tables servies</Text>
      </View>
    </View>
  );
}

function MixCategoriesCard({ stats, mode }: { stats: any; mode: string }) {
  const W = stats;
  if (!W.mix_labels || !W.mix_labels.length) return null;
  const vals: number[] = (mode === "ttc" ? W.mix_ttc : W.mix_ht) ?? [];
  const total = vals.reduce((a: number, b: number) => a + b, 0);
  const maxV = Math.max(...vals, 1);
  const colors = ["#D4775A", "#8fa8a0", "#46655a", "#7c5c3a", "#c4a882", "#e0b896", "#5e7a8a", "#a8b89c"];
  return (
    <View style={s.card}>
      <Text style={s.sec}>Ventes par categorie · CA {mode.toUpperCase()}</Text>
      {W.mix_labels.map((label: string, i: number) => {
        const v = vals[i] ?? 0;
        const pct = total > 0 ? ((v / total) * 100).toFixed(0) : "0";
        return (
          <View key={label} style={{ flexDirection: "row", alignItems: "center", marginBottom: 3 }}>
            <Text style={{ width: 55, fontSize: 7 }}>{label}</Text>
            <View style={{ flex: 1, ...s.barBg }}>
              <View style={{ ...s.barFill, width: `${(v / maxV) * 100}%`, backgroundColor: colors[i % colors.length] }} />
            </View>
            <Text style={{ width: 40, textAlign: "right", fontSize: 7, fontFamily: "Helvetica-Bold" }}>{fmt(v)}</Text>
            <Text style={{ width: 22, textAlign: "right", fontSize: 6, color: c.muted }}>{pct}%</Text>
          </View>
        );
      })}
    </View>
  );
}

function Top10Card({ stats, mode }: { stats: any; mode: string }) {
  const W = stats;
  if (!W.top10_names || !W.top10_names.length) return null;
  const vals: number[] = (mode === "ttc" ? W.top10_ca_ttc : W.top10_ca_ht) ?? [];
  const maxV = Math.max(...vals, 1);
  return (
    <View style={s.card}>
      <Text style={s.sec}>Top 10 produits · CA {mode.toUpperCase()}</Text>
      {W.top10_names.map((name: string, i: number) => {
        const v = vals[i] ?? 0;
        const qty = W.top10_qty?.[i] ?? 0;
        return (
          <View key={name} style={{ flexDirection: "row", alignItems: "center", marginBottom: 2 }} wrap={false}>
            <Text style={{ width: 10, fontSize: 6, color: c.faint, textAlign: "right" }}>{i + 1}</Text>
            <Text style={{ width: 80, fontSize: 7, marginLeft: 4 }}>{name}</Text>
            <View style={{ flex: 1, ...s.barBg }}>
              <View style={{ ...s.barFill, width: `${(v / maxV) * 100}%`, backgroundColor: c.accent }} />
            </View>
            <Text style={{ width: 40, textAlign: "right", fontSize: 7, fontFamily: "Helvetica-Bold" }}>{fmt(v)}</Text>
            <Text style={{ width: 22, textAlign: "right", fontSize: 6, color: c.muted }}>{qty}x</Text>
          </View>
        );
      })}
    </View>
  );
}

function Top3CatsCard({ stats, mode }: { stats: any; mode: string }) {
  const W = stats;
  if (!W.top3_cats || !W.top3_cats.length) return null;
  return (
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
  );
}

function ServeursCard({ stats, mode }: { stats: any; mode: string }) {
  const W = stats;
  if (!W.serveurs || !W.serveurs.length) return null;
  const vals: number[] = (mode === "ttc" ? W.serv_ca_ttc : W.serv_ca_ht) ?? [];
  const maxV = Math.max(...vals, 1);
  return (
    <View style={s.card}>
      <Text style={s.sec}>Performance serveurs · CA {mode.toUpperCase()}</Text>
      {W.serveurs.map((name: string, i: number) => {
        const v = vals[i] ?? 0;
        return (
          <View key={name} style={{ flexDirection: "row", alignItems: "center", marginBottom: 3 }}>
            <Text style={{ width: 50, fontSize: 7, fontFamily: "Helvetica-Bold" }}>{name}</Text>
            <View style={{ flex: 1, ...s.barBg }}>
              <View style={{ ...s.barFill, width: `${(v / maxV) * 100}%`, backgroundColor: c.green }} />
            </View>
            <Text style={{ width: 40, textAlign: "right", fontSize: 7, fontFamily: "Helvetica-Bold" }}>{fmt(v)}</Text>
          </View>
        );
      })}
    </View>
  );
}

function PaiementsCard({ stats }: { stats: any }) {
  const W = stats;
  if (!W.pay || !W.pay.length) return null;
  const colors = ["#c8960a", "#e0b020", "#f0c840", "#f5d96a", "#f9e9a0"];
  return (
    <View style={s.card}>
      <Text style={s.sec}>Modes de paiement</Text>
      {W.pay.map((p: any, i: number) => (
        <View key={i} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 2, borderBottomWidth: 0.3, borderBottomColor: "#f0ebe3" }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors[i % colors.length], marginRight: 6 }} />
          <Text style={{ flex: 1, fontSize: 7, color: c.muted }}>{p.l}</Text>
          <Text style={{ width: 45, textAlign: "right", fontSize: 7, fontFamily: "Helvetica-Bold" }}>{fmt(p.v)}</Text>
          <Text style={{ width: 25, textAlign: "right", fontSize: 6, color: c.muted }}>{p.pct}%</Text>
        </View>
      ))}
    </View>
  );
}

function BriefingCard({ briefing }: { briefing: string[] }) {
  if (!briefing || !briefing.length) return null;
  return (
    <View style={{ backgroundColor: c.white, borderRadius: 6, padding: 10, borderWidth: 0.5, borderColor: c.border, borderLeftWidth: 3, borderLeftColor: c.accent }}>
      <Text style={{ fontSize: 7, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 1, color: c.accent, marginBottom: 8 }}>
        Points briefing
      </Text>
      {briefing.map((point: string, i: number) => (
        <View key={i} style={{ flexDirection: "row", gap: 8, paddingVertical: 4, borderBottomWidth: i < briefing.length - 1 ? 0.3 : 0, borderBottomColor: "#f0ebe3" }}>
          <Text style={{ fontSize: 7, fontFamily: "Helvetica-Bold", color: c.accent, width: 14 }}>
            {String(i + 1).padStart(2, "0")}
          </Text>
          <Text style={{ fontSize: 7, flex: 1, lineHeight: 1.5, color: "#333" }}>
            {point.replace(/<[^>]+>/g, "")}
          </Text>
        </View>
      ))}
    </View>
  );
}

/* ══════════════════════════════════════════════════
   MAIN DOCUMENT
   ══════════════════════════════════════════════════ */

export function VentesPDF({ stats, prev, mode, viewTab, rangeLabel, etabName, briefing, exportType = "ventes" }: Props) {
  const _ = fmtNum; void _;
  const isVentes = exportType === "ventes";
  const isProduits = exportType === "produits";
  const isComplet = exportType === "complet";

  return (
    <Document>
      {/* ─── PAGE 1 ─── */}
      {(isVentes || isComplet) && (
        <Page size="A4" style={s.page} wrap>
          <HeaderBlock etabName={etabName} rangeLabel={rangeLabel} stats={stats} exportType={exportType} />
          <HeroCard stats={stats} prev={prev} mode={mode} />
          <ZonesRow stats={stats} mode={mode} />
          <SurPlaceEmporterCard stats={stats} mode={mode} />
          <ComparatifCard stats={stats} prev={prev} mode={mode} />
          <ServicesTable stats={stats} mode={mode} viewTab={viewTab} />
        </Page>
      )}

      {/* ─── PAGE 2 (Ventes focus) ─── */}
      {(isVentes || isComplet) && (
        <Page size="A4" style={s.page} wrap>
          <HeaderBlock etabName={etabName} rangeLabel={rangeLabel} stats={stats} exportType={exportType} />
          <UpsellCard stats={stats} />
          <DurationCard stats={stats} />
          <ServeursCard stats={stats} mode={mode} />
          <PaiementsCard stats={stats} />
          {briefing && briefing.length > 0 && <BriefingCard briefing={briefing} />}
        </Page>
      )}

      {/* ─── PAGE 3 (Produits focus) ─── */}
      {(isProduits || isComplet) && (
        <Page size="A4" style={s.page} wrap>
          <HeaderBlock etabName={etabName} rangeLabel={rangeLabel} stats={stats} exportType={exportType} />
          {isProduits && <HeroCard stats={stats} prev={prev} mode={mode} />}
          <MargeCard stats={stats} />
          <MixCategoriesCard stats={stats} mode={mode} />
          <Top10Card stats={stats} mode={mode} />
        </Page>
      )}

      {/* ─── PAGE 4 (Produits detail + hourly) ─── */}
      {(isProduits || isComplet) && (
        <Page size="A4" style={s.page} wrap>
          <HeaderBlock etabName={etabName} rangeLabel={rangeLabel} stats={stats} exportType={exportType} />
          <Top3CatsCard stats={stats} mode={mode} />
          <HourlyCard stats={stats} />
          {isProduits && briefing && briefing.length > 0 && <BriefingCard briefing={briefing} />}
        </Page>
      )}
    </Document>
  );
}
