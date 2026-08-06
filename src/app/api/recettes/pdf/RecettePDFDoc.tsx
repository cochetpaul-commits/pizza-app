import React from "react";
import { Document, Page, View, Text, StyleSheet, Font } from "@react-pdf/renderer";

Font.registerHyphenationCallback((word) => [word]);

const c = {
  accent: "#D4775A", green: "#4a6741", bordeaux: "#8B1A1A",
  text: "#1a1a1a", muted: "#888", light: "#bbb",
  border: "#e0d8ce", bg: "#faf8f5", white: "#fff",
};

const s = StyleSheet.create({
  page: { padding: 32, fontFamily: "Helvetica", fontSize: 10, color: c.text, backgroundColor: c.white },
  header: { marginBottom: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: c.border },
  title: { fontSize: 22, fontWeight: "bold", fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.5 },
  subtitle: { fontSize: 10, color: c.muted, marginTop: 4 },
  badge: { fontSize: 8, fontWeight: "bold", fontFamily: "Helvetica-Bold", padding: "2 8", borderRadius: 4, textTransform: "uppercase", letterSpacing: 0.5 },
  section: { fontSize: 9, fontWeight: "bold", fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 1, color: c.muted, marginBottom: 8, marginTop: 16 },
  card: { backgroundColor: c.bg, borderRadius: 8, padding: 12, marginBottom: 10, borderWidth: 0.5, borderColor: c.border },
  row: { flexDirection: "row", paddingVertical: 4, borderBottomWidth: 0.3, borderBottomColor: "#eee" },
  kpiRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  kpi: { flex: 1, backgroundColor: c.bg, borderRadius: 6, padding: 10, borderWidth: 0.5, borderColor: c.border, alignItems: "center" as const },
  kpiLabel: { fontSize: 7, fontWeight: "bold", fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.5, color: c.muted, marginBottom: 3 },
  kpiVal: { fontSize: 16, fontWeight: "bold", fontFamily: "Helvetica-Bold" },
});

function fmtMoney(n: number) {
  return n.toFixed(2).replace(".", ",");
}

type RecipeData = {
  name: string;
  category: string;
  portions: number;
  ballWeightG: number | null;
  doughName: string | null;
  totalCost: number;
  totalWeightG: number;
  sellPrice: number | null;
  vatRate: number;
  marginRate: number;
  lines: { name: string; qty: number; unit: string; stage: string; cost: number | null }[];
  steps: string[];
  notes: string | null;
};

