import React from "react";
import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";

type PdfIngredient = {
  name: string | null;
  qty: number | null;
  unit: string | null;
};

export type PizzaPdfData = {
  pizzaName: string;
  notes: string | null;
  doughRecipeName: string | null;
  doughRecipeType: string | null;
  pre: PdfIngredient[];
  post: PdfIngredient[];
  photoUrl: string | null;
  exportedAt: string;
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

  /* BRAND */
  brand: {
    textAlign: "center",
    fontSize: 14,
    fontWeight: "bold",
    letterSpacing: 1,
    marginBottom: 18,
  },

  /* HEADER 2 COL */
  headerRow: {
    flexDirection: "row",
    gap: 20,
    marginBottom: 24,
  },

  headerLeft: {
    flex: 1,
  },

  headerRight: {
    width: 180,
    alignItems: "flex-end",
  },

  pizzaName: {
    fontSize: 26,
    fontWeight: "bold",
    color: TERRACOTTA,
    marginBottom: 6,
  },

  subtitle: {
    fontSize: 11,
    color: MUTED,
    marginBottom: 12,
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

  /* SECTIONS */
  sectionTitle: {
    marginTop: 18,
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
    minHeight: 60,
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

export function PizzaPdfDocument({ data }: { data: PizzaPdfData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>

        {/* BRAND */}
        <Text style={styles.brand}>BELLO MIO — PICCOLA MIA</Text>

        {/* HEADER */}
        <View style={styles.headerRow}>

          {/* LEFT */}
          <View style={styles.headerLeft}>
            <Text style={styles.pizzaName}>{data.pizzaName}</Text>
            <Text style={styles.subtitle}>
              Fiche technique — empâtement, ingrédients avant / après four, grammages & notes
            </Text>

            <View style={styles.infoBox}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Empâtement</Text>
                <Text style={styles.infoValue}>
                  {data.doughRecipeName
                    ? `${data.doughRecipeName} (${data.doughRecipeType})`
                    : "Aucun"}
                </Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Export</Text>
                <Text style={styles.infoValue}>{data.exportedAt}</Text>
              </View>
            </View>
          </View>

          <View style={styles.headerRight}>
  {/* eslint-disable-next-line jsx-a11y/alt-text */}
  {data.photoUrl ? <Image src={data.photoUrl} style={styles.photo} /> : null}
</View>
        </View>

        {/* AVANT FOUR */}
        <Text style={styles.sectionTitle}>Ingrédients avant four</Text>
        <View style={styles.tableHeader}>
          <Text style={[styles.th, styles.colIngredient]}>Ingrédient</Text>
          <Text style={[styles.th, styles.colQty]}>Qté</Text>
          <Text style={[styles.th, styles.colUnit]}>Unité</Text>
        </View>
        {data.pre.map((i, idx) => (
          <View key={idx} style={styles.row}>
            <Text style={styles.colIngredient}>{i.name}</Text>
            <Text style={styles.colQty}>{i.qty}</Text>
            <Text style={styles.colUnit}>{i.unit}</Text>
          </View>
        ))}

        {/* APRES FOUR */}
        <Text style={styles.sectionTitle}>Ingrédients après cuisson / sortie de four</Text>
        <View style={styles.tableHeader}>
          <Text style={[styles.th, styles.colIngredient]}>Ingrédient</Text>
          <Text style={[styles.th, styles.colQty]}>Qté</Text>
          <Text style={[styles.th, styles.colUnit]}>Unité</Text>
        </View>
        {data.post.map((i, idx) => (
          <View key={idx} style={styles.row}>
            <Text style={styles.colIngredient}>{i.name}</Text>
            <Text style={styles.colQty}>{i.qty}</Text>
            <Text style={styles.colUnit}>{i.unit}</Text>
          </View>
        ))}

        {/* NOTES */}
        <Text style={styles.sectionTitle}>Notes / Procédé</Text>
        <View style={styles.notesBox}>
          <Text>{data.notes || ""}</Text>
        </View>

        {/* FOOTER */}
        <View style={styles.footer}>
          <Text>Bello Mio / Piccola Mia</Text>
          <Text>Pizza — PDF</Text>
        </View>

      </Page>
    </Document>
  );
}
