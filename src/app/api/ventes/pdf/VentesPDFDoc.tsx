import React from "react";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";

/* eslint-disable @typescript-eslint/no-explicit-any */

const c = {
  accent: "#D4775A", green: "#46655a", gold: "#c4a882",
  text: "#1a1a1a", muted: "#777", faint: "#bbb",
  border: "#e0d8ce", bg: "#f2ede4", white: "#fff",
  good: "#2e7d32", bad: "#c62828",
  pergolas: "#5e8278", salle: "#46655a", terrasse: "#c4a882", emp: "#D4775A",
};

const s = StyleSheet.create({
  page: { padding: 24, fontFamily: "Helvetica", fontSize: 9, color: c.text, backgroundColor: c.bg },
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
  tCell: { fontSize: 8 },
  tCellBold: { fontSize: 8, fontFamily: "Helvetica-Bold" },
  tCellAccent: { fontSize: 8, fontFamily: "Helvetica-Bold", color: c.accent },
  tCellMuted: { fontSize: 8, color: c.muted },
  kpi: { backgroundColor: c.white, borderRadius: 5, padding: 8, borderWidth: 0.5, borderColor: c.border, alignItems: "center" as const },
  kpiVal: { fontSize: 12, fontWeight: "bold", fontFamily: "Helvetica-Bold" },
  kpiLabel: { fontSize: 5, textTransform: "uppercase", letterSpacing: 0.6, color: c.muted, marginTop: 2 },
  barBg: { height: 3, backgroundColor: "#f0ebe3", borderRadius: 1, overflow: "hidden" as const },
  barFill: { height: 3, borderRadius: 1 },
  top3Card: { backgroundColor: c.white, borderRadius: 5, padding: 6, borderWidth: 0.5, borderColor: c.border },
  top3Cat: { fontSize: 5, textTransform: "uppercase", letterSpacing: 0.6, color: c.accent, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  top3Row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 1.5, borderBottomWidth: 0.2, borderBottomColor: "#f0ebe3" },
});

// Manual French number formatting (toLocaleString unreliable on serverless)
function frNum(n: number): string {
  const s = Math.abs(Math.round(n)).toString();
  const parts: string[] = [];
  for (let i = s.length; i > 0; i -= 3) parts.unshift(s.slice(Math.max(0, i - 3), i));
  return (n < 0 ? "-" : "") + parts.join(" ");
}
const fmt = (v: number) => frNum(v) + "\u20AC";
const fmtNum = (v: number) => frNum(v);
const fmtSp = (v: number) => v.toFixed(1).replace(".", ",");

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

/* ── Helpers ── */

type WeekBucket = { label: string; indices: number[] };

function buildWeekBuckets(dates: string[]): WeekBucket[] {
  if (!dates.length) return [];
  const buckets: WeekBucket[] = [];
  let cur: WeekBucket | null = null;
  for (let i = 0; i < dates.length; i++) {
    const d = new Date(dates[i] + "T12:00:00");
    const dow = d.getDay() || 7;
    const mon = new Date(d);
    mon.setDate(d.getDate() - dow + 1);
    const key = `S.${mon.getDate()}/${mon.getMonth() + 1}`;
    if (!cur || cur.label !== key) {
      cur = { label: key, indices: [i] };
      buckets.push(cur);
    } else {
      cur.indices.push(i);
    }
  }
  return buckets;
}

function sumByBuckets(vals: number[], buckets: WeekBucket[]): number[] {
  return buckets.map(b => b.indices.reduce((sum, i) => sum + (vals[i] ?? 0), 0));
}

