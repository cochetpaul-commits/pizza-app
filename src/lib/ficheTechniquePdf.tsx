/* eslint-disable jsx-a11y/alt-text */
import React from "react";
import { Document, Page, View, Text, Image, StyleSheet, Font } from "@react-pdf/renderer";
import { decouperProcede, grouperIngredients, quantite, type LigneFiche } from "@/lib/ficheTechnique";

/**
 * Fiche technique (brief du 26/11/2026, maquette « FT-Tiramisu-Final ») : une page A4 sur fond crème, le logo
 * iFratelli en filigrane, titre serif à la couleur de la catégorie, deux pastilles (catégorie, portions), deux
 * colonnes : ingrédients en tableaux par groupe à gauche, instructions par phase à droite. Pas de référence, de
 * fournisseur, de perte, d'allergènes ni d'établissement.
 */
export type FicheTechniquePdfData = {
  nom: string;
  categorie: string;
  couleur: string;
  /** Teinte claire de la catégorie (fond alterné, badge portions, onglets de phase) */
  clair: string;
  portions: string | null;
  miseAJour: string;
  logo: string | null;
  lignes: LigneFiche[];
  etapes: string[];
  /** Bloc « À retenir » (notes de la fiche), s'il y en a */
  notes?: string | null;
};

const CREME = "#f5f0e8", TEXTE = "#2a2a2a", FILET = "#d4cbba", GRIS = "#999999";
// Pas de césure : « DOLCEVALLE », « absorption » restent entiers
Font.registerHyphenationCallback((mot) => [mot]);

