/* eslint-disable jsx-a11y/alt-text */
import React from "react";
import { Document, Page, View, Text, Image, StyleSheet, Font } from "@react-pdf/renderer";
import { decouperProcede, grouperIngredients, quantite, type LigneFiche } from "@/lib/ficheTechnique";

/**
 * Fiche technique, nouveau modèle (25/11/2026, validé par Paul) : en-tête centré au logo iFratelli Group, deux
 * colonnes (ingrédients à gauche, procédé à droite), la couleur de la catégorie partout. Pas de référence, pas de
 * fournisseur, pas de perte, pas d'allergènes, pas d'établissement, fond blanc.
 */
export type FicheTechniquePdfData = {
  nom: string;
  categorie: string;
  couleur: string;
  portions: string | null;
  miseAJour: string;
  logo: string | null;
  lignes: LigneFiche[];
  etapes: string[];
};

const GRIS = "#8a857c", TEXTE = "#1a1a1a";
// Pas de césure : « DOLCEVALLE », « absorption » restent entiers
Font.registerHyphenationCallback((mot) => [mot]);
const alpha = (hex: string, a: number) => { const h = hex.replace("#", ""); const n = parseInt(h, 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };

const s = StyleSheet.create({
  page: { paddingTop: 28, paddingBottom: 52, paddingHorizontal: 32, fontFamily: "Helvetica", fontSize: 9.5, color: TEXTE, backgroundColor: "#ffffff" },
  entete: { alignItems: "center", marginBottom: 16 },
  logo: { width: 86, height: 58, objectFit: "contain", marginBottom: 6 },
  titre: { fontFamily: "Helvetica-Bold", fontSize: 24, textAlign: "center", marginBottom: 3 },
  sousTitre: { fontSize: 9, color: GRIS, textAlign: "center", marginBottom: 8 },
  badges: { flexDirection: "row", gap: 6, justifyContent: "center" },
  badge: { fontSize: 8.5, fontFamily: "Helvetica-Bold", paddingVertical: 3, paddingHorizontal: 9, borderRadius: 10 },
  colonnes: { flexDirection: "row", gap: 18 },
  colG: { width: "44%" },
  colD: { width: "56%" },
  titreSection: { fontFamily: "Helvetica-Bold", fontSize: 10, letterSpacing: 1, marginBottom: 4 },
  regle: { height: 1.2, marginBottom: 8 },
  tete: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 7 },
  th: { color: "#ffffff", fontFamily: "Helvetica-Bold", fontSize: 7.5, letterSpacing: 0.6 },
  ligne: { flexDirection: "row", paddingVertical: 4.5, paddingHorizontal: 7, alignItems: "flex-start" },
  cNom: { flex: 1, paddingRight: 6 },
  cQte: { width: 44, textAlign: "right", fontFamily: "Helvetica-Bold" },
  cU: { width: 30, textAlign: "left", paddingLeft: 5, color: GRIS },
  separateur: { paddingVertical: 3.5, paddingHorizontal: 7 },
  sepTexte: { color: "#ffffff", fontFamily: "Helvetica-Bold", fontSize: 8, letterSpacing: 0.6 },
  procede: { paddingLeft: 10 },
  phase: { fontFamily: "Helvetica-Bold", fontSize: 9.5, paddingVertical: 4, paddingHorizontal: 7, marginTop: 4, marginBottom: 5, borderRadius: 3 },
  etape: { flexDirection: "row", gap: 7, marginBottom: 4, alignItems: "flex-start" },
  pastille: { width: 16, height: 16, borderRadius: 4, alignItems: "center", justifyContent: "center" },
  pastilleN: { color: "#ffffff", fontFamily: "Helvetica-Bold", fontSize: 8 },
  etapeTexte: { flex: 1, paddingTop: 2 },
  vide: { color: GRIS, fontSize: 9, fontStyle: "italic" },
  pied: { position: "absolute", bottom: 22, left: 32, right: 32 },
  piedRegle: { height: 1, marginBottom: 5 },
  piedTexte: { flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: GRIS },
});

