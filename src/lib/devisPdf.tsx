import React from "react";
import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";

export type DevisPdfData = {
  numero: string;
  dateEmission: string;
  dateValidite: string | null;
  objet: string | null;
  clientNom: string;
  clientEmail: string | null;
  clientTel: string | null;
  lignes: { description: string; quantite: number; unite: string; prixUnitaireHt: number; totalHt: number }[];
  totalHt: number;
  tvaRate: number;
  totalTtc: number;
  acomptePct: number;
  conditions: string | null;
  logoBase64: string | null;
};

const GOLD = "#e6c428";
const GOLD_LIGHT = "#f8edb0";
const TEXT_DARK = "#1a1a1a";
const TEXT_MUTED = "#666";
const BORDER = "#ddd6c8";

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: TEXT_DARK },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 30 },
  logo: { width: 120, height: 60, objectFit: "contain" },
  companyBlock: { textAlign: "right", fontSize: 8, color: TEXT_MUTED, lineHeight: 1.5 },
  title: { fontSize: 22, fontFamily: "Helvetica-Bold", color: GOLD, marginBottom: 16, textTransform: "uppercase", letterSpacing: 2 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 20 },
  metaBox: { width: "48%", padding: 12, borderRadius: 6, border: `1 solid ${BORDER}`, backgroundColor: "#faf7f2" },
  metaLabel: { fontSize: 8, fontFamily: "Helvetica-Bold", color: GOLD, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
  metaValue: { fontSize: 10, lineHeight: 1.5 },
  tableHeader: { flexDirection: "row", backgroundColor: GOLD, borderRadius: 4, padding: "6 8", marginBottom: 2 },
  tableHeaderCell: { fontFamily: "Helvetica-Bold", fontSize: 8, color: "#fff", textTransform: "uppercase", letterSpacing: 0.5 },
  tableRow: { flexDirection: "row", padding: "6 8", borderBottom: `0.5 solid ${BORDER}` },
  tableCell: { fontSize: 9 },
  totalsBox: { marginTop: 12, alignSelf: "flex-end", width: 220, padding: 12, borderRadius: 6, border: `1 solid ${GOLD_LIGHT}`, backgroundColor: "#fffdf5" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  totalLabel: { fontSize: 9, color: TEXT_MUTED },
  totalValue: { fontSize: 9, fontFamily: "Helvetica-Bold" },
  grandTotalRow: { flexDirection: "row", justifyContent: "space-between", paddingTop: 6, marginTop: 4, borderTop: `1 solid ${GOLD}` },
  grandTotalLabel: { fontSize: 12, fontFamily: "Helvetica-Bold", color: GOLD },
  grandTotalValue: { fontSize: 12, fontFamily: "Helvetica-Bold", color: GOLD },
  acompteBox: { marginTop: 16, padding: 10, borderRadius: 6, backgroundColor: GOLD_LIGHT },
  acompteText: { fontSize: 10, fontFamily: "Helvetica-Bold", color: GOLD, textAlign: "center" },
  conditionsTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", color: GOLD, marginTop: 24, marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 },
  conditionsText: { fontSize: 8, color: TEXT_MUTED, lineHeight: 1.6 },
  footer: { position: "absolute", bottom: 30, left: 40, right: 40, textAlign: "center", fontSize: 7, color: TEXT_MUTED, borderTop: `0.5 solid ${BORDER}`, paddingTop: 8 },
});

