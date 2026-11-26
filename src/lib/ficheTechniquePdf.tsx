/* eslint-disable jsx-a11y/alt-text */
import React from "react";
import path from "path";
import { Document, Page, View, Text, Image, StyleSheet, Font } from "@react-pdf/renderer";
import { decouperProcede, grouperIngredients, quantite, type LigneFiche } from "@/lib/ficheTechnique";

/**
 * Fiche technique, brief V3 du 26/11/2026 (maquette « FT-Tiramisu-Final ») : bandeau pleine largeur à la couleur
 * de la catégorie (« FICHE TECHNIQUE », titre en Anton capitales, catégorie · portions, « iFRATELLI GROUP »), puis
 * sur fond crème deux colonnes : ingrédients en tableaux par groupe, instructions par phase en onglets. Filigrane
 * du logo, pied de page. Pas de référence, de fournisseur, de perte, d'allergènes ni d'établissement.
 */
export type FicheTechniquePdfData = {
  nom: string;
  categorie: string;
  couleur: string;
  /** Teinte claire de la catégorie (fond alterné, onglets de phase) */
  clair: string;
  portions: string | null;
  miseAJour: string;
  logo: string | null;
  lignes: LigneFiche[];
  etapes: string[];
  /** Bloc « À retenir » (notes de la fiche), s'il y en a */
  notes?: string | null;
};

const CREME = "#f5f0e8", TEXTE = "#2a2a2a", MOYEN = "#555555", GRIS = "#999999", FILET = "#d4cbba";
const MM = 2.8346; // 1 mm en points
// Polices du brief (licence OFL) : Anton pour le titre du bandeau, Crimson Text pour les intertitres
const POLICES = path.join(process.cwd(), "public", "fonts");
let policesOk = false;
try {
  Font.register({ family: "Anton", src: path.join(POLICES, "Anton-Regular.woff") });
  Font.register({ family: "CrimsonText", src: path.join(POLICES, "CrimsonText-Bold.woff"), fontWeight: 700 });
  policesOk = true;
} catch { /* police introuvable : repli Helvetica / Times */ }
// Pas de césure : « DOLCEVALLE », « absorption » restent entiers
Font.registerHyphenationCallback((mot) => [mot]);

const TITRE = policesOk ? "Anton" : "Helvetica-Bold";
const SERIF = policesOk ? "CrimsonText" : "Times-Bold";

