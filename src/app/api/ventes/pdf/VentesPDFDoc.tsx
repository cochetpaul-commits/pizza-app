import React from "react";
import { Document, Page, View, Text, StyleSheet, Font } from "@react-pdf/renderer";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Sans ce callback, react-pdf coupe les mots avec des tirets ("PERGO-LAS", "TARTU-FATA")
Font.registerHyphenationCallback((word) => [word]);

const c = {
  accent: "#D4775A", green: "#46655a", gold: "#c4a882",
  text: "#1a1a1a", muted: "#777", faint: "#bbb",
  border: "#e0d8ce", bg: "#f2ede4", white: "#fff",
  good: "#2e7d32", bad: "#c62828",
  pergolas: "#5e8278", salle: "#46655a", terrasse: "#c4a882", emp: "#D4775A",
};

const s = StyleSheet.create({
  page: { padding: 28, fontFamily: "Helvetica", fontSize: 11, color: c.text, backgroundColor: "#fff" },
  header: { marginBottom: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: c.border },
  eyebrow: { fontSize: 8, textTransform: "uppercase", letterSpacing: 1.5, color: c.accent, marginBottom: 3 },
  title: { fontSize: 20, fontWeight: "bold", fontFamily: "Helvetica-Bold" },
  subtitle: { fontSize: 11, color: c.muted, marginTop: 3 },
  hero: { backgroundColor: c.accent, borderRadius: 8, padding: 16, marginBottom: 12, color: c.white },
  heroBig: { fontSize: 28, fontWeight: "bold", fontFamily: "Helvetica-Bold", color: c.white },
  heroSub: { fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 2 },
  heroRow: { flexDirection: "row", marginTop: 12, paddingTop: 10, borderTopWidth: 0.5, borderTopColor: "#e0906f", gap: 18 },
  heroKpiLabel: { fontSize: 7, textTransform: "uppercase", letterSpacing: 0.8, color: "rgba(255,255,255,0.6)", marginBottom: 2 },
  heroKpiVal: { fontSize: 16, fontWeight: "bold", fontFamily: "Helvetica-Bold", color: c.white },
  card: { backgroundColor: "#faf8f5", borderRadius: 6, padding: 12, marginBottom: 10, borderWidth: 0.5, borderColor: c.border },
  sec: { fontSize: 9, textTransform: "uppercase", letterSpacing: 1, color: c.muted, marginBottom: 8, fontFamily: "Helvetica-Bold" },
  row: { flexDirection: "row", gap: 8 },
  tHead: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: c.border, paddingBottom: 4, marginBottom: 4 },
  tH: { fontSize: 6.5, textTransform: "uppercase", letterSpacing: 0.3, color: c.muted, fontFamily: "Helvetica-Bold" },
  tRow: { flexDirection: "row", paddingVertical: 3, borderBottomWidth: 0.3, borderBottomColor: "#eee" },
  tCell: { fontSize: 8 },
  tCellBold: { fontSize: 9, fontFamily: "Helvetica-Bold" },
  tCellAccent: { fontSize: 9, fontFamily: "Helvetica-Bold", color: c.accent },
  tCellMuted: { fontSize: 8, color: c.muted },
  kpi: { backgroundColor: "#faf8f5", borderRadius: 6, padding: 10, borderWidth: 0.5, borderColor: c.border, alignItems: "center" as const },
  kpiVal: { fontSize: 16, fontWeight: "bold", fontFamily: "Helvetica-Bold" },
  kpiLabel: { fontSize: 7, textTransform: "uppercase", letterSpacing: 0.6, color: c.muted, marginTop: 3 },
  barBg: { height: 4, backgroundColor: "#eee", borderRadius: 2, overflow: "hidden" as const },
  barFill: { height: 4, borderRadius: 2 },
  top3Card: { backgroundColor: "#faf8f5", borderRadius: 6, padding: 8, borderWidth: 0.5, borderColor: c.border },
  top3Cat: { fontSize: 8, textTransform: "uppercase", letterSpacing: 0.6, color: c.accent, fontFamily: "Helvetica-Bold", marginBottom: 5 },
  top3Row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2, borderBottomWidth: 0.2, borderBottomColor: "#eee" },
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
  objectifs?: Record<string, { valeur: number; unite?: string }> | null;
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
      <Text style={s.subtitle}>{stats.tickets} tickets · {stats.couverts} couverts · {stats.days?.length ?? 0} jour{(stats.days?.length ?? 0) > 1 ? "s" : ""}</Text>
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
          <Text style={{ fontSize: 8, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>CA TTC</Text>
          <Text style={s.heroBig}>{fmt(W.ca_ttc)}</Text>
          <Text style={s.heroSub}>HT {fmt(W.ca_ht)}</Text>
        </View>
        {prevCA != null && prevCA > 0 && (
          <View style={{ alignItems: "flex-end" as const }}>
            <Text style={{ fontSize: 11, fontFamily: "Helvetica-Bold", color: W.ca_ttc >= prevCA ? "#a5d6a7" : "#ef9a9a" }}>
              {deltaPct(W.ca_ttc, prevCA)}
            </Text>
            <Text style={{ fontSize: 8, color: "rgba(255,255,255,0.5)", marginTop: 1 }}>vs A-1</Text>
          </View>
        )}
      </View>
      <View style={s.heroRow}>
        <View><Text style={s.heroKpiLabel}>Couverts</Text><Text style={s.heroKpiVal}>{fmtNum(W.couverts || W.tickets)}</Text></View>
        <View><Text style={s.heroKpiLabel}>CVT moyen TTC</Text><Text style={s.heroKpiVal}>{cvtTtc}{"\u20AC"}</Text><Text style={{ fontSize: 8, color: "rgba(255,255,255,0.5)" }}>HT {cvtHt}{"\u20AC"}</Text></View>
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

  // Sans comparatif A-1, ces cartes ne font que dupliquer le bandeau héro
  if (prevCA == null || prevCA <= 0) return null;

  return (
    <View style={{ ...s.row, marginBottom: 8 }}>
      <View style={{ ...s.kpi, flex: 1 }}>
        <Text style={{ fontSize: 7, textTransform: "uppercase", letterSpacing: 0.6, color: c.muted, fontFamily: "Helvetica-Bold", marginBottom: 2 }}>Couverts</Text>
        <Text style={{ ...s.kpiVal, fontSize: 13 }}>{fmtNum(W.couverts)}</Text>
        <Text style={{ fontSize: 8, color: c.muted }}>{fmtNum(W.tickets)} tickets</Text>
        {prevCov > 0 && (
          <Text style={{ fontSize: 8, color: W.couverts >= prevCov ? c.good : c.bad, marginTop: 2 }}>
            {deltaAbs(W.couverts, prevCov)} ({deltaPct(W.couverts, prevCov)})
          </Text>
        )}
      </View>
      <View style={{ ...s.kpi, flex: 1 }}>
        <Text style={{ fontSize: 7, textTransform: "uppercase", letterSpacing: 0.6, color: c.muted, fontFamily: "Helvetica-Bold", marginBottom: 2 }}>CVT Moyen TTC</Text>
        <Text style={{ ...s.kpiVal, fontSize: 13 }}>{fmtSp(tmTtc)}{"\u20AC"}</Text>
        <Text style={{ fontSize: 8, color: c.muted }}>HT {fmtSp(tmHt)}{"\u20AC"} · SP {fmtSp(tmSP)}{"\u20AC"}</Text>
        {prevTm > 0 && (
          <Text style={{ fontSize: 8, color: tmTtc >= prevTm ? c.good : c.bad, marginTop: 2 }}>
            {(tmTtc - prevTm) >= 0 ? "+" : ""}{(tmTtc - prevTm).toFixed(1)}{"\u20AC"} ({deltaPct(tmTtc, prevTm)})
          </Text>
        )}
      </View>
      {prevCA != null && prevCA > 0 && (
        <View style={{ ...s.kpi, flex: 1 }}>
          <Text style={{ fontSize: 7, textTransform: "uppercase", letterSpacing: 0.6, color: c.muted, fontFamily: "Helvetica-Bold", marginBottom: 2 }}>VS A-1</Text>
          <Text style={{ ...s.kpiVal, fontSize: 13, color: W.ca_ttc >= prevCA ? c.good : c.bad }}>{deltaAbs(Math.round(W.ca_ttc), Math.round(prevCA))}{"\u20AC"}</Text>
          <Text style={{ fontSize: 8, color: c.muted }}>A-1: {fmt(prevCA)}</Text>
        </View>
      )}
    </View>
  );
}

/* "1 cvt sur X" comme dans l'app */
function covRatioLabel(coverts: number, totalCov: number): string | null {
  if (coverts <= 0 || totalCov <= 0) return null;
  const r = coverts / totalCov;
  if (r >= 0.9) return "9 cvt sur 10";
  if (r >= 0.8) return "4 cvt sur 5";
  if (r >= 0.65) return "2 cvt sur 3";
  if (r >= 0.45) return "1 cvt sur 2";
  if (r >= 0.3) return "1 cvt sur 3";
  if (r >= 0.2) return "1 cvt sur 5";
  return `1 cvt sur ${Math.round(1 / r)}`;
}

/* Upsell performance — detailed cards, avec objectifs et delta (comme l'app) */
function UpsellCard({ stats, objectifs }: { stats: any; objectifs?: Record<string, { valeur: number }> | null }) {
  const W = stats;
  if (!W.ratios) return null;
  const obj = (key: string, fallback: number) => objectifs?.[key]?.valeur ?? fallback;
  const allItems = [
    { label: "Antipasti", data: W.ratios.anti, color: c.accent, target: obj("attache_antipasti", 30) },
    { label: "Pizzas", data: W.ratios.pizze, color: "#c94c2c", target: obj("attache_pizzas", 50) },
    { label: "Plats / Pasta", data: W.ratios.plats, color: "#8a6b3e", target: obj("attache_plats", 40) },
    { label: "Desserts", data: W.ratios.dolci, color: "#b5904a", target: obj("attache_desserts", 80) },
    { label: "Vins", data: W.ratios.vin, color: "#7c5c3a", target: obj("attache_vins", 60) },
    { label: "Alcool", data: W.ratios.alcool, color: "#c15f2e", target: obj("attache_alcool", 30) },
    { label: "Boissons", data: W.ratios.boissons, color: "#5e7a8a", target: 70 },
    { label: "Cafe / Chaud", data: W.ratios.cafe, color: "#6f5c3a", target: 25 },
    { label: "Digestifs", data: W.ratios.digestif, color: c.green, target: 10 },
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
            const diff = pct - u.target;
            const above = pct >= u.target;
            const ratio = covRatioLabel(coverts, W.couverts);
            return (
              <View key={u.label} style={{ flex: 1, backgroundColor: c.white, borderRadius: 5, padding: 5, borderWidth: 0.5, borderColor: c.border }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 2 }}>
                  <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold" }}>{u.label}</Text>
                  {pct > 0 && (
                    <Text style={{ fontSize: 7, fontFamily: "Helvetica-Bold", color: above ? c.good : c.bad }}>
                      {above ? "+" : ""}{diff}%
                    </Text>
                  )}
                </View>
                <Text style={{ fontSize: 12, fontFamily: "Helvetica-Bold", color: u.color }}>{pct}%</Text>
                {ratio && <Text style={{ fontSize: 7, color: "#555" }}>{ratio}</Text>}
                <Text style={{ fontSize: 7, color: c.muted }}>{tables}/{W.tickets} tables · {coverts} cvt</Text>
                <View style={{ ...s.barBg, marginTop: 3, marginBottom: 2, position: "relative" as const }}>
                  <View style={{ ...s.barFill, width: `${Math.min(100, pct)}%`, backgroundColor: u.color }} />
                  <View style={{ position: "absolute" as const, top: 0, left: `${Math.min(99, u.target)}%`, height: 4, width: 1, backgroundColor: "rgba(0,0,0,0.35)" }} />
                </View>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: u.color }}>{fmt(caTtc)}</Text>
                  <Text style={{ fontSize: 6.5, color: c.faint }}>obj. {u.target}%</Text>
                </View>
              </View>
            );
          })}
          {row.length < 3 && Array.from({ length: 3 - row.length }).map((_, i) => <View key={`pad-${i}`} style={{ flex: 1 }} />)}
        </View>
      ))}
    </View>
  );
}

