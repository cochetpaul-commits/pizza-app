import React from "react";
import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";

type PdfLine = {
  name: string | null;
  qty: number | null;
  unit: string | null;
};

export type KitchenPdfData = {
  recipeName: string;
  category: string | null;
  costPerKg: number | null;
  lines: PdfLine[];
  notes: string | null;
  procedure: string | null;exportedAt: string;
};

const TERRACOTTA = "#B65C3A";
const TEXT = "#111111";
const MUTED = "#666666";
const BORDER = "#E5E5E5";
const SOFT = "#F6F4F2";

const styles = StyleSheet.create({
  page: {
    padding: 32,
    fontFamily: "Helvetica",
    fontSize: 11,
    color: TEXT,
  },

  brand: {
    textAlign: "center",
    fontSize: 14,
    fontWeight: "bold",
    letterSpacing: 1,
    marginBottom: 18,
  },

  headerRow: {
    flexDirection: "row",
    gap: 20,
    marginBottom: 18,
  },

  headerLeft: {
    flex: 1,
  },

  headerRight: {
    width: 180,
    alignItems: "flex-end",
  },

  title: {
    fontSize: 26,
    fontWeight: "bold",
    color: TERRACOTTA,
    marginBottom: 6,
  },

  subtitle: {
    fontSize: 11,
    color: MUTED,
    marginBottom: 10,
  },

  infoBox: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    padding: 10,
    backgroundColor: SOFT,
    gap: 6,
  },

  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },

  infoLabel: {
    fontSize: 9,
    color: MUTED,
  },

  infoValue: {
    fontSize: 10,
    fontWeight: "bold",
  },

  photo: {
    width: 180,
    height: 180,
    borderRadius: 12,
    objectFit: "cover",
  },

  sectionTitle: {
    marginTop: 14,
    marginBottom: 6,
    fontSize: 13,
    fontWeight: "bold",
    color: TERRACOTTA,
  },

  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    paddingBottom: 4,
    marginBottom: 4,
  },

  th: {
    fontSize: 9,
    fontWeight: "bold",
    textTransform: "uppercase",
    color: MUTED,
  },

  row: {
    flexDirection: "row",
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: BORDER,
  },

  colIngredient: { flex: 3 },
  colQty: { flex: 1, textAlign: "right" },
  colUnit: { flex: 1, textAlign: "right" },

  notesBox: {
    marginTop: 6,
    padding: 12,
    borderRadius: 8,
    backgroundColor: SOFT,
    borderWidth: 1,
    borderColor: BORDER,
    minHeight: 80,
  },

  footer: {
    position: "absolute",
    bottom: 16,
    left: 32,
    right: 32,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: MUTED,
  },
});

function fmtKg(v: number | null) {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toLocaleString("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + " €/kg";
}

export function KitchenPdfDocument({ data }: { data: KitchenPdfData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.brand}>BELLO MIO — PICCOLA MIA</Text>

        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Text style={styles.title}>{data.recipeName}</Text>
            <Text style={styles.subtitle}>Fiche cuisine — composition, coût/kg, notes & procédé</Text>

            <View style={styles.infoBox}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Catégorie</Text>
                <Text style={styles.infoValue}>{data.category || "—"}</Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Coût / kg</Text>
                <Text style={styles.infoValue}>{fmtKg(data.costPerKg)}</Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Export</Text>
                <Text style={styles.infoValue}>{data.exportedAt}</Text>
              </View>
            </View>
          </View>

          <View style={styles.headerRight}>
            
          </View>
        </View>

        <Text style={styles.sectionTitle}>Composition</Text>
        <View style={styles.tableHeader}>
          <Text style={[styles.th, styles.colIngredient]}>Ingrédient</Text>
          <Text style={[styles.th, styles.colQty]}>Qté</Text>
          <Text style={[styles.th, styles.colUnit]}>Unité</Text>
        </View>

        {data.lines.map((i, idx) => (
          <View key={idx} style={styles.row}>
            <Text style={styles.colIngredient}>{i.name}</Text>
            <Text style={styles.colQty}>{i.qty == null ? "" : String(i.qty)}</Text>
            <Text style={styles.colUnit}>{i.unit}</Text>
          </View>
        ))}

        <Text style={styles.sectionTitle}>Notes / Procédé</Text>
        <View style={styles.notesBox}>
          <Text>{[data.notes, data.procedure].filter(Boolean).join("\n\n")}</Text>
        </View>

        <View style={styles.footer}>
          <Text>Bello Mio / Piccola Mia</Text>
          <Text>Cuisine — PDF</Text>
        </View>
      </Page>
    </Document>
  );
}
