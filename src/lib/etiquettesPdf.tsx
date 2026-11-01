import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { PateResult } from "@/lib/pateEngine";
import { formatG, lignesPesee, nomPhase, textePaton } from "@/lib/pateAffichage";

/**
 * Étiquettes de mise en place de la veille (01/11/2026) : une étiquette par contenant, à coller sur le bac.
 * Biga : farine, eau, levure. Pâte finale : farine, sel, eau de départ avec le miel, eau de bassinage.
 * Gros chiffres, lisibles avec les mains farinées ; deux étiquettes par page A4, à découper.
 */
export type EtiquettesData = { nom: string; date: string; resultat: PateResult; etablissement?: string | null };

const styles = StyleSheet.create({
  page: { padding: 24, fontFamily: "Helvetica", color: "#1a1a1a", backgroundColor: "#ffffff" },
  etiquette: { borderWidth: 1.5, borderColor: "#1a1a1a", borderStyle: "dashed", borderRadius: 10, padding: 18, marginBottom: 18 },
  entete: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 10, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: "#1a1a1a" },
  contenant: { fontSize: 30, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 1 },
  recette: { fontSize: 11, color: "#555", marginTop: 2 },
  droite: { alignItems: "flex-end" },
  date: { fontSize: 14, fontFamily: "Helvetica-Bold" },
  patons: { fontSize: 11, color: "#555", marginTop: 2 },
  ligne: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: "#cfc6b8" },
  libelle: { fontSize: 16 },
  note: { fontSize: 10, color: "#777" },
  grammes: { fontSize: 24, fontFamily: "Helvetica-Bold" },
  pied: { marginTop: 10, fontSize: 9, color: "#777" },
  pageTitre: { fontSize: 9, color: "#777", marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 },
});

export function EtiquettesPdfDocument({ data }: { data: EtiquettesData }) {
  const r = data.resultat;
  const dateLisible = new Date(`${data.date}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const contenants = r.phases.map((ph) => ({ titre: nomPhase(ph, r.phases.length), lignes: lignesPesee(ph), total: lignesPesee(ph).reduce((t, l) => t + l.grammes, 0) }));
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.pageTitre}>Mise en place de la veille · {data.etablissement ?? "Bello Mio"} · {r.summary.nbPatons} pâtons, {textePaton(r)}</Text>
        {contenants.map((c) => (
          <View key={c.titre} style={styles.etiquette} wrap={false}>
            <View style={styles.entete}>
              <View>
                <Text style={styles.contenant}>{c.titre}</Text>
                <Text style={styles.recette}>{data.nom}</Text>
              </View>
              <View style={styles.droite}>
                <Text style={styles.date}>{dateLisible}</Text>
                <Text style={styles.patons}>{r.summary.nbPatons} pâtons · {formatG(c.total)} dans ce contenant</Text>
              </View>
            </View>
            {c.lignes.map((l) => (
              <View key={l.libelle} style={styles.ligne}>
                <View>
                  <Text style={styles.libelle}>{l.libelle}</Text>
                  {l.note ? <Text style={styles.note}>{l.note}</Text> : null}
                </View>
                <Text style={styles.grammes}>{formatG(l.grammes, l.precis)}</Text>
              </View>
            ))}
            <Text style={styles.pied}>Imprimé le {new Date().toLocaleDateString("fr-FR")}</Text>
          </View>
        ))}
      </Page>
    </Document>
  );
}