/* Attache midi vs soir */
function AttacheMidiSoirCard({ stats }: { stats: any }) {
  const W = stats;
  const bySvc = W.ratios_by_svc;
  if (!bySvc?.midi || !bySvc?.soir) return null;
  const cats = [
    { key: "anti", label: "Antipasti" },
    { key: "pizze", label: "Pizze" },
    { key: "plats", label: "Plats" },
    { key: "dolci", label: "Desserts" },
    { key: "vin", label: "Vins" },
    { key: "alcool", label: "Alcool" },
  ];
  const hasMidi = Object.values(bySvc.midi).some((v: any) => v.total > 0);
  const hasSoir = Object.values(bySvc.soir).some((v: any) => v.total > 0);
  if (!hasMidi && !hasSoir) return null;
  const pctOf = (svc: string, key: string) => {
    const d = bySvc[svc]?.[key];
    return d && d.total > 0 ? Math.round((d.tables / d.total) * 100) : null;
  };
  const svcRows = [
    { label: "Midi", svc: "midi", show: hasMidi },
    { label: "Soir", svc: "soir", show: hasSoir },
  ].filter(r => r.show);

  return (
    <View style={s.card} wrap={false}>
      <Text style={s.sec}>Attache midi vs soir</Text>
      <View style={s.tHead}>
        <Text style={{ ...s.tH, width: 40 }} />
        {cats.map(cat => <Text key={cat.key} style={{ ...s.tH, flex: 1, textAlign: "center" }}>{cat.label}</Text>)}
      </View>
      {svcRows.map(r => (
        <View key={r.svc} style={{ flexDirection: "row", paddingVertical: 4, borderBottomWidth: 0.3, borderBottomColor: "#eee" }}>
          <Text style={{ width: 40, fontSize: 8, fontFamily: "Helvetica-Bold", color: r.svc === "midi" ? c.pergolas : c.text }}>{r.label}</Text>
          {cats.map(cat => {
            const p = pctOf(r.svc, cat.key);
            const other = pctOf(r.svc === "midi" ? "soir" : "midi", cat.key);
            const better = p != null && other != null && p > other;
            return (
              <Text key={cat.key} style={{ flex: 1, textAlign: "center", fontSize: 9, fontFamily: "Helvetica-Bold", color: p == null ? c.faint : better ? c.good : c.text }}>
                {p == null ? "—" : `${p}%`}
              </Text>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/* Remises accordees + produits offerts */
function RemisesCard({ stats, prev }: { stats: any; prev: any }) {
  const W = stats;
  const remises = W.remises_ttc ?? 0;
  const detail: any[] = W.remises_detail ?? [];
  const offerts: any[] = W.produits_offerts ?? [];
  if (remises <= 0 && offerts.length === 0) return null;
  const brut = W.ca_ttc + remises;
  const pctBrut = brut > 0 ? ((remises / brut) * 100).toFixed(1) : "0";
  const prevRemises = prev?.remises_ttc ?? null;

  return (
    <View style={s.card} wrap={false}>
      <Text style={s.sec}>Remises accordees</Text>
      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontFamily: "Helvetica-Bold", color: c.accent }}>{fmt(remises)} <Text style={{ fontSize: 8, color: c.muted, fontFamily: "Helvetica" }}>soit {pctBrut}% du CA brut</Text></Text>
          <Text style={{ fontSize: 7, color: c.muted, marginTop: 2 }}>CA brut (avant remise) : {fmt(brut)}</Text>
          {prevRemises != null && prevRemises > 0 && (
            <Text style={{ fontSize: 7, color: remises <= prevRemises ? c.good : c.bad, marginTop: 1 }}>
              S-1 : {fmt(prevRemises)} ({deltaPct(remises, prevRemises)})
            </Text>
          )}
          {detail.length > 0 && (
            <View style={{ marginTop: 6 }}>
              <Text style={{ fontSize: 6.5, textTransform: "uppercase", letterSpacing: 0.6, color: c.muted, fontFamily: "Helvetica-Bold", marginBottom: 3 }}>Detail par serveur</Text>
              {detail.slice(0, 6).map((d: any, i: number) => (
                <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 1.5, borderBottomWidth: 0.3, borderBottomColor: "#f0ebe3" }}>
                  <Text style={{ fontSize: 8 }}>{d.operateur}</Text>
                  <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: c.accent }}>{fmt(d.total)} <Text style={{ fontSize: 7, color: c.muted, fontFamily: "Helvetica" }}>({d.count} ticket{d.count > 1 ? "s" : ""})</Text></Text>
                </View>
              ))}
            </View>
          )}
        </View>
        {offerts.length > 0 && (
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 6.5, textTransform: "uppercase", letterSpacing: 0.6, color: c.muted, fontFamily: "Helvetica-Bold", marginBottom: 3 }}>Produits offerts</Text>
            {offerts.slice(0, 8).map((o: any, i: number) => (
              <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 1.5, borderBottomWidth: 0.3, borderBottomColor: "#f0ebe3" }}>
                <Text style={{ fontSize: 8, flex: 1, marginRight: 4 }}>{o.name}</Text>
                <Text style={{ fontSize: 8, color: c.muted }}>x{o.qty}{o.operateurs?.length ? ` · ${o.operateurs.join(", ")}` : ""}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

/* Food vs Boissons */
function FoodBoissonsCard({ stats }: { stats: any }) {
  const W = stats;
  const food = W.food_ttc ?? 0;
  const drink = W.drink_ttc ?? 0;
  if (food <= 0 && drink <= 0) return null;
  const total = food + drink;
  const foodPct = total > 0 ? Math.round((food / total) * 100) : 0;
  return (
    <View style={s.card} wrap={false}>
      <Text style={s.sec}>Food vs Boissons · CA TTC</Text>
      <View style={{ flexDirection: "row", height: 6, borderRadius: 3, overflow: "hidden", marginBottom: 8 }}>
        <View style={{ width: `${foodPct}%`, backgroundColor: "#8a6b3e" }} />
        <View style={{ width: `${100 - foodPct}%`, backgroundColor: c.green }} />
      </View>
      <View style={{ flexDirection: "row" }}>
        <View style={{ flex: 1, alignItems: "center" as const, borderRightWidth: 0.5, borderRightColor: c.border }}>
          <Text style={{ fontSize: 7, textTransform: "uppercase", letterSpacing: 0.6, color: "#8a6b3e", fontFamily: "Helvetica-Bold", marginBottom: 2 }}>Food</Text>
          <Text style={{ fontSize: 14, fontFamily: "Helvetica-Bold" }}>{fmt(food)}</Text>
          <Text style={{ fontSize: 8, color: c.muted }}>{foodPct} % · HT {fmt(W.food_ht ?? 0)}</Text>
        </View>
        <View style={{ flex: 1, alignItems: "center" as const }}>
          <Text style={{ fontSize: 7, textTransform: "uppercase", letterSpacing: 0.6, color: c.green, fontFamily: "Helvetica-Bold", marginBottom: 2 }}>Boissons</Text>
          <Text style={{ fontSize: 14, fontFamily: "Helvetica-Bold" }}>{fmt(drink)}</Text>
          <Text style={{ fontSize: 8, color: c.muted }}>{100 - foodPct} % · HT {fmt(W.drink_ht ?? 0)}</Text>
        </View>
      </View>
    </View>
  );
}

/* Taux de remplissage + Panier moyen decompose (memes regles que l'app) */
function RemplissagePanierCard({ stats }: { stats: any }) {
  const W = stats;
  const services: any[] = W.services ?? [];
  if (!services.length || !W.dates?.length) return null;

  const ZONE_CAPS: Record<string, number> = { Salle: 47, Pergolas: 20, Terrasse: 49, Salon: 20 };
  const TOTAL_CAP = 116;
  const nbDays = W.dates.length;
  const activeZones = Object.keys(W.zones_ttc ?? {}).filter(z => {
    const vals = W.zones_ttc[z];
    return vals && vals.some((v: number) => v > 0) && ZONE_CAPS[z] != null;
  });
  const activeCap = activeZones.length > 0 ? activeZones.reduce((sum, z) => sum + (ZONE_CAPS[z] ?? 0), 0) : TOTAL_CAP;

  const midiSvcs = services.filter((sv: any) => sv.svc === "midi");
  const soirSvcs = services.filter((sv: any) => sv.svc !== "midi");
  const covMidiSP = midiSvcs.reduce((sum: number, sv: any) => sum + sv.sp_cov, 0);
  const covSoirSP = soirSvcs.reduce((sum: number, sv: any) => sum + sv.sp_cov, 0);
  const covMidiDay = nbDays > 0 ? covMidiSP / nbDays : 0;
  const covSoirDay = nbDays > 0 ? covSoirSP / nbDays : 0;
  const rempMidi = activeCap > 0 ? Math.round((covMidiDay / activeCap) * 100) : null;
  const rempSoir = activeCap > 0 ? Math.round((covSoirDay / activeCap) * 100) : null;
  const rempTotal = activeCap > 0 && nbDays > 0 ? Math.round(((covMidiSP + covSoirSP) / nbDays / activeCap) * 100) : null;

  const covMidiTotal = midiSvcs.reduce((sum: number, sv: any) => sum + sv.cov, 0);
  const covSoirTotal = soirSvcs.reduce((sum: number, sv: any) => sum + sv.cov, 0);
  const caMidi = midiSvcs.reduce((sum: number, sv: any) => sum + sv.ttc, 0);
  const caSoir = soirSvcs.reduce((sum: number, sv: any) => sum + sv.ttc, 0);
  const tmMidi = covMidiTotal > 0 ? caMidi / covMidiTotal : 0;
  const tmSoir = covSoirTotal > 0 ? caSoir / covSoirTotal : 0;

  const foodCa = W.food_ttc ?? 0;
  const drinkCa = W.drink_ttc ?? 0;
  const foodRatio = W.ca_ttc > 0 ? foodCa / W.ca_ttc : 0;
  const drinkRatio = W.ca_ttc > 0 ? drinkCa / W.ca_ttc : 0;
  const hasFoodDrink = foodCa > 0 || drinkCa > 0;

  const rempColor = (pct: number) => (pct >= 80 ? c.good : pct >= 50 ? "#D97706" : "#DC2626");

  const rempBar = (label: string, pct: number, covDay: number) => (
    <View style={{ marginBottom: 6 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 2 }}>
        <Text style={{ fontSize: 8, color: c.muted }}>{label}</Text>
        <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: rempColor(pct) }}>{pct}%</Text>
      </View>
      <View style={{ ...s.barBg, height: 5 }}>
        <View style={{ ...s.barFill, height: 5, width: `${Math.min(100, pct)}%`, backgroundColor: rempColor(pct) }} />
      </View>
      <Text style={{ fontSize: 7, color: c.muted, marginTop: 1 }}>{covDay.toFixed(0)} / {activeCap} cvt/j</Text>
    </View>
  );

  return (
    <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }} wrap={false}>
      {/* Remplissage */}
      <View style={{ ...s.card, flex: 1, marginBottom: 0 }}>
        <Text style={s.sec}>Taux de remplissage</Text>
        <Text style={{ fontSize: 7, color: c.muted, marginBottom: 6 }}>Capacite : {activeCap} places ({activeZones.join(" + ") || "toutes zones"})</Text>
        {rempMidi != null && rempBar("Midi", rempMidi, covMidiDay)}
        {rempSoir != null && rempBar("Soir", rempSoir, covSoirDay)}
        {rempTotal != null && (
          <View style={{ borderTopWidth: 0.5, borderTopColor: "#f0ebe3", paddingTop: 4 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold" }}>Total jour</Text>
              <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: rempColor(rempTotal) }}>{rempTotal}%</Text>
            </View>
            <Text style={{ fontSize: 7, color: c.muted, marginTop: 1 }}>{((covMidiSP + covSoirSP) / nbDays).toFixed(0)} / {activeCap} cvt/j</Text>
          </View>
        )}
      </View>
      {/* Panier moyen decompose */}
      <View style={{ ...s.card, flex: 1, marginBottom: 0 }}>
        <Text style={s.sec}>Panier moyen decompose</Text>
        <View style={{ flexDirection: "row", marginBottom: 6 }}>
          <View style={{ flex: 1, alignItems: "center" as const, borderRightWidth: 0.5, borderRightColor: "#f0ebe3" }}>
            <Text style={{ fontSize: 7, fontFamily: "Helvetica-Bold", color: c.pergolas, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 2 }}>Midi</Text>
            <Text style={{ fontSize: 14, fontFamily: "Helvetica-Bold" }}>{tmMidi.toFixed(1).replace(".", ",")}{"€"}</Text>
            <Text style={{ fontSize: 7, color: c.muted }}>{fmtNum(covMidiTotal)} cvt</Text>
          </View>
          <View style={{ flex: 1, alignItems: "center" as const }}>
            <Text style={{ fontSize: 7, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 2 }}>Soir</Text>
            <Text style={{ fontSize: 14, fontFamily: "Helvetica-Bold" }}>{tmSoir.toFixed(1).replace(".", ",")}{"€"}</Text>
            <Text style={{ fontSize: 7, color: c.muted }}>{fmtNum(covSoirTotal)} cvt</Text>
          </View>
        </View>
        {hasFoodDrink && (
          <View style={{ borderTopWidth: 0.5, borderTopColor: "#f0ebe3", paddingTop: 5, flexDirection: "row" }}>
            <View style={{ flex: 1, borderRightWidth: 0.5, borderRightColor: "#f0ebe3", paddingRight: 6 }}>
              <Text style={{ fontSize: 6.5, textTransform: "uppercase", letterSpacing: 0.6, color: "#8a6b3e", fontFamily: "Helvetica-Bold", marginBottom: 2 }}>Food /cvt</Text>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}><Text style={{ fontSize: 8, color: c.muted }}>Midi</Text><Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold" }}>{(tmMidi * foodRatio).toFixed(1).replace(".", ",")}{"€"}</Text></View>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}><Text style={{ fontSize: 8, color: c.muted }}>Soir</Text><Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold" }}>{(tmSoir * foodRatio).toFixed(1).replace(".", ",")}{"€"}</Text></View>
            </View>
            <View style={{ flex: 1, paddingLeft: 6 }}>
              <Text style={{ fontSize: 6.5, textTransform: "uppercase", letterSpacing: 0.6, color: c.green, fontFamily: "Helvetica-Bold", marginBottom: 2 }}>Boissons /cvt</Text>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}><Text style={{ fontSize: 8, color: c.muted }}>Midi</Text><Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold" }}>{(tmMidi * drinkRatio).toFixed(1).replace(".", ",")}{"€"}</Text></View>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}><Text style={{ fontSize: 8, color: c.muted }}>Soir</Text><Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold" }}>{(tmSoir * drinkRatio).toFixed(1).replace(".", ",")}{"€"}</Text></View>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