function deltaPct(cur: number, prev: number): string {
  if (!prev || prev === 0) return "";
  const pct = ((cur - prev) / prev) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

function deltaAbs(cur: number, prev: number): string {
  const diff = cur - prev;
  return `${diff >= 0 ? "+" : ""}${fmtNum(diff)}`;
}

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

function HeroCard({ stats, prev }: { stats: any; prev: any }) {
  const W = stats;
  const prevCA = prev?.ca_ttc ?? null;
  const cvtTtc = W.couverts > 0 ? (W.ca_ttc / W.couverts).toFixed(1) : "0";
  const cvtHt = W.couverts > 0 ? (W.ca_ht / W.couverts).toFixed(1) : "0";
  return (
    <View style={s.hero}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <View>
          <Text style={{ fontSize: 6, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>CA TTC</Text>
          <Text style={s.heroBig}>{fmt(W.ca_ttc)}</Text>
          <Text style={s.heroSub}>HT {fmt(W.ca_ht)}</Text>
        </View>
        {prevCA != null && prevCA > 0 && (
          <View style={{ alignItems: "flex-end" as const }}>
            <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: W.ca_ttc >= prevCA ? "#a5d6a7" : "#ef9a9a" }}>
              {deltaPct(W.ca_ttc, prevCA)}
            </Text>
            <Text style={{ fontSize: 6, color: "rgba(255,255,255,0.5)", marginTop: 1 }}>vs A-1</Text>
          </View>
        )}
      </View>
      <View style={s.heroRow}>
        <View><Text style={s.heroKpiLabel}>Couverts</Text><Text style={s.heroKpiVal}>{fmtNum(W.couverts || W.tickets)}</Text></View>
        <View><Text style={s.heroKpiLabel}>CVT moyen TTC</Text><Text style={s.heroKpiVal}>{cvtTtc}{"\u20AC"}</Text><Text style={{ fontSize: 5, color: "rgba(255,255,255,0.5)" }}>HT {cvtHt}{"\u20AC"}</Text></View>
        <View><Text style={s.heroKpiLabel}>Tickets</Text><Text style={s.heroKpiVal}>{fmtNum(W.tickets)}</Text></View>
        <View><Text style={s.heroKpiLabel}>Annulations</Text><Text style={s.heroKpiVal}>{W.ann_pct?.toFixed(1) ?? "0"}%</Text></View>
      </View>
    </View>
  );
}

/* KPI cards row: Couverts / CVT Moyen / VS A-1 with deltas */
function KpiCardsRow({ stats, prev }: { stats: any; prev: any }) {
  const W = stats;
  const prevCA = prev?.ca_ttc ?? null;
  const prevCov = prev?.couverts ?? 0;
  const tmTtc = W.couverts > 0 ? W.ca_ttc / W.couverts : 0;
  const tmHt = W.couverts > 0 ? W.ca_ht / W.couverts : 0;
  const prevTm = prevCov > 0 && prevCA ? prevCA / prevCov : 0;
  const tmSP = W.cov_sur > 0 ? W.place_sur_ttc / W.cov_sur : 0;

  return (
    <View style={{ ...s.row, marginBottom: 8 }}>
      <View style={{ ...s.kpi, flex: 1 }}>
        <Text style={{ fontSize: 5, textTransform: "uppercase", letterSpacing: 0.6, color: c.muted, fontFamily: "Helvetica-Bold", marginBottom: 2 }}>Couverts</Text>
        <Text style={{ ...s.kpiVal, fontSize: 14 }}>{fmtNum(W.couverts)}</Text>
        <Text style={{ fontSize: 6, color: c.muted }}>{fmtNum(W.tickets)} tickets</Text>
        {prevCov > 0 && (
          <Text style={{ fontSize: 6, color: W.couverts >= prevCov ? c.good : c.bad, marginTop: 2 }}>
            {deltaAbs(W.couverts, prevCov)} ({deltaPct(W.couverts, prevCov)})
          </Text>
        )}
      </View>
      <View style={{ ...s.kpi, flex: 1 }}>
        <Text style={{ fontSize: 5, textTransform: "uppercase", letterSpacing: 0.6, color: c.muted, fontFamily: "Helvetica-Bold", marginBottom: 2 }}>CVT Moyen TTC</Text>
        <Text style={{ ...s.kpiVal, fontSize: 14 }}>{fmtSp(tmTtc)}{"\u20AC"}</Text>
        <Text style={{ fontSize: 6, color: c.muted }}>HT {fmtSp(tmHt)}{"\u20AC"} · SP {fmtSp(tmSP)}{"\u20AC"}</Text>
        {prevTm > 0 && (
          <Text style={{ fontSize: 6, color: tmTtc >= prevTm ? c.good : c.bad, marginTop: 2 }}>
            {(tmTtc - prevTm) >= 0 ? "+" : ""}{(tmTtc - prevTm).toFixed(1)}{"\u20AC"} ({deltaPct(tmTtc, prevTm)})
          </Text>
        )}
      </View>
      {prevCA != null && prevCA > 0 && (
        <View style={{ ...s.kpi, flex: 1 }}>
          <Text style={{ fontSize: 5, textTransform: "uppercase", letterSpacing: 0.6, color: c.muted, fontFamily: "Helvetica-Bold", marginBottom: 2 }}>VS A-1</Text>
          <Text style={{ ...s.kpiVal, fontSize: 14, color: W.ca_ttc >= prevCA ? c.good : c.bad }}>{deltaAbs(Math.round(W.ca_ttc), Math.round(prevCA))}{"\u20AC"}</Text>
          <Text style={{ fontSize: 6, color: c.muted }}>A-1: {fmt(prevCA)}</Text>
        </View>
      )}
    </View>
  );
}

/* Upsell performance — detailed cards */
function UpsellCard({ stats }: { stats: any }) {
  const W = stats;
  if (!W.ratios) return null;
  const allItems = [
    { label: "Antipasti", data: W.ratios.anti, color: c.accent },
    { label: "Pizzas", data: W.ratios.pizze, color: "#c94c2c" },
    { label: "Plats / Pasta", data: W.ratios.plats, color: "#8a6b3e" },
    { label: "Desserts", data: W.ratios.dolci, color: "#b5904a" },
    { label: "Vins", data: W.ratios.vin, color: "#7c5c3a" },
    { label: "Alcool", data: W.ratios.alcool, color: "#c15f2e" },
    { label: "Boissons", data: W.ratios.boissons, color: c.green },
    { label: "Cafe", data: W.ratios.cafe, color: "#6f5c3a" },
    { label: "Digestifs", data: W.ratios.digestif, color: "#8b6914" },
  ];

  // Render in rows of 3
  const rows: typeof allItems[] = [];
  for (let i = 0; i < allItems.length; i += 3) rows.push(allItems.slice(i, i + 3));

  return (
    <View style={s.card} wrap={false}>
      <Text style={s.sec}>Upsell · Performance de la periode</Text>
      {rows.map((row, ri) => (
        <View key={ri} style={{ flexDirection: "row", gap: 5, marginBottom: 5 }}>
          {row.map((u) => {
            const tables = u.data?.tables ?? 0;
            const coverts = u.data?.coverts ?? 0;
            const caTtc = u.data?.ca_ttc ?? 0;
            const pct = W.tickets > 0 ? Math.round((tables / W.tickets) * 100) : 0;
            const pctCov = W.couverts > 0 ? Math.round((coverts / W.couverts) * 100) : 0;
            return (
              <View key={u.label} style={{ flex: 1, backgroundColor: c.white, borderRadius: 5, padding: 5, borderWidth: 0.5, borderColor: c.border }}>
                <Text style={{ fontSize: 6, fontFamily: "Helvetica-Bold", marginBottom: 2 }}>{u.label}</Text>
                <Text style={{ fontSize: 12, fontFamily: "Helvetica-Bold", color: u.color }}>{pct}%</Text>
                <Text style={{ fontSize: 5, color: c.muted }}>{tables}/{W.tickets} tbl · {coverts} cvt ({pctCov}%)</Text>
                <View style={{ ...s.barBg, marginTop: 3, marginBottom: 2 }}>
                  <View style={{ ...s.barFill, width: `${Math.min(100, pct)}%`, backgroundColor: u.color }} />
                </View>
                <Text style={{ fontSize: 6, fontFamily: "Helvetica-Bold", color: u.color }}>{fmt(caTtc)}</Text>
              </View>
            );
          })}
          {row.length < 3 && Array.from({ length: 3 - row.length }).map((_, i) => <View key={`pad-${i}`} style={{ flex: 1 }} />)}
        </View>
      ))}
    </View>
  );
}

/* Duration & rotation with zone breakdown */
function DurationCard({ stats, prev }: { stats: any; prev: any }) {
  const W = stats;
  if (!W.duration || !W.duration.totalOrders || W.duration.totalOrders === 0) return null;
  const prevDur = prev?.duration;
  const zoneColors: Record<string, string> = { Pergolas: c.pergolas, Salle: c.salle, Terrasse: c.terrasse };

  return (
    <View style={s.card} wrap={false}>
      <Text style={s.sec}>Duree & rotation des tables</Text>
      {/* Global KPIs */}
      <View style={{ flexDirection: "row", gap: 6, marginBottom: 6 }}>
        <View style={{ ...s.kpi, flex: 1 }}>
          <Text style={{ ...s.kpiVal, color: c.accent }}>{W.duration.avgDurMin}<Text style={{ fontSize: 7, color: c.muted }}>min</Text></Text>
          <Text style={s.kpiLabel}>Duree moy. / table</Text>
          {prevDur?.avgDurMin > 0 && (
            <Text style={{ fontSize: 5, color: W.duration.avgDurMin <= prevDur.avgDurMin ? c.good : c.bad, marginTop: 1 }}>
              {deltaAbs(W.duration.avgDurMin, prevDur.avgDurMin)}min vs A-1
            </Text>
          )}
        </View>
        <View style={{ ...s.kpi, flex: 1 }}>
          <Text style={{ ...s.kpiVal, color: c.green }}>{W.duration.avgRotation}x</Text>
          <Text style={s.kpiLabel}>Rotation moy. / table</Text>
          {prevDur?.avgRotation > 0 && (
            <Text style={{ fontSize: 5, color: W.duration.avgRotation >= prevDur.avgRotation ? c.good : c.bad, marginTop: 1 }}>
              {(W.duration.avgRotation - prevDur.avgRotation) >= 0 ? "+" : ""}{(W.duration.avgRotation - prevDur.avgRotation).toFixed(1)}x vs A-1
            </Text>
          )}
        </View>
        <View style={{ ...s.kpi, flex: 1 }}>
          <Text style={{ ...s.kpiVal, color: "#7c5c3a" }}>{fmtNum(W.duration.totalOrders)}</Text>
          <Text style={s.kpiLabel}>Tables servies</Text>
          {prevDur?.totalOrders > 0 && (
            <Text style={{ fontSize: 5, color: W.duration.totalOrders >= prevDur.totalOrders ? c.good : c.bad, marginTop: 1 }}>
              {deltaAbs(W.duration.totalOrders, prevDur.totalOrders)} ({deltaPct(W.duration.totalOrders, prevDur.totalOrders)})
            </Text>
          )}
        </View>
      </View>
      {/* Per zone */}
      {W.duration.byZone && W.duration.byZone.length > 0 && (
        <View style={{ flexDirection: "row", gap: 6, marginBottom: 6 }}>
          {W.duration.byZone.map((z: any) => {
            const rot = W.duration.rotByZone?.find((r: any) => r.zone === z.zone);
            return (
              <View key={z.zone} style={{ flex: 1, backgroundColor: c.white, borderRadius: 5, padding: 6, borderWidth: 0.5, borderColor: c.border }}>
                <Text style={{ fontSize: 5, textTransform: "uppercase", letterSpacing: 0.6, color: zoneColors[z.zone] ?? c.muted, fontFamily: "Helvetica-Bold", marginBottom: 3 }}>{z.zone}</Text>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <View>
                    <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", color: c.accent }}>{z.avgDur}<Text style={{ fontSize: 6, color: c.muted }}>min</Text></Text>
                    <Text style={{ fontSize: 5, color: c.muted }}>duree moy.</Text>
                  </View>
                  {rot && (
                    <View style={{ alignItems: "flex-end" as const }}>
                      <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", color: c.green }}>{rot.avgRotation}x</Text>
                      <Text style={{ fontSize: 5, color: c.muted }}>rotation</Text>
                    </View>
                  )}
                </View>
                <Text style={{ fontSize: 5, color: c.muted, marginTop: 2 }}>{z.tables} tables · {z.couverts} cvts</Text>
                {rot?.maxRotation && <Text style={{ fontSize: 5, color: zoneColors[z.zone] ?? c.muted }}>max {rot.maxRotation}x rotation</Text>}
              </View>
            );
          })}
        </View>
      )}
      {/* MIDI / SOIR */}
      {W.duration.bySvc && W.duration.bySvc.length > 0 && (
        <View style={{ flexDirection: "row", gap: 6 }}>
          {W.duration.bySvc.map((sv: any) => (
            <View key={sv.svc} style={{ flex: 1, backgroundColor: "#faf7f2", borderRadius: 5, padding: 6, borderWidth: 0.5, borderColor: c.border }}>
              <Text style={{ fontSize: 6, fontFamily: "Helvetica-Bold", color: sv.svc === "midi" ? c.pergolas : c.text }}>{sv.svc === "midi" ? "MIDI" : "SOIR"} {sv.tables} tables</Text>
              <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", marginTop: 2 }}>{sv.avgDur}<Text style={{ fontSize: 6, color: c.muted }}>min</Text></Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

/* Sur place vs A emporter — enhanced */
function SurPlaceEmporterCard({ stats }: { stats: any }) {
  const W = stats;
  if (!W.place_emp_ttc && !W.place_sur_ttc) return null;
  const total = W.place_sur_ttc + W.place_emp_ttc;
  const surPct = total > 0 ? Math.round((W.place_sur_ttc / total) * 100) : 0;
  const empPct = total > 0 ? 100 - surPct : 0;
  const surTM = W.cov_sur > 0 ? W.place_sur_ttc / W.cov_sur : 0;
  const empTM = W.cov_emp > 0 ? W.place_emp_ttc / W.cov_emp : 0;

  return (
    <View style={s.card} wrap={false}>
      <Text style={s.sec}>Sur place vs a emporter</Text>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 3 }}>
            <Text style={{ fontSize: 6, textTransform: "uppercase", letterSpacing: 0.6, color: c.green, fontFamily: "Helvetica-Bold" }}>Sur place</Text>
            <Text style={{ fontSize: 6, color: c.muted }}>{surPct}% du CA</Text>
          </View>
          <View style={{ ...s.barBg, height: 4, marginBottom: 4 }}>
            <View style={{ ...s.barFill, height: 4, width: `${surPct}%`, backgroundColor: c.green }} />
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View><Text style={{ fontSize: 5, color: c.muted }}>CA TTC</Text><Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold" }}>{fmt(W.place_sur_ttc)}</Text><Text style={{ fontSize: 6, color: c.muted }}>HT {fmt(W.place_sur_ht)}</Text></View>
            <View><Text style={{ fontSize: 5, color: c.muted }}>CVT</Text><Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold" }}>{fmtNum(W.cov_sur)}</Text></View>
            <View><Text style={{ fontSize: 5, color: c.muted }}>TM</Text><Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: c.green }}>{fmtSp(surTM)}{"\u20AC"}</Text></View>
          </View>
        </View>
        <View style={{ width: 0.5, backgroundColor: c.border }} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 3 }}>
            <Text style={{ fontSize: 6, textTransform: "uppercase", letterSpacing: 0.6, color: c.accent, fontFamily: "Helvetica-Bold" }}>A emporter</Text>
            <Text style={{ fontSize: 6, color: c.muted }}>{empPct}% du CA</Text>
          </View>
          <View style={{ ...s.barBg, height: 4, marginBottom: 4 }}>
            <View style={{ ...s.barFill, height: 4, width: `${empPct}%`, backgroundColor: c.accent }} />
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View><Text style={{ fontSize: 5, color: c.muted }}>CA TTC</Text><Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold" }}>{fmt(W.place_emp_ttc)}</Text><Text style={{ fontSize: 6, color: c.muted }}>HT {fmt(W.place_emp_ht)}</Text></View>
            <View><Text style={{ fontSize: 5, color: c.muted }}>CVT</Text><Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold" }}>{fmtNum(W.cov_emp)}</Text></View>
            <View><Text style={{ fontSize: 5, color: c.muted }}>TM</Text><Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: c.accent }}>{fmtSp(empTM)}{"\u20AC"}</Text></View>
          </View>
        </View>
      </View>
    </View>
  );
}

