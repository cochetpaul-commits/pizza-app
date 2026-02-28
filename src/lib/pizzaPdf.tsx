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
  logoBase64: string | null;
};

const ROUGE = "#8B1A1A";
const BG = "#FAF7F2";
const TEXT = "#1A1A1A";
const MUTED = "#777777";
const BORDER = "#CBBFA8";
const SOFT = "#EDE7D9";

const styles = StyleSheet.create({
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
    borderBottomColor: ROUGE,
  },
  logo: {
    width: 90,
    height: 45,
    objectFit: "contain",
  },
  logoFallback: {
    fontSize: 13,
    fontWeight: "bold",
    color: ROUGE,
  },
  headerRight: {
    alignItems: "flex-end",
  },
  establishmentName: {
    fontSize: 11,
    fontWeight: "bold",
    color: ROUGE,
    letterSpacing: 0.5,
  },
  docType: {
    fontSize: 8,
    color: MUTED,
    marginTop: 2,
  },

  /* TOP SECTION */
  topSection: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 12,
  },
  topLeft: {
    flex: 1,
  },
  recipeName: {
    fontSize: 26,
    fontWeight: "bold",
    color: ROUGE,
    marginBottom: 4,
  },
  recipeSubtitle: {
    fontSize: 9,
    color: MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  infoBox: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 5,
    padding: 8,
    backgroundColor: SOFT,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 3,
  },
  infoLabel: {
    fontSize: 9,
    color: MUTED,
  },
  infoValue: {
    fontSize: 9,
    fontWeight: "bold",
    color: TEXT,
  },

  /* PHOTO */
  photo: {
    width: 130,
    height: 130,
    borderRadius: 6,
    objectFit: "cover",
  },
  photoPlaceholder: {
    width: 130,
    height: 130,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: SOFT,
    justifyContent: "center",
    alignItems: "center",
  },

  /* SECTIONS */
  sectionTitle: {
    marginTop: 12,
    marginBottom: 5,
    fontSize: 10,
    fontWeight: "bold",
    color: ROUGE,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: ROUGE,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: ROUGE,
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
  rowEven: {
    backgroundColor: SOFT,
  },
  colIngredient: { flex: 3 },
  colQty: { flex: 1, textAlign: "right" },
  colUnit: { flex: 1, textAlign: "right" },

  /* NOTES */
  notesText: {
    fontSize: 10,
    color: TEXT,
    lineHeight: 1.5,
    marginTop: 4,
    minHeight: 30,
  },

  /* ALLERGÈNES */
  allergenGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 5,
  },
  allergenItem: {
    flexDirection: "row",
    alignItems: "center",
    width: "33%",
    gap: 5,
    marginBottom: 5,
  },
  allergenCheck: {
    width: 10,
    height: 10,
    borderWidth: 1,
    borderColor: MUTED,
    borderRadius: 2,
  },
  allergenLabel: {
    fontSize: 8,
    color: TEXT,
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

const ALLERGENS = [
  "Gluten",
  "Crustacés",
  "Œufs",
  "Poisson",
  "Arachides",
  "Soja",
  "Lait",
  "Fruits à coque",
  "Céleri",
  "Moutarde",
  "Graines sésame",
  "Lupin",
  "Mollusques",
  "Anhydride sulfureux",
];

function IngredientsTable({ items }: { items: PdfIngredient[] }) {
  if (items.length === 0) return null;
  return (
    <View>
      <View style={styles.tableHeader}>
        <Text style={[styles.th, styles.colIngredient]}>Ingrédient</Text>
        <Text style={[styles.th, styles.colQty]}>Qté</Text>
        <Text style={[styles.th, styles.colUnit]}>Unité</Text>
      </View>
      {items.map((i, idx) => (
        <View key={idx} style={[styles.row, idx % 2 === 1 ? styles.rowEven : {}]}>
          <Text style={styles.colIngredient}>{i.name ?? "—"}</Text>
          <Text style={styles.colQty}>{i.qty != null ? String(i.qty) : ""}</Text>
          <Text style={styles.colUnit}>{i.unit ?? ""}</Text>
        </View>
      ))}
    </View>
  );
}

export function PizzaPdfDocument({ data }: { data: PizzaPdfData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>

        {/* HEADER */}
        <View style={styles.header}>
          {data.logoBase64 ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image src={data.logoBase64} style={styles.logo} />
          ) : (
            <Text style={styles.logoFallback}>iFratelli Group</Text>
          )}
          <View style={styles.headerRight}>
            <Text style={styles.establishmentName}>iFratelli Group</Text>
            <Text style={styles.docType}>Fiche Technique — Pizza</Text>
          </View>
        </View>

        {/* NAME + PHOTO */}
        <View style={styles.topSection}>
          <View style={styles.topLeft}>
            <Text style={styles.recipeName}>{data.pizzaName}</Text>
            <Text style={styles.recipeSubtitle}>Pizza — Fiche technique</Text>
            <View style={styles.infoBox}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Empâtement</Text>
                <Text style={styles.infoValue}>
                  {data.doughRecipeName
                    ? `${data.doughRecipeName}${data.doughRecipeType ? ` (${data.doughRecipeType})` : ""}`
                    : "—"}
                </Text>
              </View>
            </View>
          </View>
          {data.photoUrl ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image src={data.photoUrl} style={styles.photo} />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Text style={{ fontSize: 8, color: MUTED }}>Photo</Text>
            </View>
          )}
        </View>

        {/* AVANT FOUR */}
        <Text style={styles.sectionTitle}>Ingrédients avant four</Text>
        <IngredientsTable items={data.pre} />

        {/* APRES FOUR */}
        {data.post.length > 0 && (
          <View>
            <Text style={styles.sectionTitle}>Ingrédients après cuisson</Text>
            <IngredientsTable items={data.post} />
          </View>
        )}

        {/* PROCÉDÉ */}
        <Text style={styles.sectionTitle}>Procédé</Text>
        <Text style={styles.notesText}>{data.notes || "—"}</Text>

        {/* ALLERGÈNES */}
        <Text style={styles.sectionTitle}>Allergènes</Text>
        <View style={styles.allergenGrid}>
          {ALLERGENS.map((a) => (
            <View key={a} style={styles.allergenItem}>
              <View style={styles.allergenCheck} />
              <Text style={styles.allergenLabel}>{a}</Text>
            </View>
          ))}
        </View>

        {/* FOOTER */}
        <View style={styles.footer}>
          <Text>iFratelli Group</Text>
          <Text>Exporté le {data.exportedAt}</Text>
        </View>

      </Page>
    </Document>
  );
}
