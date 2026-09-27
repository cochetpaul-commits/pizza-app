import React from "react";
import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";

export type CommandePdfLine = {
  name: string;
  qty: number;
  unit: string;
  sku: string | null;
  /** Quantité déjà rédigée (« 12 pots (2 colis) — colis 6 × 500 g ») : remplace qty + unit */
  texte?: string;
};

export type CommandePdfCategory = {
  label: string;
  color: string;
  items: CommandePdfLine[];
};

export type CommandePdfData = {
  supplierName: string;
  sessionDate: string;
  categories: CommandePdfCategory[];
  totalArticles: number;
  notes: string | null;
  logoBase64: string | null;
  exportedAt: string;
  etabName?: string;
  showSku?: boolean;
  /** Date et adresse de livraison */
  livraison?: { date: string | null; adresse: string | null };
  /** Numéro client chez ce fournisseur (Maël : 177 Bello Mio, 265 Piccola Mia) */
  numeroClient?: string | null;
  /** Prénom de la personne qui passe la commande */
  passeePar?: string | null;
  /** Pied de page (« Rupture ou question : groupe WhatsApp Bello Mio – Maël ») */
  pied?: string | null;
  /** Titre (« BON DE COMMANDE » par défaut, « PRÉCOMMANDE » pour la précommande du mercredi) */
  titre?: string;
};

const ACCENT = "#D4775A";
const BG = "#FAF7F2";
const TEXT = "#1A1A1A";
const MUTED = "#777777";
const BORDER = "#CBBFA8";

const s = StyleSheet.create({
  page: {
    padding: 32,
    paddingBottom: 50,
    fontFamily: "Helvetica",
    fontSize: 11,
    color: TEXT,
    backgroundColor: BG,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 2,
    borderBottomColor: ACCENT,
  },
  logo: { width: 90, height: 45, objectFit: "contain" as const },
  logoFallback: { fontSize: 14, fontWeight: "bold", color: ACCENT },
  headerRight: { alignItems: "flex-end" as const },
  title: { fontSize: 16, fontWeight: "bold", color: TEXT },
  subtitle: { fontSize: 10, color: MUTED, marginTop: 2 },

  catHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
    marginBottom: 4,
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  catDot: { width: 7, height: 7, borderRadius: 4 },
  catLabel: { fontSize: 10, fontWeight: "bold", letterSpacing: 1 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 3,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: "#E5DDD0",
  },
  rowSku: { width: 70, fontSize: 9, color: MUTED },
  rowName: { flex: 1, fontSize: 11 },
  rowQty: { width: 30, textAlign: "right" as const, fontSize: 11, fontWeight: "bold" },
  rowUnit: { width: 80, textAlign: "left" as const, fontSize: 10, color: MUTED, paddingLeft: 6 },
  rowTexte: { width: 190, textAlign: "right" as const, fontSize: 10, fontWeight: "bold" },

  footer: {
    position: "absolute",
    bottom: 20,
    left: 32,
    right: 32,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: MUTED,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 6,
  },
  notes: {
    marginTop: 16,
    padding: 10,
    backgroundColor: "#FFFFFF",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: BORDER,
    fontSize: 10,
    color: TEXT,
  },
  totalBar: {
    marginTop: 14,
    padding: "8px 12px",
    backgroundColor: ACCENT,
    borderRadius: 6,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  totalText: { fontSize: 12, fontWeight: "bold", color: "#FFFFFF" },
});

export function CommandePdfDocument({ data }: { data: CommandePdfData }) {
  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          <View>
            {data.logoBase64
              // eslint-disable-next-line jsx-a11y/alt-text
              ? <Image src={data.logoBase64} style={s.logo} />
              : <Text style={s.logoFallback}>iFratelli Group</Text>}
          </View>
          <View style={s.headerRight}>
            <Text style={s.title}>{data.titre ?? "BON DE COMMANDE"}</Text>
            <Text style={s.subtitle}>Fournisseur : {data.supplierName}</Text>
            {data.numeroClient ? <Text style={s.subtitle}>N° client : {data.numeroClient}</Text> : null}
            <Text style={s.subtitle}>Date : {data.sessionDate}</Text>
            {data.livraison?.date ? <Text style={[s.subtitle, { color: TEXT, fontWeight: "bold" }]}>Livraison : {data.livraison.date}</Text> : null}
            {data.livraison?.adresse ? <Text style={s.subtitle}>{data.livraison.adresse}</Text> : null}
            {data.passeePar ? <Text style={s.subtitle}>Commande passée par {data.passeePar}</Text> : null}
          </View>
        </View>

        {/* Categories + lines */}
        {data.categories.map((cat) => (
          <View key={cat.label} wrap={false}>
            <View style={s.catHeader}>
              <View style={[s.catDot, { backgroundColor: cat.color }]} />
              <Text style={s.catLabel}>{cat.label}</Text>
              <Text style={{ fontSize: 9, color: MUTED }}>({cat.items.length})</Text>
            </View>
            {cat.items.map((item, i) => (
              <View key={i} style={s.row}>
                {data.showSku ? <Text style={s.rowSku}>{item.sku ?? ""}</Text> : null}
                <Text style={s.rowName}>{item.name}</Text>
                {item.texte ? <Text style={s.rowTexte}>{item.texte}</Text> : <>
                  <Text style={s.rowQty}>{item.qty}</Text>
                  <Text style={s.rowUnit}>{item.unit}</Text>
                </>}
              </View>
            ))}
          </View>
        ))}

        {/* Total */}
        <View style={s.totalBar}>
          <Text style={s.totalText}>{data.totalArticles} article{data.totalArticles > 1 ? "s" : ""}</Text>
        </View>

        {/* Notes */}
        {data.notes && (
          <View style={s.notes}>
            <Text style={{ fontSize: 9, fontWeight: "bold", color: MUTED, marginBottom: 3 }}>NOTES</Text>
            <Text>{data.notes}</Text>
          </View>
        )}

        {data.pied ? (
          <View style={[s.notes, { marginTop: 10 }]}>
            <Text style={{ fontSize: 10, color: TEXT }}>{data.pied}</Text>
          </View>
        ) : null}

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text>{data.etabName ?? "iFratelli Group"}</Text>
          <Text>Export {data.exportedAt}</Text>
        </View>
      </Page>
    </Document>
  );
}