/* Projection fin de mois (memes regles que l'app) */
function ProjectionCard({ stats, prev }: { stats: any; prev: any }) {
  const W = stats;
  const dates: string[] = W.dates ?? [];
  if (dates.length < 3) return null;
  const fromD = new Date(dates[0] + "T12:00:00");
  const toD = new Date(dates[dates.length - 1] + "T12:00:00");
  if (fromD.getMonth() !== toD.getMonth() || fromD.getFullYear() !== toD.getFullYear()) return null;
  const daysInMonth = new Date(fromD.getFullYear(), fromD.getMonth() + 1, 0).getDate();
  const today = new Date();
  const daysCovered = Math.min(toD.getDate(), today.getDate());
  if (daysCovered >= daysInMonth || daysCovered < 3) return null;
  const ca = W.ca_ttc;
  if (ca <= 0) return null;
  const projected = Math.round((ca / daysCovered) * daysInMonth);
  const prevMonthCA = prev?.ca_ttc ?? null;
  const monthLabel = fromD.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  return (
    <View style={s.card} wrap={false}>
      <Text style={s.sec}>Projection fin {monthLabel}</Text>
      <View style={{ flexDirection: "row", gap: 12, marginBottom: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 7, color: c.muted, fontFamily: "Helvetica-Bold", marginBottom: 2 }}>Cumul au {toD.getDate()}/{fromD.getMonth() + 1}</Text>
          <Text style={{ fontSize: 16, fontFamily: "Helvetica-Bold" }}>{fmt(ca)}</Text>
          <Text style={{ fontSize: 7, color: c.muted, marginTop: 1 }}>{daysCovered}j / {daysInMonth}j</Text>
        </View>
        <View style={{ width: 0.5, backgroundColor: c.border }} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 7, color: c.muted, fontFamily: "Helvetica-Bold", marginBottom: 2 }}>Projection lineaire</Text>
          <Text style={{ fontSize: 16, fontFamily: "Helvetica-Bold", color: c.accent }}>{fmt(projected)}</Text>
          {prevMonthCA != null && prevMonthCA > 0 && (
            <Text style={{ fontSize: 7, fontFamily: "Helvetica-Bold", color: projected >= prevMonthCA ? c.good : c.bad, marginTop: 1 }}>
              {deltaPct(projected, prevMonthCA)} vs A-1
            </Text>
          )}
        </View>
      </View>
      <View style={{ ...s.barBg, height: 5 }}>
        <View style={{ ...s.barFill, height: 5, width: `${Math.round((daysCovered / daysInMonth) * 100)}%`, backgroundColor: c.accent }} />
      </View>
    </View>
  );
}

