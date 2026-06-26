import React from "react";
import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import { ALLERGENS } from "@/lib/allergens";

export type SalleLine = {
  name: string;
  /** Si la ligne est une sous-recette, la liste des ingrédients déroulés (noms uniquement, sans grammage). */
  subIngredients: string[] | null;
};

export type SalleFaqEntry = {
  question: string;
  reponse: string;
};

export type SalleAccords = {
  vin: string | null;
  biere: string | null;
  soft: string | null;
};

export type SalleRegimes = {
  vegetarien: boolean;
  vegan: boolean;
  sans_gluten: boolean;
  sans_lactose: boolean;
  halal: boolean;
};

export type KitchenSallePdfData = {
  recipeName: string;
  ref: string | null;
  category: string | null;
  sellPriceTTC: number | null;
  photoUrl: string | null;
  description: string | null;
  lines: SalleLine[];
  allergens: string[];
  accords: SalleAccords;
  regimes: SalleRegimes;
  faq: SalleFaqEntry[];
  exportedAt: string;
  logoBase64: string | null;
  establishment?: string | null;
};

const CATEGORY_LABELS: Record<string, string> = {
  cocktail: "Cocktail",
  preparation: "Preparation",
  plat_cuisine: "Plat",
  entree: "Entree",
  accompagnement: "Accompagnement",
  sauce: "Sauce",
  dessert: "Dessert",
  autre: "Autre",
};

const ALLERGEN_COLORS: Record<string, string> = {
  "Gluten": "#D97706",
  "Crustacés": "#DC2626",
  "Œufs": "#F59E0B",
  "Poisson": "#2563EB",
  "Arachides": "#92400E",
  "Soja": "#65A30D",
  "Lait": "#0284C7",
  "Fruits à coque": "#A16207",
  "Céleri": "#059669",
  "Moutarde": "#CA8A04",
  "Sésame": "#7C3AED",
  "Sulfites": "#9333EA",
  "Lupin": "#4F46E5",
  "Mollusques": "#0891B2",
};

const REGIME_LABELS: Record<keyof SalleRegimes, string> = {
  vegetarien: "Végétarien",
  vegan: "Vegan",
  sans_gluten: "Sans gluten",
  sans_lactose: "Sans lactose",
  halal: "Halal",
};

const ACCENT = "#D4775A";
const BG = "#FAF7F2";
const TEXT_COLOR = "#1A1A1A";
const MUTED = "#777777";
const BORDER = "#CBBFA8";
const SOFT = "#EDE7D9";
const SUCCESS = "#4A6741";

