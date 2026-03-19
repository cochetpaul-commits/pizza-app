import React from "react";
import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import { formatLiquidQtyParts } from "@/lib/formatUnit";
import { ALLERGENS } from "@/lib/allergens";

type PdfLine = {
  name: string | null;
  qty: number | null;
  unit: string | null;
  supplier: string | null;
  rendement: number;
  isSubRecipe: boolean;
};

export type KitchenPdfData = {
  recipeName: string;
  ref: string | null;
  category: string | null;
  costPerKg: number | null;
  costPerPortion: number | null;
  totalCost: number | null;
  sellPrice: number | null;
  portionsCount: number | null;
  yieldGrams: number | null;
  lines: PdfLine[];
  notes: string | null;
  procedure: string | null;
  exportedAt: string;
  logoBase64: string | null;
  photoUrl: string | null;
  accentColor?: string;
  allergens?: string[];
  establishment?: string | null;
};

const CATEGORY_COLORS: Record<string, string> = {
  preparation: "#2563EB",
  plat_cuisine: "#8B1A1A",
  entree: "#0D9488",
  accompagnement: "#D97706",
  sauce: "#EA580C",
  dessert: "#7C3AED",
  cocktail: "#9D174D",
  autre: "#6B7280",
};

const CATEGORY_LABELS: Record<string, string> = {
  cocktail: "Cocktail",
  preparation: "Preparation",
  plat_cuisine: "Plat cuisine",
  entree: "Entree",
  accompagnement: "Accompagnement",
  sauce: "Sauce",
  dessert: "Dessert",
  autre: "Autre",
};

const ALLERGEN_COLORS: Record<string, string> = {
  Gluten: "#D97706",
  "Crustaces": "#DC2626",
  Oeufs: "#F59E0B",
  Poissons: "#2563EB",
  "Arachides": "#92400E",
  Soja: "#65A30D",
  Lait: "#0284C7",
  "Fruits a coque": "#A16207",
  "Celeri": "#059669",
  Moutarde: "#CA8A04",
  "Sesame": "#7C3AED",
  Sulfites: "#9333EA",
  Lupin: "#4F46E5",
  Mollusques: "#0891B2",
};

const DEFAULT_ACCENT = "#8B1A1A";
const BG = "#FAF7F2";
const TEXT_COLOR = "#1A1A1A";
const MUTED = "#777777";
const BORDER = "#CBBFA8";
const SOFT = "#EDE7D9";

function fmtMoney(v: number | null) {
  if (v == null || !Number.isFinite(v) || v <= 0) return "--";
  return v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " \u20AC";
}

function fmtPercent(v: number | null) {
  if (v == null || !Number.isFinite(v)) return "--";
  return v.toFixed(1) + " %";
}

function foodCostColor(pct: number | null): string {
  if (pct == null || !Number.isFinite(pct)) return MUTED;
  if (pct <= 28) return "#16A34A";
  if (pct <= 32) return "#D97706";
  return "#DC2626";
}

function getMonthYear(): string {
  const months = [
    "janvier", "fevrier", "mars", "avril", "mai", "juin",
    "juillet", "aout", "septembre", "octobre", "novembre", "decembre",
  ];
  const d = new Date();
  return months[d.getMonth()] + " " + d.getFullYear();
}

function resolveAccent(category: string | null, accentColor?: string): string {
  if (category && CATEGORY_COLORS[category]) return CATEGORY_COLORS[category];
  return accentColor ?? DEFAULT_ACCENT;
}

