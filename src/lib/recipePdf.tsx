import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

export type FlourMixItem = { name: string; percent: number };

export type RecipePdfData = {
  name: string;
  type: string | null;

  hydration_total: number | null;
  salt_percent: number | null;
  honey_percent: number | null;
  oil_percent: number | null;

  yeast_percent: number | null; // direct/focaccia
  biga_yeast_percent: number | null; // biga (phase 2)

  flour_mix: FlourMixItem[];
  exportedAt: string;
};

const TERRACOTTA = "#B45A3C";
const TEXT = "#111111";
const MUTED = "#555555";
const BORDER = "#E6E6E6";

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 11, fontFamily: "Helvetica", color: TEXT },

  header: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    padding: 14,
    marginBottom: 14,
  },

  brand: {
    textAlign: "center",
    fontSize: 16,
    fontWeight: "bold",
    color: TERRACOTTA,
    letterSpacing: 0.3,
  },

  title: { marginTop: 10, fontSize: 22, fontWeight: "bold", textAlign: "center" },
  subtitle: { marginTop: 6, textAlign: "center", color: MUTED },

  pillRow: { marginTop: 10, flexDirection: "row", justifyContent: "center", gap: 8 },
  pill: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  pillLabel: { color: MUTED, fontSize: 10 },
  pillValue: { marginTop: 2, fontSize: 11, fontWeight: "bold" },

  section: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    padding: 14,
    marginTop: 12,
  },

  sectionTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { fontSize: 12, fontWeight: "bold", color: TERRACOTTA },

  grid: { marginTop: 10, flexDirection: "row", gap: 12 },
  col: { flexGrow: 1 },

  line: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: BORDER },
  k: { color: MUTED },
  v: { fontWeight: "bold" },

  table: { marginTop: 10, borderWidth: 1, borderColor: BORDER, borderRadius: 10, overflow: "hidden" },
  trHead: { flexDirection: "row", backgroundColor: "#FAFAFA", borderBottomWidth: 1, borderBottomColor: BORDER },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: BORDER },
  td1: { width: "70%", padding: 10 },
  td2: { width: "30%", padding: 10, textAlign: "right" },
  th: { fontSize: 10, color: MUTED, fontWeight: "bold" },

  footer: { position: "absolute", left: 32, right: 32, bottom: 24, flexDirection: "row", justifyContent: "space-between", color: MUTED, fontSize: 9 },
});

function fmt(n: number | null, suffix = "") {
  if (n === null || !Number.isFinite(n)) return "—";
  const s = String(n);
  return suffix ? `${s}${suffix}` : s;
}

export function RecipePdfDocument(props: { data: RecipePdfData }) {
  const d = props.data;

  const flourMix = Array.isArray(d.flour_mix) ? d.flour_mix : [];
  const type = (d.type ?? "").toLowerCase();

  const yeastLabel = type === "biga" ? "Levure (phase 2)" : "Levure";
  const yeastValue = type === "biga" ? d.biga_yeast_percent : d.yeast_percent;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* HEADER */}
        <View style={styles.header}>
          <Text style={styles.brand}>Bello Mio x Piccola Mia</Text>

          <Text style={styles.title}>{d.name || "Empâtement"}</Text>
          <Text style={styles.subtitle}>Fiche empâtement — paramètres + mix farines</Text>

          <View style={styles.pillRow}>
            <View style={styles.pill}>
              <Text style={styles.pillLabel}>Type</Text>
              <Text style={styles.pillValue}>{d.type ?? "—"}</Text>
            </View>

            <View style={styles.pill}>
              <Text style={styles.pillLabel}>Export</Text>
              <Text style={styles.pillValue}>{(d.exportedAt || "").slice(0, 10)}</Text>
            </View>
          </View>
        </View>

        {/* PARAMÈTRES */}
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>Paramètres</Text>
            <Text style={{ color: MUTED, fontSize: 10 }}>Ratios en % (boulanger)</Text>
          </View>

          <View style={styles.grid}>
            <View style={styles.col}>
              <View style={styles.line}>
                <Text style={styles.k}>Hydratation totale</Text>
                <Text style={styles.v}>{fmt(d.hydration_total, "%")}</Text>
              </View>
              <View style={styles.line}>
                <Text style={styles.k}>Sel</Text>
                <Text style={styles.v}>{fmt(d.salt_percent, "%")}</Text>
              </View>
              <View style={styles.line}>
                <Text style={styles.k}>Miel</Text>
                <Text style={styles.v}>{fmt(d.honey_percent, "%")}</Text>
              </View>
            </View>

            <View style={styles.col}>
              <View style={styles.line}>
                <Text style={styles.k}>Huile</Text>
                <Text style={styles.v}>{fmt(d.oil_percent, "%")}</Text>
              </View>
              <View style={styles.line}>
                <Text style={styles.k}>{yeastLabel}</Text>
                <Text style={styles.v}>{fmt(yeastValue, "%")}</Text>
              </View>
              <View style={[styles.line, { borderBottomWidth: 0 }]}>
                <Text style={styles.k}>Notes</Text>
                <Text style={styles.v}>—</Text>
              </View>
            </View>
          </View>
        </View>

        {/* MIX FARINES */}
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>Mix farines</Text>
            <Text style={{ color: MUTED, fontSize: 10 }}>Somme cible : 100%</Text>
          </View>

          <View style={styles.table}>
            <View style={styles.trHead}>
              <Text style={[styles.td1, styles.th]}>Farine</Text>
              <Text style={[styles.td2, styles.th]}>%</Text>
            </View>

            {flourMix.length ? (
              flourMix.map((f, idx) => (
                <View key={`${f.name}-${idx}`} style={[styles.tr, idx === flourMix.length - 1 ? { borderBottomWidth: 0 } : null]}>
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

        {/* FOOTER */}
        <View style={styles.footer}>
          <Text>Bello Mio x Piccola Mia</Text>
          <Text>Empâtements — PDF</Text>
        </View>
      </Page>
    </Document>
  );
}