export function DevisPdfDocument(props: DevisPdfData) {
  const { numero, dateEmission, dateValidite, objet, clientNom, clientEmail, clientTel, lignes, totalHt, tvaRate, totalTtc, acomptePct, conditions, logoBase64 } = props;
  const acompte = totalTtc * (acomptePct / 100);
  const tvaAmount = totalTtc - totalHt;

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          <View>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            {logoBase64 ? <Image src={logoBase64} style={s.logo} /> : <Text style={{ fontSize: 16, fontFamily: "Helvetica-Bold", color: GOLD }}>Piccola Mia</Text>}
          </View>
          <View style={s.companyBlock}>
            <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 10, color: TEXT_DARK }}>SARL iFratelli Group</Text>
            <Text>SIRET : 123 456 789 00012</Text>
            <Text>12 rue de la Paix, 75002 Paris</Text>
            <Text>contact@piccolamia.fr</Text>
          </View>
        </View>

        {/* Title */}
        <Text style={s.title}>Devis {numero}</Text>

        {/* Meta */}
        <View style={s.metaRow}>
          <View style={s.metaBox}>
            <Text style={s.metaLabel}>Client</Text>
            <Text style={s.metaValue}>{clientNom}</Text>
            {clientEmail && <Text style={{ fontSize: 9, color: TEXT_MUTED }}>{clientEmail}</Text>}
            {clientTel && <Text style={{ fontSize: 9, color: TEXT_MUTED }}>{clientTel}</Text>}
          </View>
          <View style={s.metaBox}>
            <Text style={s.metaLabel}>Informations</Text>
            <Text style={s.metaValue}>Date : {dateEmission}</Text>
            {dateValidite && <Text style={s.metaValue}>Valide jusqu&apos;au : {dateValidite}</Text>}
            {objet && <Text style={{ ...s.metaValue, marginTop: 4, fontFamily: "Helvetica-Bold" }}>{objet}</Text>}
          </View>
        </View>

        {/* Table */}
        <View style={s.tableHeader}>
          <Text style={{ ...s.tableHeaderCell, width: "45%" }}>Description</Text>
          <Text style={{ ...s.tableHeaderCell, width: "12%", textAlign: "right" }}>Qte</Text>
          <Text style={{ ...s.tableHeaderCell, width: "13%" }}>Unite</Text>
          <Text style={{ ...s.tableHeaderCell, width: "15%", textAlign: "right" }}>PU HT</Text>
          <Text style={{ ...s.tableHeaderCell, width: "15%", textAlign: "right" }}>Total HT</Text>
        </View>
        {lignes.map((l, i) => (
          <View key={i} style={{ ...s.tableRow, backgroundColor: i % 2 === 0 ? "#fff" : "#faf7f2" }}>
            <Text style={{ ...s.tableCell, width: "45%" }}>{l.description}</Text>
            <Text style={{ ...s.tableCell, width: "12%", textAlign: "right" }}>{l.quantite}</Text>
            <Text style={{ ...s.tableCell, width: "13%" }}>{l.unite}</Text>
            <Text style={{ ...s.tableCell, width: "15%", textAlign: "right" }}>{l.prixUnitaireHt.toFixed(2)} €</Text>
            <Text style={{ ...s.tableCell, width: "15%", textAlign: "right", fontFamily: "Helvetica-Bold" }}>{l.totalHt.toFixed(2)} €</Text>
          </View>
        ))}

        {/* Totals */}
        <View style={s.totalsBox}>
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Total HT</Text>
            <Text style={s.totalValue}>{totalHt.toFixed(2)} €</Text>
          </View>
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>TVA ({tvaRate}%)</Text>
            <Text style={s.totalValue}>{tvaAmount.toFixed(2)} €</Text>
          </View>
          <View style={s.grandTotalRow}>
            <Text style={s.grandTotalLabel}>Total TTC</Text>
            <Text style={s.grandTotalValue}>{totalTtc.toFixed(2)} €</Text>
          </View>
        </View>

        {/* Acompte */}
        {acomptePct > 0 && (
          <View style={s.acompteBox}>
            <Text style={s.acompteText}>
              Acompte de {acomptePct}% a la commande : {acompte.toFixed(2)} €
            </Text>
          </View>
        )}

        {/* Conditions */}
        {conditions && (
          <View>
            <Text style={s.conditionsTitle}>Conditions generales</Text>
            <Text style={s.conditionsText}>{conditions}</Text>
          </View>
        )}

        {/* Footer */}
        <View style={s.footer}>
          <Text>SARL iFratelli Group - SIRET 123 456 789 00012 - TVA FR12345678900 - 12 rue de la Paix, 75002 Paris</Text>
        </View>
      </Page>
    </Document>
  );
}