export function FicheTechniquePdf({ data }: { data: FicheTechniquePdfData }) {
  const c = data.couleur;
  // Une seule page A4 : au-delà d'un certain volume de texte, la fiche passe en corps plus petit
  const volume = data.etapes.join(" ").length + data.lignes.length * 45;
  const taille = volume > 2600 ? 7.8 : volume > 1700 ? 8.6 : 9.5;
  const groupes = grouperIngredients(data.lignes);
  const phases = decouperProcede(data.etapes);
  let rang = 0;
  return (
    <Document title={`Fiche technique · ${data.nom}`} author="iFratelli Group">
      <Page size="A4" style={[s.page, { fontSize: taille }]}>
        <View style={s.entete}>
          {data.logo ? <Image src={data.logo} style={s.logo} /> : <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 12, marginBottom: 6 }}>iFratelli Group</Text>}
          <Text style={s.titre}>{data.nom}</Text>
          <Text style={s.sousTitre}>Fiche technique · Mise à jour : {data.miseAJour}</Text>
          <View style={s.badges}>
            <Text style={[s.badge, { backgroundColor: alpha(c, 0.14), color: c }]}>{data.categorie}</Text>
            {data.portions && <Text style={[s.badge, { backgroundColor: alpha(c, 0.14), color: c }]}>{data.portions}</Text>}
          </View>
        </View>

        <View style={s.colonnes}>
          <View style={s.colG}>
            <Text style={[s.titreSection, { color: c }]}>INGRÉDIENTS</Text>
            <View style={[s.regle, { backgroundColor: c }]} />
            <View style={{ borderLeftWidth: 2.5, borderLeftColor: c }}>
              <View style={[s.tete, { backgroundColor: c }]}>
                <Text style={[s.th, s.cNom]}>INGRÉDIENT</Text>
                <Text style={[s.th, { width: 44, textAlign: "right" }]}>QTÉ</Text>
                <Text style={[s.th, { width: 30, paddingLeft: 5 }]}>UNITÉ</Text>
              </View>
              {groupes.map((g, gi) => (
                <View key={gi}>
                  {g.titre && <View style={[s.separateur, { backgroundColor: c }]}><Text style={s.sepTexte}>{g.titre.toUpperCase()}</Text></View>}
                  {g.lignes.map((l, i) => {
                    const { q, u } = quantite(l.qte, l.unite);
                    const fond = (rang++) % 2 === 1 ? alpha(c, 0.06) : "#ffffff";
                    return (
                      <View key={i} style={[s.ligne, { backgroundColor: fond }]} wrap={false}>
                        <Text style={s.cNom}>{l.nom}</Text>
                        <Text style={s.cQte}>{q}</Text>
                        <Text style={s.cU}>{u}</Text>
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          </View>

          <View style={s.colD}>
            <Text style={[s.titreSection, { color: c }]}>PROCÉDÉ DE PRÉPARATION</Text>
            <View style={[s.regle, { backgroundColor: c }]} />
            <View style={[s.procede, { borderLeftWidth: 2.5, borderLeftColor: c }]}>
              {phases.length === 0 && <Text style={s.vide}>Procédé à rédiger dans la fiche.</Text>}
              {phases.map((p, pi) => (
                <View key={pi}>
                  {p.phase && <Text style={[s.phase, { backgroundColor: alpha(c, 0.12), color: TEXTE }]} minPresenceAhead={30}>{p.phase}</Text>}
                  {p.etapes.map((e) => (
                    <View key={e.n} style={s.etape} wrap={false}>
                      <View style={[s.pastille, { backgroundColor: c }]}><Text style={s.pastilleN}>{e.n}</Text></View>
                      <Text style={s.etapeTexte}>{e.texte}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </View>
        </View>

        <View style={s.pied} fixed>
          <View style={[s.piedRegle, { backgroundColor: c }]} />
          <View style={s.piedTexte}>
            <Text>iFratelli Group</Text>
            <Text>Version {data.miseAJour}</Text>
            <Text>Confidentiel · usage interne</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
