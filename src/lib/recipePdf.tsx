import React from "react";
import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";

export type FlourMixItem = { name: string; percent: number };

// Kept for backward compat with any external imports
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
  nbPatons: number;
  poidsPaton: number;
  phases: RecipePdfPhase[];
  flour_mix: FlourMixItem[];
  procedure?: string | null;
  logoBase64?: string | null;
  accentColor?: string;
  // legacy — acceptés mais non affichés
  hydration_total?: number | null;
  salt_percent?: number | null;
  honey_percent?: number | null;
  oil_percent?: number | null;
  yeast_percent?: number | null;
  biga_yeast_percent?: number | null;
  totals?: Partial<RecipePdfTotals>;
  warnings?: string[];
  exportedAt?: string;
};

const DEFAULT_ACCENT = "#EA580C";
const BG = "#FAF7F2";
const TEXT = "#1A1A1A";
const MUTED = "#777777";
const BORDER = "#CBBFA8";
const SOFT = "#EDE7D9";

function createStyles(ACCENT: string) {
  return StyleSheet.create({
    page: {
      padding: 32,
      paddingBottom: 50,
      fontFamily: "Helvetica",
      fontSize: 11,
      color: TEXT,
      backgroundColor: BG,
    },

    /* HEADER */
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 14,
      paddingBottom: 10,
      borderBottomWidth: 2,
      borderBottomColor: ACCENT,
    },
    logo: { width: 90, height: 45, objectFit: "contain" },
    logoFallback: { fontSize: 13, fontWeight: "bold", color: ACCENT },
    headerRight: { alignItems: "flex-end" },
    establishmentName: { fontSize: 11, fontWeight: "bold", color: ACCENT, letterSpacing: 0.5 },
    docType: { fontSize: 8, color: MUTED, marginTop: 2 },

    /* TITLE BLOCK */
    recipeName: { fontSize: 26, fontWeight: "bold", color: ACCENT, marginBottom: 2 },
    recipeSubtitle: {
      fontSize: 9,
      color: MUTED,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: 12,
    },

    /* SECTION TITLES */
    sectionTitle: {
      marginTop: 12,
      marginBottom: 5,
      fontSize: 10,
      fontWeight: "bold",
      color: ACCENT,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      paddingBottom: 3,
      borderBottomWidth: 1,
      borderBottomColor: ACCENT,
    },

    /* PHASE SUB-HEADER (used inside 2-col biga layout) */
    phaseSubTitle: {
      fontSize: 9,
      fontWeight: "bold",
      color: ACCENT,
      marginBottom: 4,
      textTransform: "uppercase",
      letterSpacing: 0.4,
    },

    /* TABLES */
    tableHeader: {
      flexDirection: "row",
      backgroundColor: ACCENT,
      borderRadius: 3,
      paddingHorizontal: 6,
      paddingVertical: 4,
    },
    th: {
      fontSize: 8,
      fontWeight: "bold",
      color: BG,
      textTransform: "uppercase",
      letterSpacing: 0.3,
    },
    row: {
      flexDirection: "row",
      paddingHorizontal: 6,
      paddingVertical: 5,
      borderBottomWidth: 0.5,
      borderBottomColor: BORDER,
    },
    rowEven: { backgroundColor: SOFT },
    colName: { flex: 3, fontSize: 10 },
    colQty: { flex: 1, textAlign: "right", fontSize: 10 },

    /* MIX FARINES TABLE */
    mixColName: { flex: 3, fontSize: 10 },
    mixColPct: { flex: 1, textAlign: "right", fontSize: 10 },

    /* PROCÉDÉ */
    notesText: {
      fontSize: 10,
      color: TEXT,
      lineHeight: 1.5,
      marginTop: 4,
    },

    /* FOOTER */
    footer: {
      position: "absolute",
      bottom: 16,
      left: 32,
      right: 32,
      flexDirection: "row",
      justifyContent: "space-between",
      fontSize: 8,
      color: MUTED,
      borderTopWidth: 0.5,
      borderTopColor: BORDER,
      paddingTop: 5,
    },
  });
}

type RecipeStyles = ReturnType<typeof createStyles>;