const s = StyleSheet.create({
  page: { paddingTop: 30, paddingBottom: 46, paddingHorizontal: 34, fontFamily: "Helvetica", fontSize: 9.5, color: TEXTE, backgroundColor: CREME },
  filigrane: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  filigraneImg: { width: 400, height: 300, objectFit: "contain", opacity: 0.035 },
  entete: { alignItems: "center", marginBottom: 18 },
  titre: { fontFamily: "Times-Bold", textAlign: "center", marginBottom: 8 },
  badges: { flexDirection: "row", gap: 6, justifyContent: "center" },
  badge: { fontSize: 8.5, fontFamily: "Helvetica-Bold", paddingTop: 4.5, paddingBottom: 2.5, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1 },
  colonnes: { flexDirection: "row", gap: 20 },
  colG: { width: "43%" },
  colD: { width: "57%" },
  titreSection: { fontFamily: "Times-Bold", fontSize: 14, color: TEXTE, marginBottom: 7 },
  groupe: { marginBottom: 9 },
  groupeTete: { paddingVertical: 4, paddingHorizontal: 7, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  groupeTitre: { color: "#ffffff", fontFamily: "Helvetica-Bold", fontSize: 8.5 },
  tableau: { borderWidth: 0.75, borderTopWidth: 0, borderColor: FILET, borderBottomLeftRadius: 4, borderBottomRightRadius: 4, overflow: "hidden" },
  th: { flexDirection: "row", paddingVertical: 3, paddingHorizontal: 7, borderBottomWidth: 0.75, borderBottomColor: FILET, backgroundColor: "#ffffff" },
  thTxt: { fontSize: 6.8, fontFamily: "Helvetica-Bold", color: GRIS, letterSpacing: 0.5 },
  ligne: { flexDirection: "row", paddingVertical: 4, paddingHorizontal: 7, alignItems: "flex-start", borderBottomWidth: 0.8, borderBottomColor: FILET },
  cNom: { flex: 1, paddingRight: 6, fontFamily: "Helvetica-Bold" },
  cQte: { width: 62, textAlign: "right" },
  retenir: { marginTop: 4, backgroundColor: "#ffffff", borderWidth: 0.75, borderColor: FILET, borderLeftWidth: 2.5, borderRadius: 4, paddingVertical: 6, paddingHorizontal: 8 },
  retenirTitre: { fontFamily: "Helvetica-Bold", marginBottom: 3 },
  phase: { alignSelf: "flex-start", fontFamily: "Helvetica-Bold", fontSize: 9.5, paddingVertical: 3.5, paddingLeft: 8, paddingRight: 12, marginTop: 4, marginBottom: 6, borderLeftWidth: 2.5, borderTopRightRadius: 6, borderBottomRightRadius: 6 },
  etape: { flexDirection: "row", gap: 7, marginBottom: 5.7, alignItems: "flex-start" },
  pastille: { width: 15, height: 15, borderRadius: 3, alignItems: "center", justifyContent: "center" },
  pastilleN: { color: "#ffffff", fontFamily: "Helvetica-Bold", fontSize: 7.5 },
  etapeTexte: { flex: 1, paddingTop: 2 },
  vide: { color: GRIS, fontSize: 9 },
  pied: { position: "absolute", bottom: 20, left: 34, right: 34 },
  piedRegle: { height: 0.75, backgroundColor: FILET, marginBottom: 5 },
  piedTexte: { flexDirection: "row", justifyContent: "space-between", fontSize: 6, color: GRIS },
});

export function FicheTechniquePdf({ data }: { data: FicheTechniquePdfData }) {
  const c = data.couleur, clair = data.clair;
  // Une seule page A4 : au-delà d'un certain volume de texte, la fiche passe en corps plus petit
  const volume = data.etapes.join(" ").length + data.lignes.length * 45 + (data.notes?.length ?? 0);
  const taille = volume > 2600 ? 7.8 : volume > 1700 ? 8.6 : 9.5;
  // Titre serif ~38 pt, réduit pour les noms longs
  const tailleTitre = data.nom.length > 32 ? 24 : data.nom.length > 22 ? 30 : 38;
  // Groupes : avant / après cuisson quand la recette a les deux, sinon un seul groupe au nom de la recette
  const groupes = grouperIngredients(data.lignes).map((g) => ({ ...g, titre: g.titre ?? data.nom }));
  const phases = decouperProcede(data.etapes);
  return (
    <Document title={`Fiche technique · ${data.nom}`} author="iFratelli Group">
      <Page size="A4" style={[s.page, { fontSize: taille }]}>
        {data.logo && <View style={s.filigrane} fixed><Image src={data.logo} style={s.filigraneImg} /></View>}

        <View style={s.entete}>
          <Text style={[s.titre, { fontSize: tailleTitre, color: c }]}>{data.nom}</Text>
          <View style={s.badges}>
            <Text style={[s.badge, { backgroundColor: c, borderColor: c, color: "#ffffff" }]}>{data.categorie}</Text>
            {data.portions && <Text style={[s.badge, { backgroundColor: clair, borderColor: c, color: c }]}>{data.portions}</Text>}
          </View>
        </View>

        <View style={s.colonnes}>
          <View style={s.colG}>
            <Text style={s.titreSection}>Ingrédients</Text>
            {groupes.map((g, gi) => (
              <View key={gi} style={s.groupe} wrap={false}>
                <View style={[s.groupeTete, { backgroundColor: c }]}><Text style={s.groupeTitre}>{g.titre}</Text></View>
                <View style={s.tableau}>
                  <View style={s.th}>
                    <Text style={[s.thTxt, { flex: 1 }]}>INGRÉDIENT</Text>
                    <Text style={[s.thTxt, { width: 62, textAlign: "right" }]}>QTÉ</Text>
                  </View>
                  {g.lignes.map((l, i) => {
                    const { q, u } = quantite(l.qte, l.unite);
                    const derniere = i === g.lignes.length - 1;
                    return (
                      <View key={i} style={[s.ligne, { backgroundColor: i % 2 === 1 ? clair : "#ffffff" }, derniere ? { borderBottomWidth: 0 } : {}]} wrap={false}>
                        <Text style={s.cNom}>{l.nom}</Text>
                        <Text style={s.cQte}>{q}{u ? ` ${u}` : ""}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            ))}
            {data.notes && data.notes.trim() && (
              <View style={[s.retenir, { borderLeftColor: c }]} wrap={false}>
                <Text style={[s.retenirTitre, { color: c }]}>À retenir</Text>
                <Text>{data.notes.trim()}</Text>
              </View>
            )}
          </View>

          <View style={s.colD}>
            <Text style={s.titreSection}>Instructions</Text>
            {phases.length === 0 && <Text style={s.vide}>Instructions à rédiger dans la fiche.</Text>}
            {phases.map((p, pi) => (
              <View key={pi}>
                {p.phase && <Text style={[s.phase, { backgroundColor: clair, color: c, borderLeftColor: c }]} minPresenceAhead={30}>{p.phase}</Text>}
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

        <View style={s.pied} fixed>
          <View style={s.piedRegle} />
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
