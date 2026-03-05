import React from "react";
import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";

export type MercurialeRow = {
  name: string;
  category: string;
  priceLabel: string;
  supplier: string | null;
  updatedAt: string | null;
  establishment: string | null;
  supplierRawId?: string | null;
};

export type MercurialePdfData = {
  rows: MercurialeRow[];
  groupBy: "category" | "supplier" | "alpha";
  establishment: string;
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
  page: { padding: 32, paddingBottom: 50, fontFamily: "Helvetica", fontSize: 10, color: TEXT, backgroundColor: BG },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16, paddingBottom: 10, borderBottomWidth: 2, borderBottomColor: ROUGE },
  logo: { width: 80, height: 40, objectFit: "contain" as const },
  logoFallback: { fontSize: 13, fontWeight: "bold", color: ROUGE },
  headerRight: { alignItems: "flex-end" },
  title: { fontSize: 16, fontWeight: "bold", color: ROUGE },
  subtitle: { fontSize: 8, color: MUTED, marginTop: 2 },
  groupHeader: { backgroundColor: SOFT, padding: "6 10", marginTop: 10, marginBottom: 4, borderRadius: 4 },
  groupTitle: { fontSize: 10, fontWeight: "bold", color: ROUGE, textTransform: "uppercase", letterSpacing: 0.5 },
  tableHeader: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: BORDER, paddingBottom: 4, marginBottom: 2 },
  tableHeaderText: { fontSize: 8, fontWeight: "bold", color: MUTED, textTransform: "uppercase" },
  row: { flexDirection: "row", paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: BORDER },
  rowAlt: { backgroundColor: "#F5F0E8" },
  colName: { flex: 3, fontSize: 9, fontWeight: "bold", color: TEXT },
  colPrice: { flex: 2, fontSize: 9, fontWeight: "bold", color: ROUGE, textAlign: "right" },
  colSupplier: { flex: 2, fontSize: 8, color: MUTED, textAlign: "center" },
  colDate: { flex: 2, fontSize: 8, color: MUTED, textAlign: "right" },
  footer: { position: "absolute", bottom: 20, left: 32, right: 32, flexDirection: "row", justifyContent: "space-between" },
  footerText: { fontSize: 7, color: MUTED },
});

const CAT_LABELS: Record<string, string> = {
  viande: "Viande", poisson: "Poisson", legume: "Légume", fromage: "Fromage",
  charcuterie: "Charcuterie", epicerie: "Épicerie", boisson: "Boisson",
  alcool: "Alcool", preparation: "Préparation", autre: "Autre",
};

const CAT_ORDER = ["cremerie","fromage","charcuterie","viande","maree","boisson","alcool","epicerie","legume","fruit","herbe","preparation","sauce","surgele","recette","emballage","autre"];

function groupRows(rows: MercurialeRow[], groupBy: "category" | "supplier" | "alpha") {
  const sorted = [...rows].sort((a, b) => {
    if (groupBy === "category") {
      const ai = CAT_ORDER.indexOf(a.category);
      const bi = CAT_ORDER.indexOf(b.category);
      if (ai !== bi) return ai - bi;
    }
    return a.name.localeCompare(b.name, "fr");
  });
  if (groupBy === "alpha") return { "A → Z": sorted };
  const map: Record<string, MercurialeRow[]> = {};
  for (const r of sorted) {
    const k = (groupBy === "category" ? CAT_LABELS[r.category] ?? r.category : r.supplier) ?? "—";
    if (!map[k]) map[k] = [];
    map[k].push(r);
  }
  if (groupBy === "supplier") return Object.fromEntries(Object.entries(map).sort(([a], [b]) => a.localeCompare(b, "fr")));
  return map;
}

export function MercurialePdfDocument({ data }: { data: MercurialePdfData }) {
  const grouped = groupRows(data.rows, data.groupBy);
  const estabLabel = data.establishment === "bellomio" ? "Bello Mio" : data.establishment === "piccola" ? "Piccola Mia" : "Tous établissements";

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          {data.logoBase64
            ? /* eslint-disable-next-line jsx-a11y/alt-text */
            <Image style={styles.logo} src={data.logoBase64} />
            : <Text style={styles.logoFallback}>MERCURIALE</Text>}
          <View style={styles.headerRight}>
            <Text style={styles.title}>Mercuriale des prix</Text>
            <Text style={styles.subtitle}>{estabLabel} · {data.exportedAt}</Text>
            <Text style={styles.subtitle}>{data.rows.length} ingrédients</Text>
          </View>
        </View>

        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderText, { flex: 3 }]}>Ingrédient</Text>
          <Text style={[styles.tableHeaderText, { flex: 2, textAlign: "right" }]}>Prix</Text>
          <Text style={[styles.tableHeaderText, { flex: 2, textAlign: "center" }]}>Fournisseur</Text>
          <Text style={[styles.tableHeaderText, { flex: 2, textAlign: "right" }]}>Màj</Text>
        </View>

        {Object.entries(grouped).map(([groupName, groupRows], gi) => (
          <View key={gi}>
            <View style={styles.groupHeader}>
              <Text style={styles.groupTitle}>{groupName} ({groupRows.length})</Text>
            </View>
            {groupRows.map((r, i) => (
              <View key={r.name + i} style={[styles.row, i % 2 === 1 ? styles.rowAlt : {}]}>
                <Text style={styles.colName}>{r.name}</Text>
                <Text style={styles.colPrice}>{r.priceLabel}</Text>
                <Text style={styles.colSupplier}>{r.supplier ?? "—"}</Text>
                <Text style={styles.colDate}>{r.updatedAt ?? "—"}</Text>
              </View>
            ))}
          </View>
        ))}

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>Mercuriale · {data.exportedAt}</Text>
          <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