function fmtMoneyTTC(v: number | null): string {
  if (v == null || !Number.isFinite(v) || v <= 0) return "--";
  return v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

function getMonthYear(): string {
  const months = [
    "janvier", "fevrier", "mars", "avril", "mai", "juin",
    "juillet", "aout", "septembre", "octobre", "novembre", "decembre",
  ];
  const d = new Date();
  return months[d.getMonth()] + " " + d.getFullYear();
}

const styles = StyleSheet.create({
  page: {
    padding: 32,
    paddingBottom: 56,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: TEXT_COLOR,
    backgroundColor: BG,
  },

  /* HEADER */
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  logo: { width: 120, height: 60, objectFit: "contain" },
  logoFallback: { fontSize: 14, fontWeight: "bold", color: ACCENT },
  headerRight: { alignItems: "flex-end" },
  headerRef: { fontSize: 13, fontWeight: "bold", color: ACCENT, letterSpacing: 0.5 },
  headerDocType: { fontSize: 9, color: MUTED, marginTop: 2 },
  headerDate: { fontSize: 8, color: MUTED, marginTop: 1 },
  headerLine: { height: 2, backgroundColor: ACCENT, marginTop: 8, marginBottom: 16 },

  /* TITRE + PHOTO + PRIX */
  titlePhotoRow: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 16,
    alignItems: "flex-start",
  },
  titleBlock: { flex: 1 },
  recipeName: {
    fontSize: 26,
    fontWeight: "bold",
    color: TEXT_COLOR,
    marginBottom: 4,
  },
  categoryBadge: {
    alignSelf: "flex-start",
    backgroundColor: SOFT,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 8,
  },
  categoryText: {
    fontSize: 8,
    color: MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  priceBox: {
    backgroundColor: ACCENT,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: "center",
    minWidth: 90,
  },
  priceLabel: {
    fontSize: 7,
    color: "#FFFFFF",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    opacity: 0.8,
  },
  priceValue: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginTop: 2,
  },
  photoBox: {
    width: 110,
    height: 110,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: SOFT,
    borderWidth: 1,
    borderColor: BORDER,
    borderStyle: "solid",
  },
  photo: { width: 110, height: 110, objectFit: "cover" },

  /* SECTION TITLE */
  sectionTitleRow: {
    marginTop: 14,
    marginBottom: 8,
    paddingBottom: 3,
    borderBottomWidth: 1.5,
    borderBottomColor: ACCENT,
  },
  sectionTitleText: {
    fontSize: 10,
    fontWeight: "bold",
    color: ACCENT,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },

  /* PITCH */
  pitchBox: {
    backgroundColor: SOFT,
    borderRadius: 6,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: ACCENT,
    borderLeftStyle: "solid",
  },
  pitchText: {
    fontSize: 11,
    color: TEXT_COLOR,
    lineHeight: 1.5,
    fontStyle: "italic",
  },

  /* COMPOSITION */
  compositionRow: {
    marginBottom: 8,
  },
  compositionMain: {
    fontSize: 11,
    fontWeight: "bold",
    color: TEXT_COLOR,
    marginBottom: 2,
  },
  compositionSub: {
    fontSize: 9,
    color: MUTED,
    lineHeight: 1.4,
    paddingLeft: 12,
  },
  compositionBullet: {
    fontSize: 11,
    fontWeight: "bold",
    color: ACCENT,
    marginRight: 4,
  },

  /* BADGES (allergènes, régimes, accords) */
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
  },
  allergenBadge: {
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  allergenText: {
    fontSize: 9,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  regimeBadgeOk: {
    backgroundColor: SUCCESS,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  regimeBadgeNo: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: BORDER,
    borderStyle: "solid",
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  regimeTextOk: {
    fontSize: 9,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  regimeTextNo: {
    fontSize: 9,
    color: MUTED,
    textDecoration: "line-through",
  },

  /* ACCORDS */
  accordsGrid: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  accordCard: {
    flex: 1,
    backgroundColor: SOFT,
    borderRadius: 6,
    padding: 10,
  },
  accordLabel: {
    fontSize: 7,
    color: MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  accordValue: {
    fontSize: 10,
    fontWeight: "bold",
    color: TEXT_COLOR,
  },

  /* FAQ */
  faqRow: {
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: BORDER,
  },
  faqQuestion: {
    fontSize: 10,
    fontWeight: "bold",
    color: ACCENT,
    marginBottom: 3,
  },
  faqAnswer: {
    fontSize: 10,
    color: TEXT_COLOR,
    lineHeight: 1.4,
  },

  /* FOOTER */
  footer: {
    position: "absolute",
    bottom: 16,
    left: 32,
    right: 32,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: MUTED,
    borderTopWidth: 0.5,
    borderTopColor: BORDER,
    paddingTop: 5,
  },
});

export function KitchenSallePdfDocument({ data }: { data: KitchenSallePdfData }) {
  const ref = data.ref ?? "---";
  const monthYear = getMonthYear();
  const establishment = data.establishment ?? "Saint-Malo";
  const categoryLabel = data.category ? (CATEGORY_LABELS[data.category] ?? data.category) : null;

  const presentAllergens = (data.allergens ?? []).filter((a) =>
    ALLERGENS.includes(a as (typeof ALLERGENS)[number])
  );

  const hasAnyAccord = !!(data.accords.vin || data.accords.biere || data.accords.soft);
  const hasAnyRegime = Object.values(data.regimes).some((v) => v);

  return (
    <Document>
      <Page size="A4" style={styles.page}>

        {/* HEADER */}
        <View style={styles.headerRow}>
          {data.logoBase64 ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image src={data.logoBase64} style={styles.logo} />
          ) : (
            <Text style={styles.logoFallback}>iFratelli Group</Text>
          )}
          <View style={styles.headerRight}>
            <Text style={styles.headerRef}>{ref}</Text>
            <Text style={styles.headerDocType}>Fiche salle</Text>
            <Text style={styles.headerDate}>Mise a jour : {monthYear}</Text>
          </View>
        </View>
        <View style={styles.headerLine} />

        {/* TITRE + PHOTO + PRIX TTC */}
        <View style={styles.titlePhotoRow}>
          <View style={styles.titleBlock}>
            <Text style={styles.recipeName}>{data.recipeName}</Text>
            {categoryLabel && (
              <View style={styles.categoryBadge}>
                <Text style={styles.categoryText}>{categoryLabel}</Text>
              </View>
            )}
            {data.sellPriceTTC != null && data.sellPriceTTC > 0 && (
              <View style={styles.priceBox}>
                <Text style={styles.priceLabel}>Prix TTC</Text>
                <Text style={styles.priceValue}>{fmtMoneyTTC(data.sellPriceTTC)}</Text>
              </View>
            )}
          </View>
          {data.photoUrl && (
            <View style={styles.photoBox}>
              {/* eslint-disable-next-line jsx-a11y/alt-text */}
              <Image src={data.photoUrl} style={styles.photo} />
            </View>
          )}
        </View>

        {/* PITCH CLIENT */}
        {data.description && (
          <View>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitleText}>Argumentaire</Text>
            </View>
            <View style={styles.pitchBox}>
              <Text style={styles.pitchText}>{data.description}</Text>
            </View>
          </View>
        )}

        {/* COMPOSITION */}
        {data.lines.length > 0 && (
          <View>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitleText}>Composition</Text>
            </View>
            {data.lines.map((line, idx) => (
              <View key={idx} style={styles.compositionRow}>
                <View style={{ flexDirection: "row" }}>
                  <Text style={styles.compositionBullet}>•</Text>
                  <Text style={styles.compositionMain}>{line.name}</Text>
                </View>
                {line.subIngredients && line.subIngredients.length > 0 && (
                  <Text style={styles.compositionSub}>
                    → {line.subIngredients.join(", ")}
                  </Text>
                )}
              </View>
            ))}
          </View>
        )}

        {/* ALLERGÈNES */}
        {presentAllergens.length > 0 && (
          <View>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitleText}>Allergenes</Text>
            </View>
            <View style={styles.badgeRow}>
              {presentAllergens.map((a) => (
                <View
                  key={a}
                  style={[
                    styles.allergenBadge,
                    { backgroundColor: ALLERGEN_COLORS[a] ?? "#6B7280" },
                  ]}
                >
                  <Text style={styles.allergenText}>{a}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* RÉGIMES */}
        {hasAnyRegime && (
          <View>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitleText}>Regimes compatibles</Text>
            </View>
            <View style={styles.badgeRow}>
              {(Object.keys(REGIME_LABELS) as Array<keyof SalleRegimes>).map((key) => {
                const ok = data.regimes[key];
                if (!ok) return null;
                return (
                  <View key={key} style={styles.regimeBadgeOk}>
                    <Text style={styles.regimeTextOk}>{REGIME_LABELS[key]}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* ACCORDS */}
        {hasAnyAccord && (
          <View>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitleText}>Accords conseilles</Text>
            </View>
            <View style={styles.accordsGrid}>
              {data.accords.vin && (
                <View style={styles.accordCard}>
                  <Text style={styles.accordLabel}>Vin</Text>
                  <Text style={styles.accordValue}>{data.accords.vin}</Text>
                </View>
              )}
              {data.accords.biere && (
                <View style={styles.accordCard}>
                  <Text style={styles.accordLabel}>Biere</Text>
                  <Text style={styles.accordValue}>{data.accords.biere}</Text>
                </View>
              )}
              {data.accords.soft && (
                <View style={styles.accordCard}>
                  <Text style={styles.accordLabel}>Sans alcool</Text>
                  <Text style={styles.accordValue}>{data.accords.soft}</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* FAQ */}
        {data.faq.length > 0 && (
          <View>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitleText}>Questions clients</Text>
            </View>
            {data.faq.map((entry, idx) => (
              <View key={idx} style={styles.faqRow}>
                <Text style={styles.faqQuestion}>Q : {entry.question}</Text>
                <Text style={styles.faqAnswer}>R : {entry.reponse}</Text>
              </View>
            ))}
          </View>
        )}

        {/* FOOTER */}
        <View style={styles.footer} fixed>
          <Text>iFratelli Group -- {establishment}, Saint-Malo</Text>
          <Text>Ref. {ref} -- Version {monthYear}</Text>
          <Text>Confidentiel -- usage interne</Text>
        </View>

      </Page>
    </Document>
  );
}
