import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { LigneValorisee } from "@/lib/inventaireValoServeur";

/**
 * Export comptable d'un inventaire (PDF) :
 *  1. en-tête (raison sociale, établissement, date, type, statut) et totaux ;
 *  2. récapitulatif par famille (telle que sur la feuille) et par catégorie de fiche ;
 *  3. détail par zone, dans l'ordre de la feuille : n°, produit, conditionnement, colis, unités, quantité, unité, coût unitaire HT, valeur HT ;
 *  4. annexe : lignes sans prix (à valoriser), fiches désactivées ou supprimées, lignes non comptées.
 */

export type InventairePdfData = {
  etabNom: string; raisonSociale: string; adresse: string | null; siret: string | null;
  date: string; type: string; statut: string; clotureAt: string | null; genereLe: string;
  total: number; nbComptees: number; nbNonComptees: number; nbSansPrix: number;
  parZone: { zone: string; valeur: number; lignes: number }[];
  parFamille: { famille: string; valeur: number; lignes: number }[];
  parCategorie: { categorie: string; valeur: number; lignes: number }[];
  lignes: LigneValorisee[];
};

const c = { accent: "#D4775A", green: "#4a6741", dark: "#1a1a1a", muted: "#777", bg: "#f5f0e8", border: "#ddd6c8", warn: "#b45309" };

const s = StyleSheet.create({
  page: { padding: "28 32 40 32", fontSize: 8, fontFamily: "Helvetica", color: c.dark },
  h1: { fontSize: 16, fontFamily: "Helvetica-Bold" },
  h2: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 14, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  small: { fontSize: 8, color: c.muted },
  entete: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", borderBottomWidth: 1, borderBottomColor: c.border, paddingBottom: 8, marginBottom: 10 },
  kpis: { flexDirection: "row", gap: 18, marginBottom: 6 },
  kpiLabel: { fontSize: 7, color: c.muted, textTransform: "uppercase", letterSpacing: 0.5 },
  kpiValue: { fontSize: 13, fontFamily: "Helvetica-Bold" },
  zoneHeader: { backgroundColor: c.accent, color: "#fff", padding: "5 8", borderRadius: 4, marginTop: 10, marginBottom: 3, flexDirection: "row", justifyContent: "space-between" },
  zoneTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.5 },
  famille: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: c.muted, textTransform: "uppercase", letterSpacing: 0.3, marginTop: 5, marginBottom: 2, paddingLeft: 4 },
  row: { flexDirection: "row", paddingVertical: 2.2, paddingHorizontal: 4, borderBottomWidth: 0.5, borderBottomColor: "#eee", alignItems: "center" },
  th: { flexDirection: "row", paddingVertical: 3, paddingHorizontal: 4, backgroundColor: c.bg, borderRadius: 3, marginBottom: 2 },
  thTxt: { fontSize: 6.5, color: c.muted, fontFamily: "Helvetica-Bold", textTransform: "uppercase" },
  cNum: { width: 22, color: c.muted },
  cNom: { flex: 1, paddingRight: 4 },
  cCond: { width: 78, color: c.muted, fontSize: 7 },
  cColis: { width: 30, textAlign: "right" },
  cUnites: { width: 34, textAlign: "right" },
  cQte: { width: 40, textAlign: "right", fontFamily: "Helvetica-Bold" },
  cUnite: { width: 40, paddingLeft: 3, color: c.muted, fontSize: 7 },
  cCout: { width: 46, textAlign: "right" },
  cVal: { width: 54, textAlign: "right", fontFamily: "Helvetica-Bold" },
  sousTotal: { flexDirection: "row", justifyContent: "flex-end", paddingVertical: 3, paddingHorizontal: 4, gap: 8 },
  recapRow: { flexDirection: "row", paddingVertical: 2.5, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: "#eee" },
  footer: { position: "absolute", bottom: 18, left: 32, right: 32, flexDirection: "row", justifyContent: "space-between", fontSize: 6.5, color: c.muted },
});