export function RecettePDFDoc(data: RecipeData) {
  const preLines = data.lines.filter(l => l.stage === "pre");
  const postLines = data.lines.filter(l => l.stage === "post");
  const costPerPortion = data.portions > 0 ? data.totalCost / data.portions : data.totalCost;
  const pricePerKg = data.totalWeightG > 0 ? (data.totalCost / data.totalWeightG) * 1000 : 0;
  const weightPerPortion = data.portions > 0 && data.totalWeightG > 0 ? Math.round(data.totalWeightG / data.portions) : 0;
  const sellTTC = data.sellPrice ? data.sellPrice * (1 + data.vatRate) : null;
  const marge = sellTTC && costPerPortion > 0 ? data.sellPrice! - costPerPortion : null;
  const foodCost = data.sellPrice && costPerPortion > 0 ? (costPerPortion / data.sellPrice) * 100 : null;

  const renderLines = (lines: typeof data.lines, label: string) => {
    if (lines.length === 0) return null;
    return (
      <View>
        <Text style={s.section}>{label}</Text>
        <View style={s.card}>
          {/* Header */}
          <View style={{ ...s.row, borderBottomWidth: 0.5, borderBottomColor: c.border, paddingBottom: 4, marginBottom: 4 }}>
            <Text style={{ flex: 3, fontSize: 8, fontFamily: "Helvetica-Bold", color: c.muted }}>INGREDIENT</Text>
            <Text style={{ width: 50, fontSize: 8, fontFamily: "Helvetica-Bold", color: c.muted, textAlign: "right" }}>QTE</Text>
            <Text style={{ width: 30, fontSize: 8, fontFamily: "Helvetica-Bold", color: c.muted, textAlign: "right" }}>UNITE</Text>
            <Text style={{ width: 50, fontSize: 8, fontFamily: "Helvetica-Bold", color: c.muted, textAlign: "right" }}>COUT</Text>
          </View>
          {lines.map((l, i) => (
            <View key={i} style={{ ...s.row, backgroundColor: i % 2 === 0 ? c.white : c.bg }}>
              <Text style={{ flex: 3, fontSize: 10 }}>{l.name}</Text>
              <Text style={{ width: 50, fontSize: 10, textAlign: "right", fontFamily: "Helvetica-Bold" }}>
                {l.unit === "g" && l.qty >= 1000 ? `${(l.qty / 1000).toFixed(2)}` : l.qty % 1 === 0 ? String(l.qty) : l.qty.toFixed(1)}
              </Text>
              <Text style={{ width: 30, fontSize: 9, textAlign: "right", color: c.muted }}>
                {l.unit === "g" && l.qty >= 1000 ? "kg" : l.unit}
              </Text>
              <Text style={{ width: 50, fontSize: 9, textAlign: "right", color: c.bordeaux }}>
                {l.cost != null ? `${fmtMoney(l.cost)}\u20AC` : "-"}
              </Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
            <View>
              <Text style={s.title}>{data.name}</Text>
              <Text style={s.subtitle}>
                {data.category.toUpperCase()}
                {data.portions > 1 ? ` · ${data.portions} portions` : ""}
                {data.doughName ? ` · Paton: ${data.doughName}` : ""}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" as const }}>
              <Text style={{ ...s.badge, backgroundColor: `${c.accent}20`, color: c.accent }}>Fiche technique</Text>
            </View>
          </View>
        </View>

        {/* KPIs */}
        <View style={s.kpiRow}>
          <View style={s.kpi}>
            <Text style={s.kpiLabel}>Cout {data.portions > 1 ? "/ portion" : "total"}</Text>
            <Text style={{ ...s.kpiVal, color: c.bordeaux }}>{fmtMoney(costPerPortion)}{"\u20AC"}</Text>
          </View>
          {sellTTC != null && (
            <View style={s.kpi}>
              <Text style={s.kpiLabel}>Prix vente TTC</Text>
              <Text style={{ ...s.kpiVal, color: c.text }}>{fmtMoney(sellTTC)}{"\u20AC"}</Text>
            </View>
          )}
          {foodCost != null && (
            <View style={s.kpi}>
              <Text style={s.kpiLabel}>Food cost</Text>
              <Text style={{ ...s.kpiVal, color: foodCost > 30 ? "#DC2626" : c.green }}>{foodCost.toFixed(0)}%</Text>
            </View>
          )}
          {marge != null && (
            <View style={s.kpi}>
              <Text style={s.kpiLabel}>Marge brute</Text>
              <Text style={{ ...s.kpiVal, color: c.green }}>{fmtMoney(marge)}{"\u20AC"}</Text>
            </View>
          )}
        </View>

        {/* Poids */}
        {data.totalWeightG > 0 && (
          <View style={{ flexDirection: "row", gap: 16, marginBottom: 12, justifyContent: "center" }}>
            <Text style={{ fontSize: 9, color: c.muted }}>
              Poids : <Text style={{ fontFamily: "Helvetica-Bold", color: c.text }}>{data.totalWeightG >= 1000 ? `${(data.totalWeightG / 1000).toFixed(2)} kg` : `${Math.round(data.totalWeightG)} g`}</Text>
            </Text>
            {pricePerKg > 0 && (
              <Text style={{ fontSize: 9, color: c.muted }}>
                Prix/kg : <Text style={{ fontFamily: "Helvetica-Bold", color: c.bordeaux }}>{fmtMoney(pricePerKg)}{"\u20AC"}</Text>
              </Text>
            )}
            {weightPerPortion > 0 && data.portions > 1 && (
              <Text style={{ fontSize: 9, color: c.muted }}>
                Poids/portion : <Text style={{ fontFamily: "Helvetica-Bold", color: c.text }}>{weightPerPortion}g</Text>
              </Text>
            )}
          </View>
        )}

        {/* Ingredients */}
        {renderLines(preLines.length > 0 ? preLines : data.lines, preLines.length > 0 ? "Ingredients — Avant cuisson" : "Ingredients")}
        {postLines.length > 0 && renderLines(postLines, "Ingredients — Apres cuisson")}

        {/* Etapes */}
        {data.steps.length > 0 && (
          <View>
            <Text style={s.section}>Preparation</Text>
            <View style={s.card}>
              {data.steps.map((step, i) => (
                <View key={i} style={{ flexDirection: "row", gap: 8, paddingVertical: 4, borderBottomWidth: i < data.steps.length - 1 ? 0.3 : 0, borderBottomColor: "#eee" }}>
                  <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: `${c.accent}20`, alignItems: "center" as const, justifyContent: "center" as const }}>
                    <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: c.accent }}>{i + 1}</Text>
                  </View>
                  <Text style={{ flex: 1, fontSize: 10, lineHeight: 1.5 }}>{step}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Notes */}
        {data.notes && (
          <View>
            <Text style={s.section}>Notes</Text>
            <View style={s.card}>
              <Text style={{ fontSize: 10, lineHeight: 1.5, color: c.text }}>{data.notes}</Text>
            </View>
          </View>
        )}

        {/* Footer */}
        <View style={{ position: "absolute", bottom: 20, left: 32, right: 32, flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ fontSize: 7, color: c.light }}>iFratelli Group · Fiche technique</Text>
          <Text style={{ fontSize: 7, color: c.light }}>{new Date().toLocaleDateString("fr-FR")}</Text>
        </View>
      </Page>
    </Document>
  );
}
