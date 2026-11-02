import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

/**
 * Pourboires du mois pour le cabinet comptable (02/11/2026, demande de Paul) : le pot (carte, espèces, compléments),
 * la règle de répartition et la part nette de chaque salarié, prête à reporter sur les bulletins.
 */
export type LignePdf = { nom: string; prenom: string; matricule: string | null; poste: string | null; contrat: string | null; jours: number; part: number; ajustements: { montant: number; motif: string }[]; net: number };
export type PourboiresPdfData = {
  etablissement: { nom: string; siret: string | null; adresse: string | null };
  mois: string; aJour: string; provisoire: boolean;
  pot: { carte: number; especes: number; total: number; complements: { montant: number; motif: string }[] };
  totalJours: number; valeurJour: number; joursOuverture: number; soirsCagnotte: string[];
  lignes: LignePdf[];
};

const SOMBRE = "#1a1a1a", MUTED = "#6f6a61", BORD = "#ddd6c8", TEINTE = "#faf7f1", ACCENT = "#D4775A";
const s = StyleSheet.create({
  page: { padding: 32, paddingBottom: 48, fontFamily: "Helvetica", fontSize: 9.5, color: SOMBRE },
  entete: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 10, borderBottomWidth: 2, borderBottomColor: ACCENT, marginBottom: 14 },
  titre: { fontSize: 18, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.5 },
  sous: { fontSize: 9.5, color: MUTED, marginTop: 3 },
  etab: { fontSize: 11, fontFamily: "Helvetica-Bold", textAlign: "right" },
  etabSous: { fontSize: 8.5, color: MUTED, textAlign: "right", marginTop: 2 },
  provisoire: { marginBottom: 12, padding: 8, backgroundColor: "#fbf1e2", color: "#b7791f", fontFamily: "Helvetica-Bold", fontSize: 9.5, borderRadius: 4 },
  blocs: { flexDirection: "row", marginBottom: 14 },
  bloc: { flex: 1, borderWidth: 1, borderColor: BORD, borderRadius: 6, padding: 8, marginRight: 8 },
  blocDernier: { flex: 1, borderWidth: 1, borderColor: BORD, borderRadius: 6, padding: 8 },
  blocLib: { fontSize: 7.5, color: MUTED, textTransform: "uppercase", letterSpacing: 0.6 },
  blocVal: { fontSize: 14, fontFamily: "Helvetica-Bold", marginTop: 3 },
  blocDet: { fontSize: 8, color: MUTED, marginTop: 2 },
  intertitre: { fontSize: 8, color: MUTED, textTransform: "uppercase", letterSpacing: 0.8, fontFamily: "Helvetica-Bold", marginBottom: 5, marginTop: 4 },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: BORD, paddingVertical: 5 },
  th: { flexDirection: "row", backgroundColor: TEINTE, borderBottomWidth: 1, borderBottomColor: BORD, paddingVertical: 5 },
  thTxt: { fontSize: 7.5, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5, fontFamily: "Helvetica-Bold" },
  total: { flexDirection: "row", borderTopWidth: 1.5, borderTopColor: SOMBRE, paddingVertical: 6 },
  cNom: { width: "26%", paddingLeft: 4 }, cMat: { width: "10%" }, cPoste: { width: "16%" }, cJours: { width: "8%", textAlign: "right" },
  cPart: { width: "12%", textAlign: "right" }, cAj: { width: "16%", paddingLeft: 8 }, cNet: { width: "12%", textAlign: "right", paddingRight: 4 },
  gras: { fontFamily: "Helvetica-Bold" },
  regles: { marginTop: 14, padding: 10, backgroundColor: TEINTE, borderRadius: 6, fontSize: 8.5, color: MUTED, lineHeight: 1.45 },
  pied: { position: "absolute", bottom: 20, left: 32, right: 32, fontSize: 7.5, color: MUTED, flexDirection: "row", justifyContent: "space-between" },
});

