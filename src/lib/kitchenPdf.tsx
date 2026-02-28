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
  costPerPortion: number | null;
  totalCost: number | null;
  portionsCount: number | null;
  yieldGrams: number | null;
  lines: PdfLine[];
  notes: string | null;
  procedure: string | null;
  exportedAt: string;
  logoBase64: string | null;
  photoUrl: string | null;
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
  photoContainer: {
    width: 130,
    alignItems: "center",
  },
  photo: {
    width: 130,
    height: 130,
    borderRadius: 6,
    objectFit: "cover",
    borderWidth: 1,
    borderColor: BORDER,
  },
  photoPlaceholder: {
    width: 130,
    height: 130,
    borderRadius: 6,
    backgroundColor: SOFT,
    borderWidth: 1,
    borderColor: BORDER,
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

const CATEGORY_LABELS: Record<string, string> = {
  cocktail: "Cocktail",
  preparation: "Préparation",
  plat_cuisine: "Plat cuisiné",
  dessert: "Dessert",
  autre: "Autre",
};

function fmtMoney(v: number | null) {
  if (v == null || !Number.isFinite(v) || v <= 0) return "—";
  return v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

function fmtKg(v: number | null) {
  if (v == null || !Number.isFinite(v) || v <= 0) return "—";
  return v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €/kg";
}

function displayQty(qty: number | null, unit: string | null, isCocktail: boolean): string {
  if (qty == null) return "";
  if (isCocktail && unit === "ml") {
    const cl = qty / 10;
    return cl === Math.floor(cl) ? String(cl) : cl.toFixed(1);
  }
  return String(qty);
}

function displayUnit(unit: string | null, isCocktail: boolean): string {
  if (isCocktail && unit === "ml") return "cl";
  return unit ?? "";
}

export function KitchenPdfDocument({ data }: { data: KitchenPdfData }) {
  const isCocktail = data.category === "cocktail";
  const categoryLabel = data.category ? (CATEGORY_LABELS[data.category] ?? data.category) : "—";
  const docTypeLabel = isCocktail ? "Fiche Technique — Cocktail" : "Fiche Technique — Cuisine";

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
            <Text style={styles.docType}>{docTypeLabel}</Text>
          </View>
        </View>

        {/* NAME + PHOTO */}
        <View style={styles.topSection}>
          <View style={styles.topLeft}>
            <Text style={styles.recipeName}>{data.recipeName}</Text>
            <Text style={styles.recipeSubtitle}>{categoryLabel} — Fiche technique</Text>
            <View style={styles.infoBox}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Catégorie</Text>
                <Text style={styles.infoValue}>{categoryLabel}</Text>
              </View>
              {isCocktail ? (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Coût total</Text>
                  <Text style={styles.infoValue}>{fmtMoney(data.totalCost)}</Text>
                </View>
              ) : (
                <View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Coût / kg</Text>
                    <Text style={styles.infoValue}>{fmtKg(data.costPerKg)}</Text>
                  </View>
                  {data.portionsCount != null && data.portionsCount > 0 && (
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>Coût / portion</Text>
                      <Text style={styles.infoValue}>{fmtMoney(data.costPerPortion)}</Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          </View>
          <View style={styles.photoContainer}>
            {data.photoUrl ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={data.photoUrl} style={styles.photo} />
            ) : (
              <View style={styles.photoPlaceholder}>
                <Text style={{ fontSize: 8, color: MUTED }}>Photo</Text>
              </View>
            )}
          </View>
        </View>

        {/* COMPOSITION */}
        <Text style={styles.sectionTitle}>Composition</Text>
        <View style={styles.tableHeader}>
          <Text style={[styles.th, styles.colIngredient]}>Ingrédient</Text>
          <Text style={[styles.th, styles.colQty]}>Qté</Text>
          <Text style={[styles.th, styles.colUnit]}>{isCocktail ? "cl" : "Unité"}</Text>
        </View>
        {data.lines.map((i, idx) => (
          <View key={idx} style={[styles.row, idx % 2 === 1 ? styles.rowEven : {}]}>
            <Text style={styles.colIngredient}>{i.name ?? "—"}</Text>
            <Text style={styles.colQty}>{displayQty(i.qty, i.unit, isCocktail)}</Text>
            <Text style={styles.colUnit}>{displayUnit(i.unit, isCocktail)}</Text>
          </View>
        ))}

        {/* PROCÉDÉ */}
        <Text style={styles.sectionTitle}>Procédé</Text>
        <Text style={styles.notesText}>
          {[data.notes, data.procedure].filter(Boolean).join("\n\n") || "—"}
        </Text>

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