/* Zone cards with weekly breakdown */
function _ZonesDetailCard({ stats, mode }: { stats: any; mode: string }) {
  const W = stats;
  if (!W.zones_ttc) return null;
  const zones = mode === "ttc" ? W.zones_ttc : W.zones_ht;
  const entries = Object.entries(zones).filter(([, vals]: [string, any]) => vals.some((v: number) => v > 0));
  if (!entries.length) return null;

  const zoneColors: Record<string, string> = { Salle: c.salle, Pergolas: c.pergolas, Terrasse: c.terrasse, "\u00C0 emporter": c.accent };
  const totalCA = entries.reduce((sum, [, vals]: [string, any]) => sum + vals.reduce((a: number, b: number) => a + b, 0), 0);
  const buckets = W.dates?.length > 7 ? buildWeekBuckets(W.dates) : null;

  return (
    <View style={{ flexDirection: "row", gap: 6, marginBottom: 8 }}>
      {entries.map(([zone, vals]: [string, any]) => {
        const zoneTotal = vals.reduce((a: number, b: number) => a + b, 0);
        const pct = totalCA > 0 ? Math.round((zoneTotal / totalCA) * 100) : 0;
        const weekTotals = buckets ? sumByBuckets(vals, buckets) : null;
        const maxWeek = weekTotals ? Math.max(...weekTotals, 1) : 1;

        return (
          <View key={zone} style={{ flex: 1, backgroundColor: c.white, borderRadius: 5, padding: 6, borderWidth: 0.5, borderColor: c.border }}>
            <Text style={{ fontSize: 5, textTransform: "uppercase", letterSpacing: 0.6, color: zoneColors[zone] ?? c.muted, fontFamily: "Helvetica-Bold", marginBottom: 2 }}>{zone}</Text>
            <Text style={{ fontSize: 12, fontFamily: "Helvetica-Bold", color: zoneColors[zone] ?? c.text }}>{fmt(zoneTotal)}</Text>
            <Text style={{ fontSize: 5, color: c.muted }}>{pct}% du CA</Text>
            {weekTotals && buckets && (
              <View style={{ marginTop: 4 }}>
                {weekTotals.map((wv, wi) => (
                  <View key={wi} style={{ flexDirection: "row", alignItems: "center", marginBottom: 2 }}>
                    <Text style={{ width: 22, fontSize: 5, color: c.muted }}>{buckets[wi].label}</Text>
                    <View style={{ flex: 1, ...s.barBg, height: 3 }}>
                      <View style={{ ...s.barFill, height: 3, width: `${(wv / maxWeek) * 100}%`, backgroundColor: zoneColors[zone] ?? c.accent }} />
                    </View>
                    <Text style={{ width: 30, textAlign: "right", fontSize: 6, fontFamily: "Helvetica-Bold" }}>{fmt(wv)}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

/* Comparatif weekly */
function ComparatifCard({ stats, prev }: { stats: any; prev: any }) {
  const W = stats;
  if (!W.days || W.days.length < 2) return null;
  const curVals: number[] = W.day_ttc ?? [];
  const prevVals: number[] = prev?.day_ttc ?? [];
  if (!curVals.length) return null;

  const useWeeks = W.dates && W.dates.length > 14;
  let labels: string[];
  let curData: number[];
  let prevData: number[];

  if (useWeeks) {
    const buckets = buildWeekBuckets(W.dates);
    labels = buckets.map(b => b.label);
    curData = sumByBuckets(curVals, buckets);
    prevData = prevVals.length > 0 ? sumByBuckets(prevVals, buckets) : [];
  } else {
    labels = W.days ?? [];
    curData = curVals.slice(0, 14);
    prevData = prevVals.slice(0, 14);
  }

  const maxVal = Math.max(...curData, ...prevData, 1);

  return (
    <View style={s.card} wrap={false}>
      <Text style={s.sec}>Comparatif · CA TTC {useWeeks ? "par semaine" : ""} vs A-1</Text>
      {curData.map((cur, i) => {
        const prv = prevData[i] ?? 0;
        const diff = cur - prv;
        return (
          <View key={i} style={{ marginBottom: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 1 }}>
              <Text style={{ width: 30, fontSize: 6, fontFamily: "Helvetica-Bold" }}>{labels[i] ?? ""}</Text>
              <View style={{ flex: 1, ...s.barBg, height: 4 }}>
                <View style={{ ...s.barFill, height: 4, width: `${(cur / maxVal) * 100}%`, backgroundColor: c.accent }} />
              </View>
              <Text style={{ width: 42, textAlign: "right", fontSize: 6, fontFamily: "Helvetica-Bold", color: c.accent }}>{fmt(cur)}</Text>
              <Text style={{ width: 38, textAlign: "right", fontSize: 6, fontFamily: "Helvetica-Bold", color: diff >= 0 ? c.good : c.bad }}>
                {prv > 0 ? `${diff >= 0 ? "+" : ""}${fmt(Math.abs(diff))}` : "\u2014"}
              </Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={{ width: 30, fontSize: 5, color: c.muted }}>A-1</Text>
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

/* Services table with zone columns */
function ServicesTable({ stats }: { stats: any }) {
  const W = stats;
  const services = W.services ?? [];
  if (!services.length) return null;

  const useWeeks = W.dates && W.dates.length > 14;

  // Build groups
  type GroupEntry = { groupLabel: string; services: any[] };
  const groups: GroupEntry[] = [];

  if (useWeeks) {
    const buckets = buildWeekBuckets(W.dates);
    const days: string[] = W.days ?? [];
    const dates: string[] = W.dates ?? [];
    // Map each service to its date
    const serviceDateMap: string[] = [];
    let dateIdx = 0;
    for (let si = 0; si < services.length; si++) {
      const sv = services[si];
      while (dateIdx < dates.length && days[dateIdx] !== sv.jour) dateIdx++;
      serviceDateMap[si] = dates[dateIdx] ?? "";
      const next = services[si + 1];
      if (next && next.jour !== sv.jour) dateIdx++;
    }
    const dateToWeek: Record<string, string> = {};
    for (const b of buckets) for (const idx of b.indices) if (dates[idx]) dateToWeek[dates[idx]] = b.label;

    const weekMap: Record<string, any[]> = {};
    const weekOrder: string[] = [];
    for (let si = 0; si < services.length; si++) {
      const sv = services[si];
      const date = serviceDateMap[si];
      const wk = date ? (dateToWeek[date] ?? sv.jour) : sv.jour;
      if (!weekMap[wk]) { weekMap[wk] = []; weekOrder.push(wk); }
      weekMap[wk].push(sv);
    }
    const sumZ = (arr: any[], key: string) => {
      const r: Record<string, number> = {};
      for (const sv of arr) for (const [zn, zv] of Object.entries(sv[key] ?? {})) r[zn] = (r[zn] ?? 0) + (zv as number);
      return r;
    };
    for (const wk of weekOrder) {
      const svcs = weekMap[wk];
      const midi = svcs.filter((sv: any) => sv.svc === "midi");
      const soir = svcs.filter((sv: any) => sv.svc !== "midi");
      const agg: any[] = [];
      for (const [label, arr] of [["Midi", midi], ["Soir", soir]] as const) {
        if (arr.length === 0) continue;
        const ttc = arr.reduce((sum: number, x: any) => sum + x.ttc, 0);
        const ht = arr.reduce((sum: number, x: any) => sum + x.ht, 0);
        const cov = arr.reduce((sum: number, x: any) => sum + x.cov, 0);
        const spCov = arr.reduce((sum: number, x: any) => sum + x.sp_cov, 0);
        const spTtc = arr.reduce((sum: number, x: any) => sum + x.sp_ttc, 0);
        const spHt = arr.reduce((sum: number, x: any) => sum + x.sp_ht, 0);
        const empTtc = arr.reduce((sum: number, x: any) => sum + (x.emp_ttc ?? 0), 0);
        const empHt = arr.reduce((sum: number, x: any) => sum + (x.emp_ht ?? 0), 0);
        agg.push({
          jour: label, svc: label === "Midi" ? "midi" : "soir", ttc, ht, cov,
          sp_cov: spCov, emp_ttc: empTtc, emp_ht: empHt,
          tm_sp_ttc: spCov > 0 ? spTtc / spCov : 0,
          tm_sp_ht: spCov > 0 ? spHt / spCov : 0,
          z_ttc: sumZ(arr, "z_ttc"), z_ht: sumZ(arr, "z_ht"),
        });
      }
      groups.push({ groupLabel: wk, services: agg });
    }
  } else {
    const byDay: Record<string, any[]> = {};
    const dayOrder: string[] = [];
    for (const sv of services) {
      if (!byDay[sv.jour]) { byDay[sv.jour] = []; dayOrder.push(sv.jour); }
      byDay[sv.jour].push(sv);
    }
    for (const d of dayOrder) groups.push({ groupLabel: d, services: byDay[d] });
  }

  return (
    <View style={s.card} wrap>
      <Text style={s.sec}>Par service · TTC · couverts</Text>
      <View style={s.tHead}>
        <Text style={{ ...s.tH, width: 30 }}>{useWeeks ? "Sem." : "Jour"}</Text>
        <Text style={{ ...s.tH, width: 22 }}>Svc</Text>
        <Text style={{ ...s.tH, width: 40, textAlign: "right", color: c.salle }}>Salle</Text>
        <Text style={{ ...s.tH, width: 40, textAlign: "right", color: c.pergolas }}>Pergolas</Text>
        <Text style={{ ...s.tH, width: 40, textAlign: "right", color: c.terrasse }}>Terrasse</Text>
        <Text style={{ ...s.tH, width: 35, textAlign: "right", color: c.emp }}>Emp.</Text>
        <Text style={{ ...s.tH, width: 42, textAlign: "right", color: c.accent }}>Total</Text>
        <Text style={{ ...s.tH, width: 22, textAlign: "right" }}>Cvts</Text>
        <Text style={{ ...s.tH, width: 18, textAlign: "right", color: c.green }}>SP</Text>
        <Text style={{ ...s.tH, width: 25, textAlign: "right", color: c.green }}>M SP</Text>
        <Text style={{ ...s.tH, width: 18, textAlign: "right", color: c.emp }}>EMP</Text>
        <Text style={{ ...s.tH, width: 25, textAlign: "right", color: c.emp }}>M EMP</Text>
      </View>
      {groups.map((group, di) =>
        group.services.map((sv: any, si: number) => {
          const caVal = sv.ttc;
          const z = sv.z_ttc;
          const tmSp = sv.tm_sp_ttc;
          const _tmColor = tmSp >= 80 ? c.good : tmSp >= 65 ? "#e65100" : c.bad;
          return (
            <View key={`${di}-${si}`} style={{ ...s.tRow, backgroundColor: di % 2 === 0 ? c.white : "#faf7f2" }} wrap={false}>
              {si === 0 && <Text style={{ ...s.tCellBold, width: 30 }}>{group.groupLabel}</Text>}
              {si > 0 && <Text style={{ width: 30 }} />}
              <Text style={{ ...s.tCellMuted, width: 22, fontSize: 6 }}>{sv.svc === "midi" ? "Midi" : "Soir"}</Text>
              <Text style={{ ...s.tCellBold, width: 40, textAlign: "right", color: z?.Salle ? c.salle : c.faint }}>{z?.Salle ? fmt(z.Salle) : "\u2014"}</Text>
              <Text style={{ ...s.tCellBold, width: 40, textAlign: "right", color: z?.Pergolas ? c.pergolas : c.faint }}>{z?.Pergolas ? fmt(z.Pergolas) : "\u2014"}</Text>
              <Text style={{ ...s.tCellBold, width: 40, textAlign: "right", color: z?.Terrasse ? c.terrasse : c.faint }}>{z?.Terrasse ? fmt(z.Terrasse) : "\u2014"}</Text>
              <Text style={{ ...s.tCellBold, width: 35, textAlign: "right", color: z?.emp ? c.emp : c.faint }}>{z?.emp ? fmt(z.emp) : "\u2014"}</Text>
              <Text style={{ ...s.tCellAccent, width: 42, textAlign: "right" }}>{fmt(caVal)}</Text>
              <Text style={{ ...s.tCell, width: 22, textAlign: "right" }}>{sv.cov}</Text>
              <Text style={{ ...s.tCell, width: 18, textAlign: "right", color: c.green }}>{sv.sp_cov || "\u2014"}</Text>
              <Text style={{ width: 25, textAlign: "right", fontSize: 7, fontFamily: "Helvetica-Bold", color: c.green }}>{tmSp > 0 ? `${tmSp.toFixed(0)}\u20AC` : "\u2014"}</Text>
              <Text style={{ ...s.tCell, width: 18, textAlign: "right", color: c.emp }}>{sv.cov - (sv.sp_cov ?? 0) > 0 ? sv.cov - sv.sp_cov : "\u2014"}</Text>
              <Text style={{ width: 25, textAlign: "right", fontSize: 7, fontFamily: "Helvetica-Bold", color: c.emp }}>{(() => { const ec = sv.cov - (sv.sp_cov ?? 0); if (ec <= 0) return "\u2014"; return sv.emp_ttc ? `${Math.round(sv.emp_ttc / ec)}\u20AC` : "\u2014"; })()}</Text>
            </View>
          );
        })
      )}
    </View>
  );
}

/* Zones row (simple totals) */
function ZonesRow({ stats }: { stats: any }) {
  const W = stats;
  if (!W.zones_ttc) return null;
  const entriesTtc = Object.entries(W.zones_ttc).filter(([, vals]: [string, any]) => vals.some((v: number) => v > 0));
  if (!entriesTtc.length) return null;
  const htZones = W.zones_ht ?? {};
  const zoneColors: Record<string, string> = { Salle: c.salle, Pergolas: c.pergolas, Terrasse: c.terrasse, "\u00C0 emporter": c.emp };
  return (
    <View style={{ ...s.row, marginBottom: 8 }}>
      {entriesTtc.map(([zone, vals]: [string, any]) => {
        const totTtc = vals.reduce((a: number, b: number) => a + b, 0);
        const htVals: number[] = htZones[zone] ?? [];
        const totHt = htVals.reduce((a: number, b: number) => a + b, 0);
        return (
          <View key={zone} style={{ ...s.kpi, flex: 1 }}>
            <Text style={{ fontSize: 5, textTransform: "uppercase", letterSpacing: 0.6, color: zoneColors[zone] ?? c.muted, fontFamily: "Helvetica-Bold", marginBottom: 2 }}>{zone}</Text>
            <Text style={{ ...s.kpiVal, color: c.text }}>{fmt(totTtc)}</Text>
            <Text style={{ fontSize: 6, color: c.muted }}>HT {fmt(totHt)}</Text>
          </View>
        );
      })}
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
    <View style={s.card} wrap={false}>
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
    <View style={s.card} wrap={false}>
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

function MixCategoriesCard({ stats }: { stats: any }) {
  const W = stats;
  if (!W.mix_labels || !W.mix_labels.length) return null;
  const vals: number[] = W.mix_ttc ?? [];
  const valsHt: number[] = W.mix_ht ?? [];
  const total = vals.reduce((a: number, b: number) => a + b, 0);
  const maxV = Math.max(...vals, 1);
  const colors = ["#D4775A", "#8fa8a0", "#46655a", "#7c5c3a", "#c4a882", "#e0b896", "#5e7a8a", "#a8b89c"];
  return (
    <View style={s.card} wrap={false}>
      <Text style={s.sec}>Ventes par categorie · CA TTC</Text>
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
            <Text style={{ width: 30, textAlign: "right", fontSize: 6, color: c.muted }}>{fmt(valsHt[i] ?? 0)}</Text>
            <Text style={{ width: 22, textAlign: "right", fontSize: 6, color: c.muted }}>{pct}%</Text>
          </View>
        );
      })}
    </View>
  );
}

function Top10Card({ stats }: { stats: any }) {
  const W = stats;
  if (!W.top10_names || !W.top10_names.length) return null;
  const vals: number[] = W.top10_ca_ttc ?? [];
  const valsHt: number[] = W.top10_ca_ht ?? [];
  const maxV = Math.max(...vals, 1);
  return (
    <View style={s.card} wrap={false}>
      <Text style={s.sec}>Top 10 produits · CA TTC</Text>
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
            <Text style={{ width: 30, textAlign: "right", fontSize: 6, color: c.muted }}>{fmt(valsHt[i] ?? 0)}</Text>
            <Text style={{ width: 22, textAlign: "right", fontSize: 6, color: c.muted }}>{qty}x</Text>
          </View>
        );
      })}
    </View>
  );
}

function Top3CatsCard({ stats }: { stats: any }) {
  const W = stats;
  if (!W.top3_cats || !W.top3_cats.length) return null;
  return (
    <View style={s.card} wrap={false}>
      <Text style={s.sec}>Top 3 par categorie</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
        {W.top3_cats.slice(0, 8).map((cat: any, ci: number) => (
          <View key={ci} style={{ ...s.top3Card, width: "24%" }}>
            <Text style={s.top3Cat}>{cat.cat}</Text>
            {cat.rows.map((r: any, ri: number) => (
              <View key={ri} style={s.top3Row}>
                <Text style={{ fontSize: 6 }}>{ri + 1} {r.n}</Text>
                <Text style={{ fontSize: 6, fontFamily: "Helvetica-Bold", color: c.accent }}>{r.ca_ttc}</Text>
              </View>
            ))}
            {cat.flop && (
              <View style={{ ...s.top3Row, borderTopWidth: 0.3, borderTopColor: "#f0ebe3", marginTop: 2, paddingTop: 2 }}>
                <Text style={{ fontSize: 5, color: c.bad }}>&#9660; {cat.flop.n}</Text>
                <Text style={{ fontSize: 5, color: c.bad }}>{cat.flop.ca_ttc}</Text>
              </View>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

function ServeursCard({ stats }: { stats: any }) {
  const W = stats;
  if (!W.serveurs || !W.serveurs.length) return null;
  const vals: number[] = W.serv_ca_ttc ?? [];
  const valsHt: number[] = W.serv_ca_ht ?? [];
  const totalCA = W.ca_ttc;
  const maxV = Math.max(...vals, 1);
  return (
    <View style={s.card} wrap={false}>
      <Text style={s.sec}>Performance serveurs · CA TTC</Text>
      {W.serveurs.map((name: string, i: number) => {
        const v = vals[i] ?? 0;
        const tkt = W.serv_tickets?.[i] ?? 0;
        const cov = W.serv_cov?.[i] ?? 0;
        const cvtM = cov > 0 ? (v / cov).toFixed(1) : "\u2014";
        const pctCA = totalCA > 0 ? ((v / totalCA) * 100).toFixed(1) : "0";
        return (
          <View key={name} style={{ flexDirection: "row", alignItems: "center", marginBottom: 3 }}>
            <Text style={{ width: 50, fontSize: 7, fontFamily: "Helvetica-Bold" }}>{name}</Text>
            <View style={{ flex: 1, ...s.barBg }}>
              <View style={{ ...s.barFill, width: `${(v / maxV) * 100}%`, backgroundColor: c.green }} />
            </View>
            <Text style={{ width: 40, textAlign: "right", fontSize: 7, fontFamily: "Helvetica-Bold" }}>{fmt(v)}</Text>
            <Text style={{ width: 30, textAlign: "right", fontSize: 6, color: c.muted }}>{fmt(valsHt[i] ?? 0)}</Text>
            <Text style={{ width: 22, textAlign: "right", fontSize: 5, color: c.muted }}>{pctCA}%</Text>
            <Text style={{ width: 50, textAlign: "right", fontSize: 5, color: c.muted }}>{tkt}t · {cov}c · {cvtM}{"\u20AC"}</Text>
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
    <View style={s.card} wrap={false}>
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
  void viewTab;
  void mode; // PDF affiche toujours TTC + HT

  return (
    <Document>
      <Page size="A4" style={s.page} wrap>
        {/* 1. Bandeau jour + synthèse */}
        <HeaderBlock etabName={etabName} rangeLabel={rangeLabel} stats={stats} exportType={exportType} />
        <HeroCard stats={stats} prev={prev} />
        <KpiCardsRow stats={stats} prev={prev} />

        {/* 2. Upsell · Performance de la période */}
        <UpsellCard stats={stats} />

        {/* 3. Sur place vs à emporter */}
        <SurPlaceEmporterCard stats={stats} />

        {/* 4. Tuile par salle */}
        <ZonesRow stats={stats} />

        {/* 5. Comparatif · CA TTC par semaine vs A-1 */}
        <ComparatifCard stats={stats} prev={prev} />

        {/* 6. Par service · TTC · Couverts */}
        <ServicesTable stats={stats} />

        {/* 7. Durée & Rotation des tables */}
        <DurationCard stats={stats} prev={prev} />

        {/* 8. Top 10 produits · CA TTC */}
        <Top10Card stats={stats} />

        {/* 9. Top 3 par catégorie · CA TTC */}
        <Top3CatsCard stats={stats} />

        {/* 10. Ventes par catégorie · CA TTC */}
        <MixCategoriesCard stats={stats} />

        {/* 11. Performance serveurs · CA TTC */}
        <ServeursCard stats={stats} />

        {/* 12. Modes de paiement */}
        <PaiementsCard stats={stats} />

        {/* 13. Points briefing de la période */}
        {briefing && briefing.length > 0 && <BriefingCard briefing={briefing} />}
      </Page>
    </Document>
  );
}