const eur = (n: number | null | undefined) => n == null ? "—" : n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const nb = (n: number | null | undefined, dec = 3) => n == null ? "" : String(Math.round(n * 10 ** dec) / 10 ** dec).replace(".", ",");
const fmtDate = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });
const fmtDateHeure = (iso: string) => new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" });
const pluriel = (u: string, n: number) => n > 1 && !["kg", "litre", "colis", "pc"].includes(u) ? (u.endsWith("s") || u.endsWith("x") ? u : u === "plateau" ? "plateaux" : u === "seau" ? "seaux" : u + "s") : u;

function Pied({ data }: { data: InventairePdfData }) {
  return (
    <View style={s.footer} fixed>
      <Text>{data.raisonSociale ? `${data.raisonSociale} · ` : ""}{data.etabNom} · {data.type} au {fmtDate(data.date)} · {data.statut}</Text>
      <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
    </View>
  );
}

export function InventairePdfDocument(data: InventairePdfData) {
  const parZone = new Map<string, LigneValorisee[]>();
  for (const l of data.lignes) parZone.set(l.zone, [...(parZone.get(l.zone) ?? []), l]);
  const sansPrix = data.lignes.filter((l) => l.cout == null && l.quantite != null && l.quantite > 0);
  const fichesProbleme = data.lignes.filter((l) => l.fiche === "inactive" || l.fiche === "supprimee" || l.fiche === "a_verifier");
  const nonComptees = data.lignes.filter((l) => l.quantite == null);

  return (
    <Document title={`Inventaire ${data.etabNom} ${data.date}`} author={data.raisonSociale || data.etabNom}>
      {/* ── Page 1 : en-tête, totaux, récapitulatifs ── */}
      <Page size="A4" style={s.page}>
        <View style={s.entete}>
          <View>
            <Text style={s.h1}>{data.type}</Text>
            <Text style={{ fontSize: 10, marginTop: 2 }}>{data.raisonSociale ? `${data.raisonSociale} — ` : ""}{data.etabNom}</Text>
            {data.adresse ? <Text style={s.small}>{data.adresse}</Text> : null}
            {data.siret ? <Text style={s.small}>SIRET {data.siret}</Text> : null}
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontSize: 11, fontFamily: "Helvetica-Bold" }}>Arrêté au {fmtDate(data.date)}</Text>
            <Text style={s.small}>{data.statut}{data.clotureAt ? ` le ${fmtDateHeure(data.clotureAt)}` : ""}</Text>
            <Text style={s.small}>Édité le {fmtDateHeure(data.genereLe)}</Text>
          </View>
        </View>

        <View style={s.kpis}>
          <View><Text style={s.kpiLabel}>Valeur du stock HT</Text><Text style={{ ...s.kpiValue, color: c.accent }}>{eur(data.total)}</Text></View>
          <View><Text style={s.kpiLabel}>Lignes comptées</Text><Text style={s.kpiValue}>{data.nbComptees} / {data.lignes.length}</Text></View>
          <View><Text style={s.kpiLabel}>Lignes sans prix</Text><Text style={{ ...s.kpiValue, color: data.nbSansPrix ? c.warn : c.green }}>{data.nbSansPrix}</Text></View>
          <View><Text style={s.kpiLabel}>Zones</Text><Text style={s.kpiValue}>{data.parZone.length}</Text></View>
        </View>
        <Text style={s.small}>Valorisation au dernier prix d&apos;achat HT connu (offre fournisseur active, sinon dernière offre fermée, sinon prix d&apos;achat de la fiche), ramené dans l&apos;unité comptée. Une ligne sans prix compte pour 0 € : voir l&apos;annexe.</Text>

        <Text style={s.h2}>Récapitulatif par zone</Text>
        {data.parZone.map((z) => (
          <View key={z.zone} style={s.recapRow}>
            <Text style={{ flex: 1 }}>{z.zone}</Text>
            <Text style={{ width: 60, textAlign: "right", color: c.muted }}>{z.lignes} lignes</Text>
            <Text style={{ width: 80, textAlign: "right", fontFamily: "Helvetica-Bold" }}>{eur(z.valeur)}</Text>
          </View>
        ))}
        <View style={s.recapRow}><Text style={{ flex: 1, fontFamily: "Helvetica-Bold" }}>Total HT</Text><Text style={{ width: 60 }} /><Text style={{ width: 80, textAlign: "right", fontFamily: "Helvetica-Bold", color: c.accent }}>{eur(data.total)}</Text></View>

        <View style={{ flexDirection: "row", gap: 16 }}>
          <View style={{ flex: 1 }}>
            <Text style={s.h2}>Par famille (feuille)</Text>
            {data.parFamille.map((f) => (
              <View key={f.famille} style={s.recapRow}>
                <Text style={{ flex: 1 }}>{f.famille}</Text>
                <Text style={{ width: 70, textAlign: "right", fontFamily: "Helvetica-Bold" }}>{eur(f.valeur)}</Text>
              </View>
            ))}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.h2}>Par catégorie de fiche</Text>
            {data.parCategorie.map((f) => (
              <View key={f.categorie} style={s.recapRow}>
                <Text style={{ flex: 1 }}>{f.categorie}</Text>
                <Text style={{ width: 70, textAlign: "right", fontFamily: "Helvetica-Bold" }}>{eur(f.valeur)}</Text>
              </View>
            ))}
          </View>
        </View>
        <Pied data={data} />
      </Page>

      {/* ── Détail par zone ── */}
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>Détail par zone</Text>
        <Text style={s.small}>Dans l&apos;ordre de la feuille. Quantité = colis × contenu + unités. Coût unitaire HT dans l&apos;unité comptée.</Text>
        {[...parZone.entries()].map(([zone, lignes]) => {
          const total = lignes.reduce((t, l) => t + (l.valeur ?? 0), 0);
          let familleCourante: string | null | undefined;
          return (
            <View key={zone}>
              <View style={s.zoneHeader} wrap={false}>
                <Text style={s.zoneTitle}>{zone}</Text>
                <Text style={s.zoneTitle}>{eur(total)}</Text>
              </View>
              <View style={s.th}>
                <Text style={{ ...s.cNum, ...s.thTxt }}>N°</Text>
                <Text style={{ ...s.cNom, ...s.thTxt }}>Produit</Text>
                <Text style={{ ...s.cCond, ...s.thTxt }}>Conditionnement</Text>
                <Text style={{ ...s.cColis, ...s.thTxt }}>Colis</Text>
                <Text style={{ ...s.cUnites, ...s.thTxt }}>Unités</Text>
                <Text style={{ ...s.cQte, ...s.thTxt }}>Qté</Text>
                <Text style={{ ...s.cUnite, ...s.thTxt }}>Unité</Text>
                <Text style={{ ...s.cCout, ...s.thTxt }}>Coût HT</Text>
                <Text style={{ ...s.cVal, ...s.thTxt }}>Valeur HT</Text>
              </View>
              {lignes.map((l) => {
                const nouvelleFamille = l.famille !== familleCourante;
                familleCourante = l.famille;
                const deuxChamps = l.cond_contenu != null && l.cond_contenu > 1;
                const alerte = l.fiche === "supprimee" ? " (fiche supprimée)" : l.fiche === "inactive" ? " (fiche désactivée)" : l.fiche === "a_verifier" ? " (à vérifier)" : "";
                return (
                  <React.Fragment key={l.id}>
                    {nouvelleFamille && <Text style={s.famille}>{l.famille ?? "Sans famille"}</Text>}
                    <View style={s.row} wrap={false}>
                      <Text style={s.cNum}>{l.ordre ?? ""}</Text>
                      <Text style={s.cNom}>{l.nom_feuille ?? l.nom}{alerte ? <Text style={{ color: c.warn }}>{alerte}</Text> : null}</Text>
                      <Text style={s.cCond}>{deuxChamps ? l.cond_libelle ?? "" : ""}</Text>
                      <Text style={s.cColis}>{deuxChamps ? nb(l.colis) : ""}</Text>
                      <Text style={s.cUnites}>{deuxChamps ? nb(l.unites) : ""}</Text>
                      <Text style={s.cQte}>{l.quantite == null ? "—" : nb(l.quantite)}</Text>
                      <Text style={s.cUnite}>{l.quantite == null ? "" : pluriel(l.unite, l.quantite)}</Text>
                      <Text style={{ ...s.cCout, color: l.cout == null ? c.warn : c.dark }}>{l.cout == null ? "sans prix" : eur(l.cout)}</Text>
                      <Text style={s.cVal}>{l.valeur == null ? (l.quantite == null ? "" : "—") : eur(l.valeur)}</Text>
                    </View>
                  </React.Fragment>
                );
              })}
              <View style={s.sousTotal}><Text style={{ color: c.muted }}>Sous-total {zone}</Text><Text style={{ fontFamily: "Helvetica-Bold", width: 70, textAlign: "right" }}>{eur(total)}</Text></View>
            </View>
          );
        })}
        <Pied data={data} />
      </Page>

      {/* ── Annexe ── */}
      {(sansPrix.length > 0 || fichesProbleme.length > 0 || nonComptees.length > 0) && (
        <Page size="A4" style={s.page}>
          <Text style={s.h1}>Annexe : points à traiter</Text>
          {sansPrix.length > 0 && (
            <View>
              <Text style={s.h2}>{sansPrix.length} ligne{sansPrix.length > 1 ? "s" : ""} comptée{sansPrix.length > 1 ? "s" : ""} sans prix (0 € dans le total)</Text>
              <Text style={s.small}>Renseigner un prix d&apos;achat sur la fiche produit, ou le poids / volume d&apos;une pièce quand le prix est au kg ou au litre, puis rééditer.</Text>
              {sansPrix.map((l) => (
                <View key={l.id} style={s.recapRow}>
                  <Text style={{ width: 90, color: c.muted }}>{l.zone}</Text>
                  <Text style={{ flex: 1 }}>{l.nom_feuille ?? l.nom}</Text>
                  <Text style={{ width: 70, textAlign: "right" }}>{nb(l.quantite)} {pluriel(l.unite, l.quantite ?? 0)}</Text>
                  <Text style={{ width: 150, color: c.warn, paddingLeft: 6 }}>{l.raison ?? "aucun prix"}</Text>
                </View>
              ))}
            </View>
          )}
          {fichesProbleme.length > 0 && (
            <View>
              <Text style={s.h2}>{fichesProbleme.length} ligne{fichesProbleme.length > 1 ? "s" : ""} sur une fiche à vérifier, désactivée ou supprimée</Text>
              {fichesProbleme.map((l) => (
                <View key={l.id} style={s.recapRow}>
                  <Text style={{ width: 90, color: c.muted }}>{l.zone}</Text>
                  <Text style={{ flex: 1 }}>{l.nom_feuille ?? l.nom}</Text>
                  <Text style={{ width: 110, color: c.warn }}>{l.fiche === "supprimee" ? "fiche supprimée" : l.fiche === "inactive" ? "fiche désactivée" : "fiche à vérifier"}</Text>
                </View>
              ))}
            </View>
          )}
          {nonComptees.length > 0 && (
            <View>
              <Text style={s.h2}>{nonComptees.length} ligne{nonComptees.length > 1 ? "s" : ""} non comptée{nonComptees.length > 1 ? "s" : ""}</Text>
              <Text style={s.small}>{nonComptees.slice(0, 120).map((l) => `${l.ordre ?? ""} ${l.nom_feuille ?? l.nom} (${l.zone})`).join(" · ")}{nonComptees.length > 120 ? " · …" : ""}</Text>
            </View>
          )}
          <Pied data={data} />
        </Page>
      )}
    </Document>
  );
}