/* Nouvelle carte · avant / apres (pivot = objectif date_nouvelle_carte) */
function NouvelleCarteCard({ stats, objectifs }: { stats: any; objectifs?: Record<string, { valeur: number }> | null }) {
  const W = stats;
  const pivotRaw = objectifs?.["date_nouvelle_carte"]?.valeur;
  if (!pivotRaw) return null;
  const dates: string[] = W.dates ?? [];
  if (dates.length < 3) return null;
  const pivotStr = String(Math.round(pivotRaw));
  const pivotDate = `${pivotStr.slice(0, 4)}-${pivotStr.slice(4, 6)}-${pivotStr.slice(6, 8)}`;
  if (pivotDate <= dates[0] || pivotDate > dates[dates.length - 1]) return null;
  const beforeDates = dates.filter(d => d < pivotDate);
  const afterDates = dates.filter(d => d >= pivotDate);
  if (!beforeDates.length || !afterDates.length) return null;

  const beforeIdxs = beforeDates.map(d => dates.indexOf(d));
  const afterIdxs = afterDates.map(d => dates.indexOf(d));
  const sumIdxs = (arr: number[], idxs: number[]) => idxs.reduce((sum, i) => sum + (arr[i] ?? 0), 0);
  const bCA = sumIdxs(W.day_ttc ?? [], beforeIdxs);
  const aCA = sumIdxs(W.day_ttc ?? [], afterIdxs);
  const bCov = sumIdxs(W.day_cov ?? [], beforeIdxs);
  const aCov = sumIdxs(W.day_cov ?? [], afterIdxs);
  const bTM = bCov > 0 ? bCA / bCov : 0;
  const aTM = aCov > 0 ? aCA / aCov : 0;
  const bCADay = bCA / beforeDates.length;
  const aCADay = aCA / afterDates.length;
  const bCovDay = bCov / beforeDates.length;
  const aCovDay = aCov / afterDates.length;
  const pivotLabel = new Date(pivotDate + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

  const rows = [
    { label: "CA / jour", b: fmt(Math.round(bCADay)), a: fmt(Math.round(aCADay)), d: `${aCADay >= bCADay ? "+" : ""}${fmt(Math.round(aCADay - bCADay))}`, pos: aCADay >= bCADay },
    { label: "Couverts / jour", b: bCovDay.toFixed(0), a: aCovDay.toFixed(0), d: `${aCovDay >= bCovDay ? "+" : ""}${(aCovDay - bCovDay).toFixed(0)}`, pos: aCovDay >= bCovDay },
    { label: "Ticket moyen", b: `${bTM.toFixed(1)}€`, a: `${aTM.toFixed(1)}€`, d: `${aTM >= bTM ? "+" : ""}${(aTM - bTM).toFixed(1)}€`, pos: aTM >= bTM },
  ];

  return (
    <View style={{ ...s.card, borderLeftWidth: 3, borderLeftColor: c.accent }} wrap={false}>
      <Text style={s.sec}>Nouvelle carte · avant / apres le {pivotLabel}</Text>
      <View style={s.tHead}>
        <Text style={{ ...s.tH, flex: 1 }} />
        <Text style={{ ...s.tH, width: 70, textAlign: "right" }}>Avant</Text>
        <Text style={{ ...s.tH, width: 70, textAlign: "right" }}>Apres</Text>
        <Text style={{ ...s.tH, width: 60, textAlign: "right" }}>Delta</Text>
      </View>
      {rows.map((r, i) => (
        <View key={i} style={{ flexDirection: "row", paddingVertical: 3, borderBottomWidth: 0.3, borderBottomColor: "#eee" }}>
          <Text style={{ flex: 1, fontSize: 8, fontFamily: "Helvetica-Bold" }}>{r.label}</Text>
          <Text style={{ width: 70, textAlign: "right", fontSize: 8, color: c.muted }}>{r.b}</Text>
          <Text style={{ width: 70, textAlign: "right", fontSize: 8, fontFamily: "Helvetica-Bold" }}>{r.a}</Text>
          <Text style={{ width: 60, textAlign: "right", fontSize: 8, fontFamily: "Helvetica-Bold", color: r.pos ? c.good : c.bad }}>{r.d}</Text>
        </View>
      ))}
      <Text style={{ fontSize: 7, color: c.muted, marginTop: 4 }}>
        Avant : {beforeDates.length}j ({beforeDates[0]} au {beforeDates[beforeDates.length - 1]}) · Apres : {afterDates.length}j ({afterDates[0]} au {afterDates[afterDates.length - 1]})
      </Text>
    </View>
  );
}

/* Plats qui dorment · a valoriser */
function DormantCard({ stats }: { stats: any }) {
  const W = stats;
  const bottom: any[] = W.bottom5 ?? [];
  if (!bottom.length) return null;
  return (
    <View style={s.card} wrap={false}>
      <Text style={s.sec}>Plats qui dorment · A valoriser</Text>
      {bottom.map((p: any, i: number) => (
        <View key={i} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 3, borderBottomWidth: 0.3, borderBottomColor: "#f0ebe3" }}>
          <Text style={{ fontSize: 7, color: c.bad, width: 10, fontFamily: "Helvetica-Bold" }}>!</Text>
          <Text style={{ fontSize: 8, flex: 1 }}>{p.n}</Text>
          <Text style={{ fontSize: 8, color: c.muted, width: 30, textAlign: "right" }}>x{p.qty}</Text>
          <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", width: 42, textAlign: "right" }}>{fmt(p.ca_ttc)}</Text>
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
          <Text style={{ ...s.kpiVal, color: c.accent }}>{W.duration.avgDurMin}<Text style={{ fontSize: 8, color: c.muted }}>min</Text></Text>
          <Text style={s.kpiLabel}>Duree moy. / table</Text>
          {prevDur?.avgDurMin > 0 && (
            <Text style={{ fontSize: 7, color: W.duration.avgDurMin <= prevDur.avgDurMin ? c.good : c.bad, marginTop: 1 }}>
              {deltaAbs(W.duration.avgDurMin, prevDur.avgDurMin)}min vs A-1
            </Text>
          )}
        </View>
        {W.duration.avgRotation > 0 && (
          <View style={{ ...s.kpi, flex: 1 }}>
            <Text style={{ ...s.kpiVal, color: c.green }}>{W.duration.avgRotation}x</Text>
            <Text style={s.kpiLabel}>Rotation moy. / table</Text>
            {prevDur?.avgRotation > 0 && (
              <Text style={{ fontSize: 7, color: W.duration.avgRotation >= prevDur.avgRotation ? c.good : c.bad, marginTop: 1 }}>
                {(W.duration.avgRotation - prevDur.avgRotation) >= 0 ? "+" : ""}{(W.duration.avgRotation - prevDur.avgRotation).toFixed(1)}x vs A-1
              </Text>
            )}
          </View>
        )}
        <View style={{ ...s.kpi, flex: 1 }}>
          <Text style={{ ...s.kpiVal, color: "#7c5c3a" }}>{fmtNum(W.duration.totalOrders)}</Text>
          <Text style={s.kpiLabel}>Tables servies</Text>
          {prevDur?.totalOrders > 0 && (
            <Text style={{ fontSize: 7, color: W.duration.totalOrders >= prevDur.totalOrders ? c.good : c.bad, marginTop: 1 }}>
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
                <Text style={{ fontSize: 8, textTransform: "uppercase", letterSpacing: 0.6, color: zoneColors[z.zone] ?? c.muted, fontFamily: "Helvetica-Bold", marginBottom: 3 }}>{z.zone}</Text>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <View>
                    <Text style={{ fontSize: 12, fontFamily: "Helvetica-Bold", color: c.accent }}>{z.avgDur}<Text style={{ fontSize: 7, color: c.muted }}>min</Text></Text>
                    <Text style={{ fontSize: 7, color: c.muted }}>duree moy.</Text>
                  </View>
                  {rot && (
                    <View style={{ alignItems: "flex-end" as const }}>
                      <Text style={{ fontSize: 12, fontFamily: "Helvetica-Bold", color: c.green }}>{rot.avgRotation}x</Text>
                      <Text style={{ fontSize: 7, color: c.muted }}>rotation</Text>
                    </View>
                  )}
                </View>
                <Text style={{ fontSize: 7, color: c.muted, marginTop: 2 }}>{z.tables} tables · {z.couverts} cvts</Text>
                {rot?.maxRotation > 0 && <Text style={{ fontSize: 7, color: zoneColors[z.zone] ?? c.muted }}>max {rot.maxRotation}x rotation</Text>}
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
              <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: sv.svc === "midi" ? c.pergolas : c.text }}>{sv.svc === "midi" ? "MIDI" : "SOIR"} {sv.tables} tables</Text>
              <Text style={{ fontSize: 14, fontFamily: "Helvetica-Bold", marginTop: 2 }}>{sv.avgDur}<Text style={{ fontSize: 8, color: c.muted }}>min</Text></Text>
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
            <Text style={{ fontSize: 8, textTransform: "uppercase", letterSpacing: 0.6, color: c.green, fontFamily: "Helvetica-Bold" }}>Sur place</Text>
            <Text style={{ fontSize: 8, color: c.muted }}>{surPct}% du CA</Text>
          </View>
          <View style={{ ...s.barBg, height: 4, marginBottom: 4 }}>
            <View style={{ ...s.barFill, height: 4, width: `${surPct}%`, backgroundColor: c.green }} />
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View><Text style={{ fontSize: 7, color: c.muted }}>CA TTC</Text><Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold" }}>{fmt(W.place_sur_ttc)}</Text><Text style={{ fontSize: 8, color: c.muted }}>HT {fmt(W.place_sur_ht)}</Text></View>
            <View><Text style={{ fontSize: 7, color: c.muted }}>CVT</Text><Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold" }}>{fmtNum(W.cov_sur)}</Text></View>
            <View><Text style={{ fontSize: 7, color: c.muted }}>TM</Text><Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", color: c.green }}>{fmtSp(surTM)}{"\u20AC"}</Text></View>
          </View>
        </View>
        <View style={{ width: 0.5, backgroundColor: c.border }} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 3 }}>
            <Text style={{ fontSize: 8, textTransform: "uppercase", letterSpacing: 0.6, color: c.accent, fontFamily: "Helvetica-Bold" }}>A emporter</Text>
            <Text style={{ fontSize: 8, color: c.muted }}>{empPct}% du CA</Text>
          </View>
          <View style={{ ...s.barBg, height: 4, marginBottom: 4 }}>
            <View style={{ ...s.barFill, height: 4, width: `${empPct}%`, backgroundColor: c.accent }} />
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View><Text style={{ fontSize: 7, color: c.muted }}>CA TTC</Text><Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold" }}>{fmt(W.place_emp_ttc)}</Text><Text style={{ fontSize: 8, color: c.muted }}>HT {fmt(W.place_emp_ht)}</Text></View>
            <View><Text style={{ fontSize: 7, color: c.muted }}>CVT</Text><Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold" }}>{fmtNum(W.cov_emp)}</Text></View>
            <View><Text style={{ fontSize: 7, color: c.muted }}>TM</Text><Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", color: c.accent }}>{fmtSp(empTM)}{"\u20AC"}</Text></View>
          </View>
        </View>
      </View>
    </View>
  );
}

