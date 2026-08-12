import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

export type InventairePdfData = {
  etabNom: string;
  date: string;
  totalValeur: number;
  zones: {
    zone: string;
    value: number;
    categories: {
      cat: string;
      label: string;
      value: number;
      lines: { name: string; qty: number; unit: string; value: number }[];
    }[];
  }[];
};

const c = { accent: "#D4775A", green: "#4a6741", dark: "#1a1a1a", muted: "#888", bg: "#f8f5f0", border: "#e5ddd0" };

const s = StyleSheet.create({
  page: { padding: 36, fontSize: 9, fontFamily: "Helvetica", color: c.dark },
  header: { marginBottom: 16 },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  subtitle: { fontSize: 10, color: c.muted },
  summaryRow: { flexDirection: "row", gap: 24, marginBottom: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: c.border },
  summaryItem: { flexDirection: "column" },
  summaryLabel: { fontSize: 8, color: c.muted, textTransform: "uppercase", letterSpacing: 0.5 },
  summaryValue: { fontSize: 14, fontFamily: "Helvetica-Bold" },
  zoneHeader: { backgroundColor: c.accent, color: "#fff", padding: "8 12", borderRadius: 6, marginBottom: 8, marginTop: 12, flexDirection: "row", justifyContent: "space-between" },
  zoneTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.5 },
  zoneValue: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  catHeader: { backgroundColor: c.bg, padding: "5 10", borderRadius: 4, marginBottom: 4, marginTop: 6, flexDirection: "row", justifyContent: "space-between" },
  catTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.3 },
  catValue: { fontSize: 9, fontFamily: "Helvetica-Bold", color: c.muted },
  row: { flexDirection: "row", paddingVertical: 3, paddingHorizontal: 10, borderBottomWidth: 0.5, borderBottomColor: "#eee" },
  rowName: { flex: 1, fontSize: 9 },
  rowQty: { width: 50, textAlign: "right", fontFamily: "Helvetica-Bold", fontSize: 9 },
  rowUnit: { width: 30, textAlign: "center", fontSize: 8, color: c.muted },
  rowValue: { width: 60, textAlign: "right", fontSize: 9, color: c.green },
  footer: { position: "absolute", bottom: 24, left: 36, right: 36, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: c.muted },
});

const fmtMoney = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " \u20ac";
const fmtDate = (d: string) => { const dt = new Date(d + "T12:00:00"); return dt.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }); };

export function InventairePdfDocument(data: InventairePdfData) {
  const totalLines = data.zones.reduce((s, z) => s + z.categories.reduce((s2, cat) => s2 + cat.lines.length, 0), 0);

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <Text style={s.title}>Inventaire — {data.etabNom}</Text>
          <Text style={s.subtitle}>{fmtDate(data.date)}</Text>
        </View>

        <View style={s.summaryRow}>
          <View style={s.summaryItem}>
            <Text style={s.summaryLabel}>Valeur totale</Text>
            <Text style={{ ...s.summaryValue, color: c.accent }}>{fmtMoney(data.totalValeur)}</Text>
          </View>
          <View style={s.summaryItem}>
            <Text style={s.summaryLabel}>Articles comptes</Text>
            <Text style={s.summaryValue}>{totalLines}</Text>
          </View>
          <View style={s.summaryItem}>
            <Text style={s.summaryLabel}>Zones</Text>
            <Text style={s.summaryValue}>{data.zones.length}</Text>
          </View>
        </View>

        {data.zones.map((zone) => (
          <View key={zone.zone} wrap={false}>
            <View style={s.zoneHeader}>
              <Text style={s.zoneTitle}>{zone.zone}</Text>
              <Text style={s.zoneValue}>{fmtMoney(zone.value)}</Text>
            </View>
            {zone.categories.map((cat) => (
              <View key={cat.cat}>
                <View style={s.catHeader}>
                  <Text style={s.catTitle}>{cat.label}</Text>
                  <Text style={s.catValue}>{fmtMoney(cat.value)}</Text>
                </View>
                {/* Column headers */}
                <View style={{ ...s.row, borderBottomWidth: 0 }}>
                  <Text style={{ ...s.rowName, fontSize: 7, color: c.muted, fontFamily: "Helvetica-Bold" }}>PRODUIT</Text>
                  <Text style={{ ...s.rowQty, fontSize: 7, color: c.muted, fontFamily: "Helvetica-Bold" }}>QTE</Text>
                  <Text style={{ ...s.rowUnit, fontSize: 7, color: c.muted, fontFamily: "Helvetica-Bold" }}>UNITE</Text>
                  <Text style={{ ...s.rowValue, fontSize: 7, color: c.muted, fontFamily: "Helvetica-Bold" }}>VALEUR</Text>
                </View>
                {cat.lines.map((line, i) => (
                  <View key={i} style={s.row}>
                    <Text style={s.rowName}>{line.name}</Text>
                    <Text style={s.rowQty}>{line.qty}</Text>
                    <Text style={s.rowUnit}>{line.unit}</Text>
                    <Text style={s.rowValue}>{line.value > 0 ? fmtMoney(line.value) : "-"}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        ))}

        <View style={s.footer} fixed>
          <Text>{data.etabNom}</Text>
          <Text>Inventaire du {fmtDate(data.date)} — {fmtMoney(data.totalValeur)}</Text>
        </View>
      </Page>
    </Document>
  );
}
