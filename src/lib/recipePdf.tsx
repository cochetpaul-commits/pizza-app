import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

export type FlourMixItem = { name: string; percent: number };

export type RecipePdfTotals = {
  flour_total_g: number;
  water_g: number;
  salt_g: number;
  honey_g: number;
  oil_g: number;
  yeast_g: number;
};

export type RecipePdfPhase = {
  name: string;
  flour_g: number;
  water_g: number;
  salt_g: number;
  honey_g: number;
  oil_g: number;
  yeast_g: number;
};

export type RecipePdfData = {
  name: string;
  type: string | null;

  hydration_total: number | null;
  salt_percent: number | null;
  honey_percent: number | null;
  oil_percent: number | null;

  yeast_percent: number | null;
  biga_yeast_percent: number | null;

  flour_mix: FlourMixItem[];

  nbPatons: number;
  poidsPaton: number;

  totals: RecipePdfTotals;
  phases: RecipePdfPhase[];
  warnings: string[];

  // ✅ nouveau champ (optionnel pour ne pas casser si l’API ne l’envoie pas encore)
  procedure?: string | null;

  exportedAt: string;
};

const TERRACOTTA = "#B45A3C";
const TEXT = "#111111";
const MUTED = "#555555";
const BORDER = "#E6E6E6";
const SOFT = "#FAFAFA";

const styles = StyleSheet.create({
  page: { padding: 22, fontSize: 10, fontFamily: "Helvetica", color: TEXT },

  header: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },

  brand: {
    textAlign: "center",
    fontSize: 14,
    fontWeight: "bold",
    color: TERRACOTTA,
    letterSpacing: 0.2,
  },

  title: { marginTop: 6, fontSize: 18, fontWeight: "bold", textAlign: "center" },
  subtitle: { marginTop: 4, textAlign: "center", color: MUTED, fontSize: 9 },

  pillRow: { marginTop: 8, flexDirection: "row", justifyContent: "center", gap: 6 },
  pill: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 8,
    minWidth: 90,
  },
  pillLabel: { color: MUTED, fontSize: 9, textAlign: "center" },
  pillValue: { marginTop: 1, fontSize: 10, fontWeight: "bold", textAlign: "center" },

  section: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    padding: 10,
    marginTop: 8,
  },

  sectionTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { fontSize: 11, fontWeight: "bold", color: TERRACOTTA },

  grid: { marginTop: 8, flexDirection: "row", gap: 10 },
  col: { flexGrow: 1 },

  line: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  k: { color: MUTED },
  v: { fontWeight: "bold" },

  table: { marginTop: 8, borderWidth: 1, borderColor: BORDER, borderRadius: 10, overflow: "hidden" },
  trHead: { flexDirection: "row", backgroundColor: SOFT, borderBottomWidth: 1, borderBottomColor: BORDER },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: BORDER },
  td1: { width: "70%", padding: 8 },
  td2: { width: "30%", padding: 8, textAlign: "right" },
  th: { fontSize: 9, color: MUTED, fontWeight: "bold" },

  // phases
  phaseGrid: { marginTop: 8, flexDirection: "row", gap: 10 },
  phaseCard: { flexGrow: 1, borderWidth: 1, borderColor: BORDER, borderRadius: 10, padding: 8 },
  phaseCardFull: { borderWidth: 1, borderColor: BORDER, borderRadius: 10, padding: 8, marginTop: 8 },
  phaseTitle: { fontSize: 10, fontWeight: "bold", color: TEXT, marginBottom: 4 },

  phaseRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  phaseKey: { color: MUTED, fontSize: 9 },
  phaseVal: { fontSize: 9, fontWeight: "bold" },

  // ✅ procédure
  procedureBox: { marginTop: 8, borderWidth: 1, borderColor: BORDER, borderRadius: 10, padding: 10, backgroundColor: SOFT },
  procedureTitle: { fontSize: 10, fontWeight: "bold", color: TEXT, marginBottom: 6 },
  procedureText: { fontSize: 9, color: TEXT, lineHeight: 1.35 },

  footer: {
    position: "absolute",
    left: 22,
    right: 22,
    bottom: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    color: MUTED,
    fontSize: 8,
  },
});

function fmtPct(n: number | null) {
  if (n === null || !Number.isFinite(n)) return "—";
  return `${n}%`;
}