const s = StyleSheet.create({
  page: { paddingBottom: 40, fontFamily: "Helvetica", fontSize: 8.5, color: TEXTE, backgroundColor: CREME },
  filigrane: { position: "absolute", top: 42 * MM, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  filigraneImg: { width: 170 * MM, height: 128 * MM, objectFit: "contain" }, // logo déjà pâli à 3,5 % (logo-ifratelli-filigrane.png)
  bandeau: { height: 42 * MM, paddingHorizontal: 14 * MM, position: "relative" },
  surtitre: { position: "absolute", top: 7 * MM, left: 14 * MM, fontFamily: "Helvetica-BoldOblique", fontSize: 7, color: "#ffffff" },
  basGauche: { position: "absolute", bottom: 4 * MM, left: 14 * MM, fontSize: 7, color: "#ffffff" },
  basDroite: { position: "absolute", bottom: 4 * MM, right: 14 * MM, fontFamily: "Helvetica-BoldOblique", fontSize: 9, color: "#ffffff" },
  corps: { flexDirection: "row", gap: 9 * MM, paddingHorizontal: 14 * MM, paddingTop: 10 * MM },
  colG: { width: "45%" },
  colD: { width: "55%" },
  titreSection: { fontFamily: SERIF, fontWeight: 700, fontSize: 14, color: TEXTE, marginBottom: 7 },
  groupe: { marginBottom: 8 },
  groupeTete: { paddingVertical: 4, paddingHorizontal: 7, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  groupeTitre: { color: "#ffffff", fontFamily: "Helvetica-Bold", fontSize: 8 },
  tableau: { borderWidth: 0.75, borderTopWidth: 0, borderColor: FILET, borderBottomLeftRadius: 4, borderBottomRightRadius: 4, overflow: "hidden" },
  th: { flexDirection: "row", paddingVertical: 3, paddingHorizontal: 7, borderBottomWidth: 1, backgroundColor: "#ffffff" },
  thTxt: { fontSize: 6.5, fontFamily: "Helvetica-Bold", color: MOYEN, letterSpacing: 0.4 },
  ligne: { flexDirection: "row", paddingVertical: 4.5, paddingHorizontal: 7, alignItems: "flex-start", borderBottomWidth: 0.8, borderBottomColor: FILET },
  cNom: { width: "62%", paddingRight: 6, fontFamily: "Helvetica-Bold", fontSize: 8.5 },
  cQte: { width: "38%", textAlign: "right", fontSize: 8.5, color: MOYEN },
  retenir: { marginTop: 2, backgroundColor: "#ffffff", borderWidth: 0.75, borderColor: FILET, borderLeftWidth: 2.5, borderRadius: 4, paddingVertical: 6, paddingHorizontal: 8 },
  retenirTitre: { fontFamily: "Helvetica-Bold", fontSize: 7.5, marginBottom: 3, letterSpacing: 0.3 },
  phase: { fontFamily: "Helvetica-Bold", fontSize: 8, paddingVertical: 4, paddingLeft: 8, paddingRight: 10, marginTop: 4, marginBottom: 6, borderLeftWidth: 2.5, borderTopRightRadius: 6, borderBottomRightRadius: 6 },
  etape: { flexDirection: "row", gap: 9, marginBottom: 5.7, alignItems: "flex-start" },
  pastille: { width: 6 * MM, height: 6 * MM, borderRadius: 3, alignItems: "center", justifyContent: "center" },
  pastilleN: { color: "#ffffff", fontFamily: "Helvetica-Bold", fontSize: 7.5 },
  etapeTexte: { flex: 1, paddingTop: 2, fontSize: 8.5 },
  vide: { color: GRIS, fontSize: 8.5 },
  pied: { position: "absolute", bottom: 14, left: 14 * MM, right: 14 * MM },
  piedRegle: { height: 0.75, backgroundColor: FILET, marginBottom: 5 },
  piedTexte: { flexDirection: "row", justifyContent: "space-between", fontSize: 6, color: GRIS },
});

/** Titre du bandeau : une ligne en 52 pt si elle tient, sinon deux lignes équilibrées en 34 pt (plus petit au-delà) */
function lignesTitre(titre: string): { lignes: string[]; taille: number } {
  const t = titre.toUpperCase();
  const largeur = 182 * MM; // page moins les marges de 14 mm
  const tient = (txt: string, taille: number) => txt.length * taille * 0.47 <= largeur; // Anton ≈ 0,47 em par capitale
  if (tient(t, 52)) return { lignes: [t], taille: 52 };
  const mots = t.split(/\s+/);
  let meilleur: [string, string] = [t, ""], ecart = Infinity;
  for (let i = 1; i < mots.length; i++) {
    const a = mots.slice(0, i).join(" "), b = mots.slice(i).join(" ");
    const e = Math.max(a.length, b.length);
    if (e < ecart) { ecart = e; meilleur = [a, b]; }
  }
  const lignes = meilleur[1] ? meilleur : [t];
  let taille = 34;
  while (taille > 20 && !lignes.every((l) => tient(l, taille))) taille -= 2;
  return { lignes, taille };
}

export function FicheTechniquePdf({ data }: { data: FicheTechniquePdfData }) {
  const c = data.couleur, clair = data.clair;
  // Une seule page A4 : au-delà d'un certain volume de texte, la fiche passe en corps plus petit
  const volume = data.etapes.join(" ").length + data.lignes.length * 45 + (data.notes?.length ?? 0);
  const echelle = volume > 2400 ? 0.86 : volume > 1700 ? 0.93 : 1;
  const titre = lignesTitre(data.nom);
  // Groupes : avant / après cuisson quand la recette a les deux, sinon un seul groupe au nom de la recette
  const groupes = grouperIngredients(data.lignes).map((g) => ({ ...g, titre: g.titre ?? data.nom }));
  const phases = decouperProcede(data.etapes);
  const sousTitre = [data.categorie, data.portions].filter(Boolean).join("  ·  ");
  return (
    <Document title={`Fiche technique · ${data.nom}`} author="iFratelli Group">
      <Page size="A4" style={s.page}>
        {data.logo && <View style={s.filigrane} fixed><Image src={data.logo} style={s.filigraneImg} /></View>}

        {/* Bandeau */}
        <View style={[s.bandeau, { backgroundColor: c }]}>
          <Text style={s.surtitre}>FICHE TECHNIQUE</Text>
          {titre.lignes.length === 1 ? (
            <Text style={{ position: "absolute", left: 14 * MM, top: 28 * MM - titre.taille * 1.2, fontFamily: TITRE, fontSize: titre.taille, color: "#ffffff", lineHeight: 1 }}>{titre.lignes[0]}</Text>
          ) : titre.lignes.map((l, i) => (
            <Text key={i} style={{ position: "absolute", left: 14 * MM, top: (i === 0 ? 21 : 32) * MM - titre.taille * 1.2, fontFamily: TITRE, fontSize: titre.taille, color: "#ffffff", lineHeight: 1 }}>{l}</Text>
          ))}
          <Text style={s.basGauche}>{sousTitre}</Text>
          <Text style={s.basDroite}>iFRATELLI GROUP</Text>
        </View>

        <View style={s.corps}>
          <View style={s.colG}>
            <Text style={s.titreSection}>Ingrédients</Text>
            {groupes.map((g, gi) => (
              <View key={gi} style={s.groupe} wrap={false}>
                <View style={[s.groupeTete, { backgroundColor: c }]}><Text style={s.groupeTitre}>{g.titre.toUpperCase()}</Text></View>
                <View style={s.tableau}>
                  <View style={[s.th, { borderBottomColor: c }]}>
                    <Text style={[s.thTxt, { width: "62%" }]}>INGRÉDIENT</Text>
                    <Text style={[s.thTxt, { width: "38%", textAlign: "right" }]}>QTÉ</Text>
                  </View>
                  {g.lignes.map((l, i) => {
                    const { q, u } = quantite(l.qte, l.unite);
                    const derniere = i === g.lignes.length - 1;
                    return (
                      <View key={i} style={[s.ligne, { backgroundColor: i % 2 === 1 ? clair : "#ffffff" }, derniere ? { borderBottomWidth: 0 } : {}]} wrap={false}>
                        <Text style={[s.cNom, { fontSize: 8.5 * echelle }]}>{l.nom}</Text>
                        <Text style={[s.cQte, { fontSize: 8.5 * echelle }]}>{q}{u ? ` ${u}` : ""}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            ))}
            {data.notes && data.notes.trim() && (
              <View style={[s.retenir, { borderLeftColor: c }]} wrap={false}>
                <Text style={[s.retenirTitre, { color: c }]}>À RETENIR</Text>
                <Text style={{ fontSize: 7.5 * echelle, color: MOYEN }}>{data.notes.trim()}</Text>
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
                  <View key={e.n} style={[s.etape, { marginBottom: 5.7 * echelle }]} wrap={false}>
                    <View style={[s.pastille, { backgroundColor: c }]}><Text style={s.pastilleN}>{e.n}</Text></View>
                    <Text style={[s.etapeTexte, { fontSize: 8.5 * echelle }]}>{e.texte}</Text>
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