const eur = (n: number) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/[  ]/g, " ")} €`;
const nb = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
const moisLong = (m: string) => new Date(`${m}-01T12:00:00`).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
const dateCourte = (j: string) => new Date(`${j}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
/** « le 26 octobre » ; « les 26 et 30 octobre » ; « les 2, 9 et 16 octobre » (même mois) */
const listeDates = (jours: string[]) => {
  if (jours.length === 1) return `le ${dateCourte(jours[0])}`;
  const memeMois = jours.every((j) => j.slice(0, 7) === jours[0].slice(0, 7));
  const parts = memeMois ? jours.map((j) => String(Number(j.slice(8, 10)))) : jours.map(dateCourte);
  const fin = memeMois ? ` ${new Date(`${jours[0]}T12:00:00`).toLocaleDateString("fr-FR", { month: "long" })}` : "";
  return `les ${parts.slice(0, -1).join(", ")} et ${parts[parts.length - 1]}${fin}`;
};

export function PourboiresPdfDocument({ data: d }: { data: PourboiresPdfData }) {
  const totalPart = d.lignes.reduce((t, l) => t + l.part, 0);
  const totalNet = d.lignes.reduce((t, l) => t + l.net, 0);
  const totalAj = d.lignes.reduce((t, l) => t + l.ajustements.reduce((a, x) => a + x.montant, 0), 0);
  const complements = d.pot.complements.reduce((t, c) => t + c.montant, 0);
  return (
    <Document title={`Pourboires ${moisLong(d.mois)} ${d.etablissement.nom}`}>
      <Page size="A4" style={s.page}>
        <View style={s.entete}>
          <View>
            <Text style={s.titre}>Pourboires du mois</Text>
            <Text style={s.sous}>{moisLong(d.mois).replace(/^./, (c) => c.toUpperCase())} · répartition pour la paie</Text>
          </View>
          <View>
            <Text style={s.etab}>{d.etablissement.nom}</Text>
            {d.etablissement.siret ? <Text style={s.etabSous}>SIRET {d.etablissement.siret}</Text> : null}
            {d.etablissement.adresse ? <Text style={s.etabSous}>{d.etablissement.adresse}</Text> : null}
          </View>
        </View>

        {d.provisoire && <Text style={s.provisoire}>Document provisoire : le mois n&apos;est pas terminé, chiffres arrêtés au {dateCourte(d.aJour)}.</Text>}

        <View style={s.blocs}>
          <View style={s.bloc}>
            <Text style={s.blocLib}>Pot du mois</Text>
            <Text style={s.blocVal}>{eur(d.pot.total)}</Text>
            <Text style={s.blocDet}>carte {eur(d.pot.carte)} · espèces {eur(d.pot.especes)}</Text>
          </View>
          <View style={s.bloc}>
            <Text style={s.blocLib}>Jours comptés</Text>
            <Text style={s.blocVal}>{nb(d.totalJours)}</Text>
            <Text style={s.blocDet}>{d.lignes.length} salarié{d.lignes.length > 1 ? "s" : ""} · {d.joursOuverture} jours d&apos;ouverture</Text>
          </View>
          <View style={s.blocDernier}>
            <Text style={s.blocLib}>Valeur d&apos;un jour</Text>
            <Text style={s.blocVal}>{eur(d.valeurJour)}</Text>
            <Text style={s.blocDet}>pot ÷ jours comptés</Text>
          </View>
        </View>

        <Text style={s.intertitre}>Composition du pot</Text>
        <View style={{ marginBottom: 12 }}>
          <View style={s.tr}><Text style={{ width: "75%", paddingLeft: 4 }}>Pourboires carte, clôtures de caisse (ticket Z du terminal)</Text><Text style={{ width: "25%", textAlign: "right", paddingRight: 4 }}>{eur(Math.round((d.pot.carte - complements) * 100) / 100)}</Text></View>
          {d.pot.complements.map((c, i) => (
            <View key={i} style={s.tr}><Text style={{ width: "75%", paddingLeft: 4 }}>Pourboires carte, complément : {c.motif}</Text><Text style={{ width: "25%", textAlign: "right", paddingRight: 4 }}>{eur(c.montant)}</Text></View>
          ))}
          <View style={s.tr}><Text style={{ width: "75%", paddingLeft: 4 }}>Pourboires espèces, cagnotte comptée{d.soirsCagnotte.length ? ` ${listeDates(d.soirsCagnotte)}` : ""}</Text><Text style={{ width: "25%", textAlign: "right", paddingRight: 4 }}>{eur(d.pot.especes)}</Text></View>
          <View style={s.total}><Text style={[{ width: "75%", paddingLeft: 4 }, s.gras]}>Total à répartir</Text><Text style={[{ width: "25%", textAlign: "right", paddingRight: 4 }, s.gras]}>{eur(d.pot.total)}</Text></View>
        </View>

        <Text style={s.intertitre}>Répartition par salarié</Text>
        <View style={s.th} fixed>
          <Text style={[s.thTxt, s.cNom]}>Salarié</Text><Text style={[s.thTxt, s.cMat]}>Matricule</Text><Text style={[s.thTxt, s.cPoste]}>Poste</Text>
          <Text style={[s.thTxt, s.cJours]}>Jours</Text><Text style={[s.thTxt, s.cPart]}>Part</Text><Text style={[s.thTxt, s.cAj]}>Ajustements</Text><Text style={[s.thTxt, s.cNet]}>Net</Text>
        </View>
        {d.lignes.map((l, i) => (
          <View key={i} style={s.tr} wrap={false}>
            <Text style={[s.cNom, s.gras]}>{l.nom.toUpperCase()} {l.prenom}{l.contrat === "extra" ? " (extra)" : ""}</Text>
            <Text style={[s.cMat, { color: MUTED }]}>{l.matricule ?? ""}</Text>
            <Text style={[s.cPoste, { color: MUTED }]}>{l.poste ?? ""}</Text>
            <Text style={s.cJours}>{nb(l.jours)}</Text>
            <Text style={s.cPart}>{eur(l.part)}</Text>
            <Text style={[s.cAj, { fontSize: 8 }]}>{l.ajustements.map((a) => `${a.motif} ${a.montant > 0 ? "+" : ""}${eur(a.montant)}`).join("\n")}</Text>
            <Text style={[s.cNet, s.gras]}>{eur(l.net)}</Text>
          </View>
        ))}
        <View style={s.total} wrap={false}>
          <Text style={[s.cNom, s.gras]}>Total</Text><Text style={s.cMat} /><Text style={s.cPoste} />
          <Text style={[s.cJours, s.gras]}>{nb(d.totalJours)}</Text><Text style={[s.cPart, s.gras]}>{eur(totalPart)}</Text>
          <Text style={[s.cAj, s.gras]}>{Math.abs(totalAj) >= 0.005 ? `${totalAj > 0 ? "+" : ""}${eur(totalAj)}` : ""}</Text><Text style={[s.cNet, s.gras]}>{eur(totalNet)}</Text>
        </View>

        <View style={s.regles} wrap={false}>
          <Text style={[s.gras, { color: SOMBRE, marginBottom: 3 }]}>Règle de répartition</Text>
          <Text>Part = pot du mois ÷ total des jours comptés de l&apos;équipe × jours comptés du salarié. Un jour travaillé compte 1 ; un seul service dans la journée compte 0,5 (deux services, ou un service de 7 h et plus, comptent 1). Les jours viennent du planning de l&apos;équipe ; la direction ne participe pas au pot.</Text>
          <Text style={{ marginTop: 3 }}>Net = part + ajustements (acompte déjà versé à déduire, report du mois précédent). Les arrondis au centime peuvent faire varier le total de quelques centimes.</Text>
        </View>

        <View style={s.pied} fixed>
          <Text>{d.etablissement.nom} · pourboires {moisLong(d.mois)}</Text>
          <Text>Généré le {new Date().toLocaleDateString("fr-FR")}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