function fmtG(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${Math.round(n)} g`;
}

function isNonZeroG(n: number | null | undefined) {
  return n != null && Number.isFinite(n) && Math.round(n) !== 0;
}

function getPhaseRows(p: RecipePdfPhase) {
  const rows: Array<{ name: string; qty: string }> = [];
  rows.push({ name: "Farine", qty: fmtG(p.flour_g) });
  rows.push({ name: "Eau", qty: fmtG(p.water_g) });
  if (isNonZeroG(p.salt_g)) rows.push({ name: "Sel", qty: fmtG(p.salt_g) });
  if (isNonZeroG(p.honey_g)) rows.push({ name: "Miel", qty: fmtG(p.honey_g) });
  if (isNonZeroG(p.oil_g)) rows.push({ name: "Huile", qty: fmtG(p.oil_g) });
  if (isNonZeroG(p.yeast_g)) rows.push({ name: "Levure", qty: fmtG(p.yeast_g) });
  return rows;
}

function PhaseTable({ phase, styles }: { phase: RecipePdfPhase; styles: RecipeStyles }) {
  const rows = getPhaseRows(phase);
  return (
    <View>
      <View style={styles.tableHeader}>
        <Text style={[styles.th, styles.colName]}>Ingrédient</Text>
        <Text style={[styles.th, styles.colQty]}>Qté</Text>
      </View>
      {rows.map((r, idx) => (
        <View key={idx} style={[styles.row, idx % 2 === 1 ? styles.rowEven : {}]}>
          <Text style={styles.colName}>{r.name}</Text>
          <Text style={styles.colQty}>{r.qty}</Text>
        </View>
      ))}
    </View>
  );
}

function normalizeProcedure(raw: string) {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Extrait la partie après " — " dans le nom de phase, ou retourne le nom complet. */
function phaseLabel(name: string) {
  const parts = name.split(/\s*—\s*/);
  return parts.length > 1 ? parts.slice(1).join(" — ").toUpperCase() : name.toUpperCase();
}

export function RecipePdfDocument(props: { data: RecipePdfData }) {
  const d = props.data;
  const styles = createStyles(d.accentColor ?? DEFAULT_ACCENT);

  const flourMix = Array.isArray(d.flour_mix) ? d.flour_mix : [];
  const phases = Array.isArray(d.phases) ? d.phases : [];
  const type = (d.type ?? "").toLowerCase();
  const isBiga = type === "biga";

  const p1 = isBiga ? phases.find((p) => /phase 1/i.test(p.name)) ?? null : null;
  const p2 = isBiga ? phases.find((p) => /phase 2/i.test(p.name)) ?? null : null;
  const pSingle = !isBiga ? phases[0] ?? null : null;

  const procedure = normalizeProcedure(String(d.procedure ?? ""));
  const hasProcedure = procedure.length > 0;

  const typeLabel = d.type ? d.type.charAt(0).toUpperCase() + d.type.slice(1).toLowerCase() : "—";
  const subtitle = `${typeLabel} · ${d.nbPatons} pâton${d.nbPatons > 1 ? "s" : ""} × ${d.poidsPaton} g`;

  return (
    <Document>
      <Page size="A4" style={styles.page}>

        {/* HEADER */}
        <View style={styles.header}>
          {d.logoBase64 ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image src={d.logoBase64} style={styles.logo} />
          ) : (
            <Text style={styles.logoFallback}>iFratelli Group</Text>
          )}
          <View style={styles.headerRight}>
            <Text style={styles.establishmentName}>iFratelli Group</Text>
            <Text style={styles.docType}>Fiche Technique — Empâtement</Text>
          </View>
        </View>

        {/* TITRE */}
        <Text style={styles.recipeName}>{d.name || "Empâtement"}</Text>
        <Text style={styles.recipeSubtitle}>{subtitle}</Text>

        {/* PHASES — SIMPLE */}
        {!isBiga && pSingle ? (
          <View>
            <Text style={styles.sectionTitle}>Ingrédients</Text>
            <PhaseTable phase={pSingle} styles={styles} />
          </View>
        ) : null}

        {/* PHASES — BIGA (2 colonnes côte à côte) */}
        {isBiga && (p1 || p2) ? (
          <View>
            <Text style={styles.sectionTitle}>Phases d&apos;empâtement</Text>
            <View style={{ flexDirection: "row", gap: 12, marginTop: 4 }}>
              {[p1, p2].map((p, idx) => (
                <View key={idx} style={{ flex: 1 }}>
                  <Text style={styles.phaseSubTitle}>
                    {p ? phaseLabel(p.name) : idx === 0 ? "PHASE 1" : "PHASE 2"}
                  </Text>
                  {p ? <PhaseTable phase={p} styles={styles} /> : null}
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* MIX FARINES */}
        {flourMix.length > 0 ? (
          <View>
            <Text style={styles.sectionTitle}>Mix farines</Text>
            <View style={styles.tableHeader}>
              <Text style={[styles.th, styles.mixColName]}>Farine</Text>
              <Text style={[styles.th, styles.mixColPct]}>%</Text>
            </View>
            {flourMix.map((f, idx) => (
              <View key={idx} style={[styles.row, idx % 2 === 1 ? styles.rowEven : {}]}>
                <Text style={styles.mixColName}>{f.name || "—"}</Text>
                <Text style={styles.mixColPct}>
                  {typeof f.percent === "number" ? `${f.percent}%` : "—"}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* PROCÉDÉ */}
        {hasProcedure ? (
          <View>
            <Text style={styles.sectionTitle}>Procédé</Text>
            <Text style={styles.notesText}>{procedure}</Text>
          </View>
        ) : null}

        {/* FOOTER */}
        <View style={styles.footer}>
          <Text>iFratelli Group</Text>
          <Text>Empâtements — PDF</Text>
        </View>

      </Page>
    </Document>
  );
}
