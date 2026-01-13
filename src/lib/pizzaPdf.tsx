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
const LIGHT_GRAY = "#F4F1EE";
const BORDER = "#DDD";

const styles = StyleSheet.create({
  page: {
    padding: 36,
    fontFamily: "Helvetica",
    fontSize: 11,
    color: "#111",
  },

  /* HEADER */
  brand: {
    textAlign: "center",
    fontSize: 16,
    letterSpacing: 2,
    fontWeight: "bold",
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

  pizzaName: {
    fontSize: 26,
    fontWeight: "bold",
    color: TERRACOTTA,
    marginBottom: 6,
  },

  subtitle: {
    fontSize: 11,
    color: "#555",
    marginBottom: 10,
  },

  badges: {
    flexDirection: "row",
    gap: 8,
  },

  badge: {
    fontSize: 9,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: LIGHT_GRAY,
  },

  photo: {
    width: 150,
    height: 150,
    borderRadius: 10,
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
    color: "#666",
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
    padding: 10,
    borderRadius: 6,
    backgroundColor: LIGHT_GRAY,
    minHeight: 60,
  },
});

export function PizzaPdfDocument({ data }: { data: PizzaPdfData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>

        {/* BRAND */}
        <Text style={styles.brand}>BELLO MIO – PICCOLA MIA</Text>

        {/* HEADER */}
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Text style={styles.pizzaName}>{data.pizzaName}</Text>
            <Text style={styles.subtitle}>
              Fiche technique : empâtement + ingrédients avant/après four + grammages + notes.
            </Text>

            <View style={styles.badges}>
              <Text style={styles.badge}>
                Empâtement : {data.doughRecipeName ? `${data.doughRecipeName} (${data.doughRecipeType})` : "Aucun"}
              </Text>
              <Text style={styles.badge}>
                Export : {data.exportedAt}
              </Text>
            </View>
          </View>

          {data.photoUrl ? <Image src={data.photoUrl} style={styles.photo} /> : null}
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

      </Page>
    </Document>
  );
}