function fmtG(n: number | null | undefined) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${Math.round(n)} g`;
}
function isNonZeroG(n: number | null | undefined) {
  if (n === null || n === undefined || !Number.isFinite(n)) return false;
  return Math.round(n) !== 0;
}

function Line({ left, right, last }: { left: string; right: string; last?: boolean }) {
  return (
    <View style={[styles.line, ...(last ? [{ borderBottomWidth: 0 }] : [])]}>
      <Text style={styles.k}>{left}</Text>
      <Text style={styles.v}>{right}</Text>
    </View>
  );
}

function PhaseRows({ p }: { p: RecipePdfPhase }) {
  const rows: Array<{ k: string; v: string }> = [
    { k: "Farine", v: fmtG(p.flour_g) },
    { k: "Eau", v: fmtG(p.water_g) },
  ];

  // On n’affiche pas les 0
  if (isNonZeroG(p.salt_g)) rows.push({ k: "Sel", v: fmtG(p.salt_g) });
  if (isNonZeroG(p.honey_g)) rows.push({ k: "Miel", v: fmtG(p.honey_g) });
  if (isNonZeroG(p.oil_g)) rows.push({ k: "Huile", v: fmtG(p.oil_g) });
  if (isNonZeroG(p.yeast_g)) rows.push({ k: "Levure", v: fmtG(p.yeast_g) });

  return (
    <>
      {rows.map((r, idx) => (
        <View key={`${r.k}-${idx}`} style={styles.phaseRow}>
          <Text style={styles.phaseKey}>{r.k}</Text>
          <Text style={styles.phaseVal}>{r.v}</Text>
        </View>
      ))}
    </>
  );
}

function normalizeProcedure(raw: string) {
  // nettoie un peu sans “casser” le contenu
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function RecipePdfDocument(props: { data: RecipePdfData }) {
  const d = props.data;
  const flourMix = Array.isArray(d.flour_mix) ? d.flour_mix : [];
  const type = (d.type ?? "").toLowerCase();
  const isBiga = type === "biga";

  const yeastLabel = isBiga ? "Levure (phase 2)" : "Levure";
  const yeastValue = isBiga ? d.biga_yeast_percent : d.yeast_percent;

  const totalDough = Number.isFinite(d.nbPatons) && Number.isFinite(d.poidsPaton) ? d.nbPatons * d.poidsPaton : null;

  type Totals = Partial<{
  flour_total_g: number;
  water_g: number;
  salt_g: number;
  honey_g: number;
  oil_g: number;
  yeast_g: number;
}>;

const totals = (d.totals ?? {}) as Totals;

  // phases
  const phases = Array.isArray(d.phases) ? d.phases : [];
  const p1 = isBiga ? phases.find((p) => /phase 1/i.test(p.name)) ?? null : null;
  const p2 = isBiga ? phases.find((p) => /phase 2/i.test(p.name)) ?? null : null;
  const pSingle = !isBiga ? phases[0] ?? null : null;

  // ===== Quantités (lignes dynamiques, pas de 0, huile au bon endroit) =====
  const leftRows: Array<{ k: string; v: string }> = [
    { k: "Poids total pâte", v: totalDough ? fmtG(totalDough) : "—" },
    { k: "Farine totale", v: fmtG(totals.flour_total_g ?? null) },
    { k: "Eau", v: fmtG(totals.water_g ?? null) },
  ];

  const rightRows: Array<{ k: string; v: string }> = [{ k: "Sel", v: fmtG(totals.salt_g ?? null) }];
  if (isNonZeroG(totals.honey_g)) rightRows.push({ k: "Miel", v: fmtG(totals.honey_g) });
  if (isNonZeroG(totals.oil_g)) rightRows.push({ k: "Huile", v: fmtG(totals.oil_g) });
  if (isNonZeroG(totals.yeast_g)) rightRows.push({ k: isBiga ? "Levure (total)" : "Levure", v: fmtG(totals.yeast_g) });

  // ✅ procédure
  const procedure = normalizeProcedure(String(d.procedure ?? ""));
  const hasProcedure = procedure.length > 0;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* HEADER */}
        {/* HEADER PREMIUM */}
<View style={styles.header}>
  <View style={{ flexDirection: "row", gap: 14 }}>

    {/* LEFT */}
    <View style={{ flex: 1 }}>
      <Text style={styles.brand}>BELLO MIO — PICCOLA MIA</Text>

      <Text style={styles.title}>
        {d.name || "Empâtement"}
      </Text>

      <Text style={styles.subtitle}>
        Fiche technique d’empâtement — paramètres, quantités et phases
      </Text>

      <View style={{ marginTop: 8, gap: 4 }}>
        <Text style={{ fontSize: 9 }}>
          <Text style={{ color: "#555" }}>Type :</Text>{" "}
          <Text style={{ fontWeight: "bold" }}>{d.type ?? "—"}</Text>
        </Text>

        <Text style={{ fontSize: 9 }}>
          <Text style={{ color: "#555" }}>Pâtons :</Text>{" "}
          <Text style={{ fontWeight: "bold" }}>{d.nbPatons}</Text>{" "}
          ×{" "}
          <Text style={{ fontWeight: "bold" }}>{d.poidsPaton} g</Text>
        </Text>

        <Text style={{ fontSize: 9 }}>
          <Text style={{ color: "#555" }}>Export :</Text>{" "}
          <Text style={{ fontWeight: "bold" }}>
            {new Date(d.exportedAt).toLocaleString("fr-FR")}
          </Text>
        </Text>
      </View>
    </View>

    {/* RIGHT */}
    <View
      style={{
        width: 120,
        borderWidth: 1,
        borderColor: "#E6E6E6",
        borderRadius: 10,
        padding: 8,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#FAFAFA",
      }}
    >
      <Text style={{ fontSize: 9, color: "#555", marginBottom: 4 }}>
        Paramètres clés
      </Text>

      <Text style={{ fontSize: 9 }}>
        Hydratation :{" "}
        <Text style={{ fontWeight: "bold" }}>
          {d.hydration_total ?? "—"}%
        </Text>
      </Text>

      <Text style={{ fontSize: 9 }}>
        Sel :{" "}
        <Text style={{ fontWeight: "bold" }}>
          {d.salt_percent ?? "—"}%
        </Text>
      </Text>

      {isBiga ? (
        <Text style={{ fontSize: 9 }}>
          Levure biga :{" "}
          <Text style={{ fontWeight: "bold" }}>
            {d.biga_yeast_percent ?? "—"}%
          </Text>
        </Text>
      ) : (
        <Text style={{ fontSize: 9 }}>
          Levure :{" "}
          <Text style={{ fontWeight: "bold" }}>
            {d.yeast_percent ?? "—"}%
          </Text>
        </Text>
      )}
    </View>

  </View>
</View>

        {/* PARAMÈTRES */}
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>Paramètres</Text>
            <Text style={{ color: MUTED, fontSize: 9 }}>Ratios en % (boulanger)</Text>
          </View>

          <View style={styles.grid}>
            <View style={styles.col}>
              <Line left="Hydratation totale" right={fmtPct(d.hydration_total)} />
              <Line left="Sel" right={fmtPct(d.salt_percent)} />
              <Line left="Miel" right={fmtPct(d.honey_percent)} last />
            </View>

            <View style={styles.col}>
              <Line left="Huile" right={fmtPct(d.oil_percent)} />
              <Line left={yeastLabel} right={fmtPct(yeastValue)} />
              <Line left="Notes" right="—" last />
            </View>
          </View>
        </View>

        {/* QUANTITÉS */}
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>Quantités</Text>
            <Text style={{ color: MUTED, fontSize: 9 }}>en grammes (estimations)</Text>
          </View>

          <View style={styles.grid}>
            <View style={styles.col}>
              {leftRows.map((r, idx) => (
                <Line key={`L-${r.k}`} left={r.k} right={r.v} last={idx === leftRows.length - 1} />
              ))}
            </View>

            <View style={styles.col}>
              {rightRows.map((r, idx) => (
                <Line key={`R-${r.k}`} left={r.k} right={r.v} last={idx === rightRows.length - 1} />
              ))}
            </View>
          </View>
        </View>

        {/* PHASES */}
        {isBiga && (p1 || p2) ? (
          <View style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitle}>Phases</Text>
              <Text style={{ color: MUTED, fontSize: 9 }}>répartition (g)</Text>
            </View>

            <View style={styles.phaseGrid}>
              <View style={styles.phaseCard}>
                <Text style={styles.phaseTitle}>{p1?.name ?? "Phase 1"}</Text>
                {p1 ? <PhaseRows p={p1} /> : null}
              </View>

              <View style={styles.phaseCard}>
                <Text style={styles.phaseTitle}>{p2?.name ?? "Phase 2"}</Text>
                {p2 ? <PhaseRows p={p2} /> : null}
              </View>
            </View>
          </View>
        ) : null}

        {!isBiga && pSingle ? (
          <View style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitle}>Phases</Text>
              <Text style={{ color: MUTED, fontSize: 9 }}>répartition (g)</Text>
            </View>

            <View style={styles.phaseCardFull}>
              <Text style={styles.phaseTitle}>{pSingle.name || "Empâtement unique"}</Text>
              <PhaseRows p={pSingle} />
            </View>
          </View>
        ) : null}

        {/* MIX FARINES */}
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>Mix farines</Text>
            <Text style={{ color: MUTED, fontSize: 9 }}>Somme cible : 100%</Text>
          </View>

          <View style={styles.table}>
            <View style={styles.trHead}>
              <Text style={[styles.td1, styles.th]}>Farine</Text>
              <Text style={[styles.td2, styles.th]}>%</Text>
            </View>

            {flourMix.length ? (
              flourMix.map((f, idx) => (
                <View
  key={`${f.name}-${idx}`}
  style={[styles.tr, ...(idx === flourMix.length - 1 ? [{ borderBottomWidth: 0 }] : [])]}
>
                  <Text style={styles.td1}>{f.name || "—"}</Text>
                  <Text style={styles.td2}>{typeof f.percent === "number" ? `${f.percent}%` : "—"}</Text>
                </View>
              ))
            ) : (
              <View style={[styles.tr, { borderBottomWidth: 0 }]}>
                <Text style={styles.td1}>—</Text>
                <Text style={styles.td2}>—</Text>
              </View>
            )}
          </View>
        </View>

        {/* ✅ PROCÉDURE (cadre en bas) */}
        {hasProcedure ? (
          <View style={styles.procedureBox}>
            <Text style={styles.procedureTitle}>Procédure</Text>
            <Text style={styles.procedureText}>{procedure}</Text>
          </View>
        ) : null}

        <View style={styles.footer}>
          <Text>Bello Mio x Piccola Mia</Text>
          <Text>Empâtements — PDF</Text>
        </View>
      </Page>
    </Document>
  );
}