/* Zone cards with weekly breakdown */
function ZonesDetailCard({ stats }: { stats: any }) {
  const W = stats;
  if (!W.zones_ttc) return null;
  const entries = Object.entries(W.zones_ttc).filter(([, vals]: [string, any]) => vals.some((v: number) => v > 0));
  if (!entries.length) return null;

  const zoneColors: Record<string, string> = { Salle: c.salle, Pergolas: c.pergolas, Terrasse: c.terrasse, Salon: "#8a6b3e", "\u00C0 emporter": c.accent };
  const totalCA = entries.reduce((sum, [, vals]: [string, any]) => sum + vals.reduce((a: number, b: number) => a + b, 0), 0);
  const buckets = W.dates?.length > 7 ? buildWeekBuckets(W.dates) : null;

  return (
    <View style={{ flexDirection: "row", gap: 6, marginBottom: 8 }} wrap={false}>
      {entries.map(([zone, vals]: [string, any]) => {
        const zoneTotal = vals.reduce((a: number, b: number) => a + b, 0);
        const pct = totalCA > 0 ? Math.round((zoneTotal / totalCA) * 100) : 0;
        const weekTotals = buckets ? sumByBuckets(vals, buckets) : null;
        const maxWeek = weekTotals ? Math.max(...weekTotals, 1) : 1;

        return (
          <View key={zone} style={{ flex: 1, backgroundColor: "#faf8f5", borderRadius: 5, padding: 6, borderWidth: 0.5, borderColor: c.border }}>
            <Text style={{ fontSize: 7.5, textTransform: "uppercase", letterSpacing: 0.6, color: zoneColors[zone] ?? c.muted, fontFamily: "Helvetica-Bold", marginBottom: 2 }}>{zone}</Text>
            <Text style={{ fontSize: 12, fontFamily: "Helvetica-Bold", color: zoneColors[zone] ?? c.text }}>{fmt(zoneTotal)}</Text>
            <Text style={{ fontSize: 7, color: c.muted }}>{pct}% du CA</Text>
            {weekTotals && buckets && (
              <View style={{ marginTop: 4 }}>
                {weekTotals.map((wv, wi) => (
                  <View key={wi} style={{ flexDirection: "row", alignItems: "center", marginBottom: 2 }}>
                    <Text style={{ width: 24, fontSize: 6, color: c.muted }}>{buckets[wi].label}</Text>
                    <View style={{ flex: 1, ...s.barBg, height: 3 }}>
                      <View style={{ ...s.barFill, height: 3, width: `${(wv / maxWeek) * 100}%`, backgroundColor: zoneColors[zone] ?? c.accent }} />
                    </View>
                    <Text style={{ width: 30, textAlign: "right", fontSize: 6.5, fontFamily: "Helvetica-Bold" }}>{fmt(wv)}</Text>
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
              <Text style={{ width: 30, fontSize: 8, fontFamily: "Helvetica-Bold" }}>{labels[i] ?? ""}</Text>
              <View style={{ flex: 1, ...s.barBg, height: 4 }}>
                <View style={{ ...s.barFill, height: 4, width: `${(cur / maxVal) * 100}%`, backgroundColor: c.accent }} />
              </View>
              <Text style={{ width: 42, textAlign: "right", fontSize: 8, fontFamily: "Helvetica-Bold", color: c.accent }}>{fmt(cur)}</Text>
              <Text style={{ width: 38, textAlign: "right", fontSize: 8, fontFamily: "Helvetica-Bold", color: diff >= 0 ? c.good : c.bad }}>
                {prv > 0 ? `${diff >= 0 ? "+" : ""}${fmt(Math.abs(diff))}` : "\u2014"}
              </Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={{ width: 30, fontSize: 7, color: c.muted }}>A-1</Text>
              <View style={{ flex: 1, ...s.barBg, height: 3 }}>
                <View style={{ ...s.barFill, height: 3, width: `${(prv / maxVal) * 100}%`, backgroundColor: c.green, opacity: 0.6 }} />
              </View>
              <Text style={{ width: 42, textAlign: "right", fontSize: 7, color: c.muted }}>{prv > 0 ? fmt(prv) : "\u2014"}</Text>
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

  const totalRows = groups.reduce((n, g) => n + g.services.length, 0);

  return (
    // wrap={false} sur les petits tableaux : évite un en-tête orphelin en bas de page
    <View style={s.card} wrap={totalRows > 12} minPresenceAhead={80}>
      <Text style={s.sec}>Par service · TTC · couverts</Text>
      <View style={s.tHead}>
        <Text style={{ ...s.tH, width: 36 }}>{useWeeks ? "Sem." : "Jour"}</Text>
        <Text style={{ ...s.tH, width: 24 }}>Svc</Text>
        <Text style={{ ...s.tH, flex: 1, textAlign: "right", color: c.salle }}>Salle</Text>
        <Text style={{ ...s.tH, flex: 1, textAlign: "right", color: c.pergolas }}>Pergolas</Text>
        <Text style={{ ...s.tH, flex: 1, textAlign: "right", color: c.terrasse }}>Terrasse</Text>
        <Text style={{ ...s.tH, flex: 1, textAlign: "right", color: c.emp }}>Emp.</Text>
        <Text style={{ ...s.tH, flex: 1, textAlign: "right", color: c.accent }}>Total</Text>
        <Text style={{ ...s.tH, width: 28, textAlign: "right" }}>Cvts</Text>
        <Text style={{ ...s.tH, width: 24, textAlign: "right", color: c.green }}>SP</Text>
        <Text style={{ ...s.tH, width: 30, textAlign: "right", color: c.green }}>TM SP</Text>
        <Text style={{ ...s.tH, width: 24, textAlign: "right", color: c.emp }}>Emp</Text>
        <Text style={{ ...s.tH, width: 30, textAlign: "right", color: c.emp }}>TM E</Text>
      </View>
      {groups.map((group, di) =>
        group.services.map((sv: any, si: number) => {
          const caVal = sv.ttc;
          const z = sv.z_ttc;
          const tmSp = sv.tm_sp_ttc;
          return (
            <View key={`${di}-${si}`} style={{ ...s.tRow, backgroundColor: di % 2 === 0 ? c.white : "#faf7f2" }} wrap={false}>
              {si === 0 && <Text style={{ ...s.tCellBold, width: 36 }}>{group.groupLabel}</Text>}
              {si > 0 && <Text style={{ width: 36 }} />}
              <Text style={{ ...s.tCellMuted, width: 24, fontSize: 7 }}>{sv.svc === "midi" ? "Midi" : "Soir"}</Text>
              <Text style={{ ...s.tCellBold, flex: 1, textAlign: "right", color: z?.Salle ? c.salle : c.faint }}>{z?.Salle ? fmt(z.Salle) : "\u2014"}</Text>
              <Text style={{ ...s.tCellBold, flex: 1, textAlign: "right", color: z?.Pergolas ? c.pergolas : c.faint }}>{z?.Pergolas ? fmt(z.Pergolas) : "\u2014"}</Text>
              <Text style={{ ...s.tCellBold, flex: 1, textAlign: "right", color: z?.Terrasse ? c.terrasse : c.faint }}>{z?.Terrasse ? fmt(z.Terrasse) : "\u2014"}</Text>
              <Text style={{ ...s.tCellBold, flex: 1, textAlign: "right", color: z?.emp ? c.emp : c.faint }}>{z?.emp ? fmt(z.emp) : "\u2014"}</Text>
              <Text style={{ ...s.tCellAccent, flex: 1, textAlign: "right" }}>{fmt(caVal)}</Text>
              <Text style={{ ...s.tCell, width: 28, textAlign: "right" }}>{sv.cov}</Text>
              <Text style={{ ...s.tCell, width: 24, textAlign: "right", color: c.green }}>{sv.sp_cov || "\u2014"}</Text>
              <Text style={{ width: 30, textAlign: "right", fontSize: 8, fontFamily: "Helvetica-Bold", color: c.green }}>{tmSp > 0 ? `${tmSp.toFixed(0)}\u20AC` : "\u2014"}</Text>
              <Text style={{ ...s.tCell, width: 24, textAlign: "right", color: c.emp }}>{sv.cov - (sv.sp_cov ?? 0) > 0 ? sv.cov - sv.sp_cov : "\u2014"}</Text>
              <Text style={{ width: 30, textAlign: "right", fontSize: 8, fontFamily: "Helvetica-Bold", color: c.emp }}>{(() => { const ec = sv.cov - (sv.sp_cov ?? 0); if (ec <= 0) return "\u2014"; return sv.emp_ttc ? `${Math.round(sv.emp_ttc / ec)}\u20AC` : "\u2014"; })()}</Text>
            </View>
          );
        })
      )}
      {/* Lignes TOTAL Midi / Soir, comme dans l'app */}
      {(["midi", "soir"] as const).map((svcKey) => {
        const arr = services.filter((sv: any) => (svcKey === "midi" ? sv.svc === "midi" : sv.svc !== "midi"));
        if (!arr.length) return null;
        const sum = (fn: (sv: any) => number) => arr.reduce((acc: number, sv: any) => acc + fn(sv), 0);
        const ttc = sum(sv => sv.ttc);
        const cov = sum(sv => sv.cov);
        const spCov = sum(sv => sv.sp_cov ?? 0);
        const spTtc = sum(sv => sv.sp_ttc ?? 0);
        const empTtc = sum(sv => sv.emp_ttc ?? 0);
        const empCov = cov - spCov;
        const zTot = (zn: string) => sum(sv => sv.z_ttc?.[zn] ?? 0);
        return (
          <View key={svcKey} style={{ ...s.tRow, backgroundColor: "#f2ede4", borderTopWidth: svcKey === "midi" ? 1 : 0, borderTopColor: c.border }} wrap={false}>
            {svcKey === "midi" ? <Text style={{ ...s.tCellBold, width: 36 }}>TOTAL</Text> : <Text style={{ width: 36 }} />}
            <Text style={{ ...s.tCellBold, width: 24, fontSize: 7 }}>{svcKey === "midi" ? "Midi" : "Soir"}</Text>
            <Text style={{ ...s.tCellBold, flex: 1, textAlign: "right", color: c.salle }}>{zTot("Salle") ? fmt(zTot("Salle")) : "\u2014"}</Text>
            <Text style={{ ...s.tCellBold, flex: 1, textAlign: "right", color: c.pergolas }}>{zTot("Pergolas") ? fmt(zTot("Pergolas")) : "\u2014"}</Text>
            <Text style={{ ...s.tCellBold, flex: 1, textAlign: "right", color: c.terrasse }}>{zTot("Terrasse") ? fmt(zTot("Terrasse")) : "\u2014"}</Text>
            <Text style={{ ...s.tCellBold, flex: 1, textAlign: "right", color: c.emp }}>{zTot("emp") ? fmt(zTot("emp")) : "\u2014"}</Text>
            <Text style={{ ...s.tCellAccent, flex: 1, textAlign: "right" }}>{fmt(ttc)}</Text>
            <Text style={{ ...s.tCellBold, width: 28, textAlign: "right" }}>{fmtNum(cov)}</Text>
            <Text style={{ ...s.tCellBold, width: 24, textAlign: "right", color: c.green }}>{spCov ? fmtNum(spCov) : "\u2014"}</Text>
            <Text style={{ width: 30, textAlign: "right", fontSize: 8, fontFamily: "Helvetica-Bold", color: c.green }}>{spCov > 0 ? `${Math.round(spTtc / spCov)}\u20AC` : "\u2014"}</Text>
            <Text style={{ ...s.tCellBold, width: 24, textAlign: "right", color: c.emp }}>{empCov > 0 ? fmtNum(empCov) : "\u2014"}</Text>
            <Text style={{ width: 30, textAlign: "right", fontSize: 8, fontFamily: "Helvetica-Bold", color: c.emp }}>{empCov > 0 && empTtc ? `${Math.round(empTtc / empCov)}\u20AC` : "\u2014"}</Text>
          </View>
        );
      })}
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
            <Text style={{ fontSize: 8, textTransform: "uppercase", letterSpacing: 0.6, color: zoneColors[zone] ?? c.muted, fontFamily: "Helvetica-Bold", marginBottom: 2 }}>{zone}</Text>
            <Text style={{ ...s.kpiVal, color: c.text }}>{fmt(totTtc)}</Text>
            <Text style={{ fontSize: 8, color: c.muted }}>HT {fmt(totHt)}</Text>
          </View>
        );
      })}
    </View>
  );
}

function _MargeCard({ stats }: { stats: any }) {
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
                <Text style={{ width: 42, textAlign: "right", fontSize: 11, fontFamily: "Helvetica-Bold", color: c.green }}>{fmt(m)}</Text>
                <Text style={{ width: 30, textAlign: "right", fontSize: 8, fontFamily: "Helvetica-Bold", color: tmColor }}>{(tm * 100).toFixed(1)}%</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function HourlyCard({ stats }: { stats: any }) {
  const h: number[] = stats.hourly_ttc ?? stats.hourly_totals ?? [];
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
      <Text style={s.sec}>Repartition horaire du CA TTC</Text>
      <View style={{ flexDirection: "row", alignItems: "flex-end" as const, gap: 2, height: 60 }}>
        {hours.map((hour) => {
          const val = h[hour] ?? 0;
          const pct = maxH > 0 ? (val / maxH) * 100 : 0;
          return (
            <View key={hour} style={{ flex: 1, alignItems: "center" as const, justifyContent: "flex-end" as const, height: "100%" }}>
              <View style={{ width: "100%", height: `${Math.max(pct, 2)}%`, backgroundColor: val > 0 ? c.accent : "#ddd6c8", borderRadius: 1 }} />
              <Text style={{ fontSize: 6, color: c.muted, marginTop: 1 }}>{hour}h</Text>
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
            <Text style={{ width: 60, fontSize: 7 }}>{label}</Text>
            <View style={{ flex: 1, ...s.barBg }}>
              <View style={{ ...s.barFill, width: `${(v / maxV) * 100}%`, backgroundColor: colors[i % colors.length] }} />
            </View>
            <Text style={{ width: 42, textAlign: "right", fontSize: 9, fontFamily: "Helvetica-Bold" }}>{fmt(v)}</Text>
            <Text style={{ width: 30, textAlign: "right", fontSize: 8, color: c.muted }}>{fmt(valsHt[i] ?? 0)}</Text>
            <Text style={{ width: 22, textAlign: "right", fontSize: 8, color: c.muted }}>{pct}%</Text>
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
            <Text style={{ width: 12, fontSize: 7, color: c.faint, textAlign: "right" }}>{i + 1}</Text>
            <Text style={{ width: 120, fontSize: 8, marginLeft: 5, marginRight: 4 }}>{name}</Text>
            <View style={{ flex: 1, ...s.barBg }}>
              <View style={{ ...s.barFill, width: `${(v / maxV) * 100}%`, backgroundColor: c.accent }} />
            </View>
            <Text style={{ width: 42, textAlign: "right", fontSize: 9, fontFamily: "Helvetica-Bold" }}>{fmt(v)}</Text>
            <Text style={{ width: 30, textAlign: "right", fontSize: 8, color: c.muted }}>{fmt(valsHt[i] ?? 0)}</Text>
            <Text style={{ width: 22, textAlign: "right", fontSize: 8, color: c.muted }}>{qty}x</Text>
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
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" as const, marginBottom: 5 }}>
              <Text style={{ ...s.top3Cat, marginBottom: 0 }}>{cat.cat}</Text>
              {cat.total_qty > 0 && <Text style={{ fontSize: 6, color: c.muted }}>{fmtNum(cat.total_qty)}x · {fmt(cat.total_ca_ttc ?? 0)}</Text>}
            </View>
            {cat.rows.map((r: any, ri: number) => (
              <View key={ri} style={s.top3Row}>
                <Text style={{ fontSize: 6, color: c.faint, width: 8 }}>{ri + 1}</Text>
                <Text style={{ fontSize: 7, flex: 1, marginRight: 3 }}>{r.n}</Text>
                {r.qty > 0 && <Text style={{ fontSize: 6, color: c.muted, marginRight: 3 }}>{r.qty}x</Text>}
                <Text style={{ fontSize: 7.5, fontFamily: "Helvetica-Bold", color: c.accent }}>{r.ca_ttc}</Text>
              </View>
            ))}
            {cat.flop && (
              <View style={{ ...s.top3Row, borderTopWidth: 0.3, borderTopColor: "#f0ebe3", marginTop: 2, paddingTop: 2 }}>
                <Text style={{ fontSize: 6, color: c.bad, width: 8, fontFamily: "Helvetica-Bold" }}>!</Text>
                <Text style={{ fontSize: 7, color: c.bad, flex: 1, marginRight: 3 }}>{cat.flop.n}</Text>
                {cat.flop.qty > 0 && <Text style={{ fontSize: 6, color: c.bad, marginRight: 3 }}>{cat.flop.qty}x</Text>}
                <Text style={{ fontSize: 7.5, color: c.bad, fontFamily: "Helvetica-Bold" }}>{cat.flop.ca_ttc}</Text>
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
            <Text style={{ width: 55, fontSize: 8, fontFamily: "Helvetica-Bold" }}>{name}</Text>
            <View style={{ flex: 1, ...s.barBg }}>
              <View style={{ ...s.barFill, width: `${(v / maxV) * 100}%`, backgroundColor: c.green }} />
            </View>
            <Text style={{ width: 42, textAlign: "right", fontSize: 9, fontFamily: "Helvetica-Bold" }}>{fmt(v)}</Text>
            <Text style={{ width: 34, textAlign: "right", fontSize: 7, color: c.muted }}>{fmt(valsHt[i] ?? 0)}</Text>
            <Text style={{ width: 26, textAlign: "right", fontSize: 7, color: c.muted }}>{pctCA}%</Text>
            <Text style={{ width: 78, textAlign: "right", fontSize: 7, color: c.muted }}>{tkt}t · {cov}c · {cvtM}{"\u20AC"}</Text>
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
          <Text style={{ flex: 1, fontSize: 8, color: c.muted }}>{p.l}</Text>
          <Text style={{ width: 45, textAlign: "right", fontSize: 9, fontFamily: "Helvetica-Bold" }}>{fmt(p.v)}</Text>
          <Text style={{ width: 25, textAlign: "right", fontSize: 8, color: c.muted }}>{p.pct}%</Text>
        </View>
      ))}
    </View>
  );
}

function BriefingCard({ briefing }: { briefing: string[] }) {
  if (!briefing || !briefing.length) return null;
  return (
    <View style={{ backgroundColor: c.white, borderRadius: 6, padding: 10, borderWidth: 0.5, borderColor: c.border, borderLeftWidth: 3, borderLeftColor: c.accent }} wrap={false}>
      <Text style={{ fontSize: 11, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 1, color: c.accent, marginBottom: 8 }}>
        Points briefing
      </Text>
      {briefing.map((point: string, i: number) => (
        <View key={i} style={{ flexDirection: "row", gap: 8, paddingVertical: 4, borderBottomWidth: i < briefing.length - 1 ? 0.3 : 0, borderBottomColor: "#f0ebe3" }}>
          <Text style={{ fontSize: 11, fontFamily: "Helvetica-Bold", color: c.accent, width: 14 }}>
            {String(i + 1).padStart(2, "0")}
          </Text>
          <Text style={{ fontSize: 11, flex: 1, lineHeight: 1.5, color: "#333" }}>
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

export function VentesPDF({ stats, prev, mode, viewTab, rangeLabel, etabName, briefing, exportType = "ventes", objectifs }: Props) {
  void viewTab;
  void mode; // PDF affiche toujours TTC + HT
  const multiDay = (stats.dates?.length ?? 0) > 1;

  return (
    <Document>
      <Page size="A4" style={s.page} wrap>
        {/* Même ordre de sections que la page /ventes de l'app */}
        <HeaderBlock etabName={etabName} rangeLabel={rangeLabel} stats={stats} exportType={exportType} />
        <HeroCard stats={stats} prev={prev} />
        <KpiCardsRow stats={stats} prev={prev} />

        <RemisesCard stats={stats} prev={prev} />
        <HourlyCard stats={stats} />
        <UpsellCard stats={stats} objectifs={objectifs} />
        <AttacheMidiSoirCard stats={stats} />
        <DurationCard stats={stats} prev={prev} />
        <SurPlaceEmporterCard stats={stats} />
        <FoodBoissonsCard stats={stats} />
        <RemplissagePanierCard stats={stats} />

        {/* Tuiles par salle : détail hebdo sur les longues périodes */}
        {multiDay && stats.dates.length > 7 ? <ZonesDetailCard stats={stats} /> : <ZonesRow stats={stats} />}

        <ComparatifCard stats={stats} prev={prev} />
        <ProjectionCard stats={stats} prev={prev} />
        <NouvelleCarteCard stats={stats} objectifs={objectifs} />
        <ServicesTable stats={stats} />
        <Top10Card stats={stats} />
        <Top3CatsCard stats={stats} />
        <DormantCard stats={stats} />
        <MixCategoriesCard stats={stats} />
        <ServeursCard stats={stats} />
        <PaiementsCard stats={stats} />

        {briefing && briefing.length > 0 && <BriefingCard briefing={briefing} />}
      </Page>
    </Document>
  );
}