function createStyles(ACCENT: string) {
  return StyleSheet.create({
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
      marginBottom: 0,
    },
    logo: {
      width: 120,
      height: 60,
      objectFit: "contain",
    },
    logoFallback: {
      fontSize: 14,
      fontWeight: "bold",
      color: ACCENT,
    },
    headerRight: {
      alignItems: "flex-end",
    },
    headerRef: {
      fontSize: 13,
      fontWeight: "bold",
      color: ACCENT,
      letterSpacing: 0.5,
    },
    headerDocType: {
      fontSize: 9,
      color: MUTED,
      marginTop: 2,
    },
    headerDate: {
      fontSize: 8,
      color: MUTED,
      marginTop: 1,
    },
    headerLine: {
      height: 2,
      backgroundColor: ACCENT,
      marginTop: 8,
      marginBottom: 16,
    },

    /* RECIPE TITLE + PHOTO */
    titlePhotoRow: {
      flexDirection: "row",
      gap: 16,
      marginBottom: 16,
    },
    titleBlock: {
      flex: 1,
    },
    recipeName: {
      fontSize: 28,
      fontWeight: "bold",
      color: TEXT_COLOR,
      marginBottom: 6,
    },
    badgeRow: {
      flexDirection: "row",
      gap: 8,
      marginBottom: 0,
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
    photo: {
      width: 110,
      height: 110,
      objectFit: "cover",
    },
    badge: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: SOFT,
      borderRadius: 4,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    badgeText: {
      fontSize: 8,
      color: MUTED,
    },

    /* KPI BANNER */
    kpiBanner: {
      flexDirection: "row",
      gap: 8,
      marginBottom: 18,
    },
    kpiBox: {
      flex: 1,
      backgroundColor: SOFT,
      borderRadius: 6,
      padding: 10,
      alignItems: "center",
    },
    kpiLabel: {
      fontSize: 7,
      color: MUTED,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: 3,
    },
    kpiValue: {
      fontSize: 14,
      fontWeight: "bold",
    },

    /* SECTION TITLE */
    sectionTitleRow: {
      marginTop: 14,
      marginBottom: 6,
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

    /* TABLE */
    tableHeader: {
      flexDirection: "row",
      backgroundColor: ACCENT,
      borderRadius: 3,
      paddingHorizontal: 8,
      paddingVertical: 5,
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
      paddingHorizontal: 8,
      paddingVertical: 5,
      borderBottomWidth: 0.5,
      borderBottomColor: BORDER,
    },
    rowEven: {
      backgroundColor: SOFT,
    },
    colIngredient: { flex: 3 },
    colSupplier: { flex: 2 },
    colQty: { flex: 1.2, textAlign: "right" },
    colPerte: { flex: 1, textAlign: "right" },
    subRecipeBadge: {
      fontSize: 7,
      color: ACCENT,
      fontWeight: "bold",
    },
    totalRow: {
      flexDirection: "row",
      paddingHorizontal: 8,
      paddingVertical: 7,
      backgroundColor: SOFT,
      borderTopWidth: 1,
      borderTopColor: ACCENT,
      marginTop: 2,
    },
    totalLabel: {
      flex: 1,
      fontSize: 10,
      fontWeight: "bold",
      color: TEXT_COLOR,
    },
    totalValue: {
      fontSize: 11,
      fontWeight: "bold",
      color: ACCENT,
    },

    /* PROCEDURE */
    stepRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      marginBottom: 6,
      gap: 8,
    },
    stepCircle: {
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: ACCENT,
      justifyContent: "center",
      alignItems: "center",
    },
    stepNumber: {
      fontSize: 9,
      fontWeight: "bold",
      color: "#FFFFFF",
    },
    stepText: {
      flex: 1,
      fontSize: 10,
      color: TEXT_COLOR,
      lineHeight: 1.5,
      paddingTop: 1,
    },

    /* ALLERGENS */
    allergenRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      marginTop: 5,
    },
    allergenBadge: {
      borderRadius: 4,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    allergenBadgeText: {
      fontSize: 8,
      fontWeight: "bold",
      color: "#FFFFFF",
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
}


export function KitchenPdfDocument({ data }: { data: KitchenPdfData }) {
  const accent = resolveAccent(data.category, data.accentColor);
  const styles = createStyles(accent);
  const categoryLabel = data.category ? (CATEGORY_LABELS[data.category] ?? data.category) : null;
  const monthYear = getMonthYear();
  const ref = data.ref ?? "---";
  const establishment = data.establishment ?? "Saint-Malo";

  // KPI calculations
  const costPerPortion = data.costPerPortion;
  const sellPrice = data.sellPrice;
  const foodCostPct =
    costPerPortion != null && sellPrice != null && sellPrice > 0
      ? (costPerPortion / sellPrice) * 100
      : null;
  const margeBrute =
    costPerPortion != null && sellPrice != null && sellPrice > 0
      ? sellPrice - costPerPortion
      : null;

  // Yield label
  const yieldLabel =
    data.yieldGrams != null && data.yieldGrams > 0
      ? data.yieldGrams >= 1000
        ? `${(data.yieldGrams / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} kg / portion`
        : `${Math.round(data.yieldGrams)} g / portion`
      : null;
  const portionsLabel =
    data.portionsCount != null && data.portionsCount > 0
      ? `${data.portionsCount} portion${data.portionsCount > 1 ? "s" : ""}`
      : null;

  // Procedure steps
  let steps: string[] = [];
  const rawProcedure = [data.procedure, data.notes].filter(Boolean).join("\n\n");
  if (rawProcedure) {
    try {
      const parsed = JSON.parse(rawProcedure);
      if (Array.isArray(parsed)) {
        steps = parsed.map((s: unknown) =>
          typeof s === "string" ? s : typeof s === "object" && s !== null && "text" in s ? String((s as { text: string }).text) : String(s)
        );
      } else {
        steps = rawProcedure.split("\n").filter((l) => l.trim());
      }
    } catch {
      steps = rawProcedure.split("\n").filter((l) => l.trim());
    }
  }

  // Present allergens only
  const presentAllergens = (data.allergens ?? []).filter((a) =>
    ALLERGENS.includes(a as (typeof ALLERGENS)[number])
  );

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
            <Text style={styles.headerDocType}>Fiche technique</Text>
            <Text style={styles.headerDate}>Mise a jour : {monthYear}</Text>
          </View>
        </View>
        <View style={styles.headerLine} />

        {/* RECIPE TITLE + PHOTO */}
        <View style={styles.titlePhotoRow}>
          <View style={styles.titleBlock}>
            <Text style={styles.recipeName}>{data.recipeName}</Text>
            <View style={styles.badgeRow}>
              {categoryLabel && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{categoryLabel}</Text>
                </View>
              )}
              {yieldLabel && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{yieldLabel}</Text>
                </View>
              )}
              {portionsLabel && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{portionsLabel}</Text>
                </View>
              )}
            </View>
          </View>
          {data.photoUrl && (
            <View style={styles.photoBox}>
              {/* eslint-disable-next-line jsx-a11y/alt-text */}
              <Image src={data.photoUrl} style={styles.photo} />
            </View>
          )}
        </View>

        {/* KPI BANNER */}
        <View style={styles.kpiBanner}>
          <View style={styles.kpiBox}>
            <Text style={styles.kpiLabel}>Cout revient</Text>
            <Text style={[styles.kpiValue, { color: accent }]}>
              {fmtMoney(costPerPortion)}
            </Text>
          </View>
          <View style={styles.kpiBox}>
            <Text style={styles.kpiLabel}>Food cost</Text>
            <Text style={[styles.kpiValue, { color: foodCostColor(foodCostPct) }]}>
              {fmtPercent(foodCostPct)}
            </Text>
          </View>
          <View style={styles.kpiBox}>
            <Text style={styles.kpiLabel}>Prix de vente HT</Text>
            <Text style={[styles.kpiValue, { color: accent }]}>
              {fmtMoney(sellPrice)}
            </Text>
          </View>
          <View style={styles.kpiBox}>
            <Text style={styles.kpiLabel}>Marge brute</Text>
            <Text style={[styles.kpiValue, { color: accent }]}>
              {fmtMoney(margeBrute)}
            </Text>
          </View>
        </View>

        {/* INGREDIENTS TABLE */}
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitleText}>Ingredients</Text>
        </View>
        <View style={styles.tableHeader}>
          <Text style={[styles.th, styles.colIngredient]}>Ingredient</Text>
          <Text style={[styles.th, styles.colSupplier]}>Fournisseur</Text>
          <Text style={[styles.th, styles.colQty]}>Qte nette</Text>
          <Text style={[styles.th, styles.colPerte]}>Perte</Text>
        </View>
        {data.lines.map((line, idx) => {
          const [qStr, uStr] = formatLiquidQtyParts(line.qty, line.unit);
          const perteStr =
            line.rendement > 0 && line.rendement < 1
              ? `-${Math.round((1 - line.rendement) * 100)}%`
              : "--";
          const perteColor =
            line.rendement > 0 && line.rendement < 1 ? "#D97706" : MUTED;
          return (
            <View key={idx} style={[styles.row, idx % 2 === 1 ? styles.rowEven : {}]}>
              <View style={[styles.colIngredient, { flexDirection: "row", gap: 4 }]}>
                <Text>{line.name ?? "--"}</Text>
                {line.isSubRecipe && <Text style={styles.subRecipeBadge}>(S/R)</Text>}
              </View>
              <Text style={styles.colSupplier}>{line.supplier ?? "--"}</Text>
              <Text style={styles.colQty}>
                {qStr}{uStr ? ` ${uStr}` : ""}
              </Text>
              <Text style={[styles.colPerte, { color: perteColor }]}>{perteStr}</Text>
            </View>
          );
        })}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>TOTAL COUT MATIERE</Text>
          <Text style={styles.totalValue}>{fmtMoney(data.totalCost)}</Text>
        </View>

        {/* PROCEDURE */}
        {steps.length > 0 && (
          <View>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitleText}>Procede de preparation</Text>
            </View>
            {steps.map((step, idx) => (
              <View key={idx} style={styles.stepRow}>
                <View style={styles.stepCircle}>
                  <Text style={styles.stepNumber}>{idx + 1}</Text>
                </View>
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ALLERGENS */}
        {presentAllergens.length > 0 && (
          <View>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitleText}>Allergenes</Text>
            </View>
            <View style={styles.allergenRow}>
              {presentAllergens.map((a) => (
                <View
                  key={a}
                  style={[
                    styles.allergenBadge,
                    { backgroundColor: ALLERGEN_COLORS[a] ?? "#6B7280" },
                  ]}
                >
                  <Text style={styles.allergenBadgeText}>{a}</Text>
                </View>
              ))}
            </View>
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
