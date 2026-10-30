"use client";

import { useMemo, useState } from "react";
import { useEtabAuto } from "@/lib/useEtabAuto";
import { useEtablissement } from "@/lib/EtablissementContext";
import { useProfile } from "@/lib/ProfileContext";
import { usePilotageRange } from "@/lib/pilotageRange";
import { useBureau } from "@/hooks/useBureau";
import { fetchApi } from "@/lib/fetchApi";
import { EnteteAnalyse, Cadre, Note, Chargement, TH, TD, TDN } from "@/components/analyse/Blocs";
import { Tuile } from "@/components/ui/Tuile";
import { EtatVide } from "@/components/ui/EtatVide";
import { BON, ATTENTION, MAUVAIS, INFO, MUTED, FAIBLE, BTN, CHAMP, liseret, pastille, filtre as styleFiltre } from "@/components/ui/charte";
import { derniersJours, derniersMois, euros, moisEnCours, nombre, libellePeriode } from "@/components/analyse/gabarit";
import { useEvenementiel } from "./useEvenementiel";
import type { LigneEvenementiel } from "@/lib/pennylane/syncEvenementiel";

/**
 * Événementiel › Devis et factures (30/10/2026) : ce qui est fait dans Pennylane (SARL I Fratelli), lu chaque nuit.
 * Les factures comptent dans le CA de Piccola Mia (Chiffre d'affaires, Résultat). Rien n'est écrit dans Pennylane.
 */
const STATUTS: Record<string, { libelle: string; couleur: string }> = {
  pending: { libelle: "En attente", couleur: ATTENTION }, accepted: { libelle: "Accepté", couleur: BON }, denied: { libelle: "Refusé", couleur: MAUVAIS },
  expired: { libelle: "Expiré", couleur: FAIBLE }, invoiced: { libelle: "Facturé", couleur: INFO }, draft: { libelle: "Brouillon", couleur: FAIBLE },
  paid: { libelle: "Payée", couleur: BON }, late: { libelle: "En retard", couleur: MAUVAIS }, upcoming: { libelle: "À encaisser", couleur: ATTENTION },
  partially_cancelled: { libelle: "Partiellement annulée", couleur: ATTENTION }, cancelled: { libelle: "Annulée", couleur: FAIBLE }, archived: { libelle: "Archivée", couleur: FAIBLE },
};
const statut = (l: LigneEvenementiel) => STATUTS[l.statut ?? ""] ?? { libelle: l.statut ?? "—", couleur: MUTED };
const dateCourte = (d: string | null) => (d ? new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—");

export function Evenementiel() {
  useEtabAuto();
  const bureau = useBureau();
  const { current: etab } = useEtablissement();
  const { canWrite } = useProfile();
  const [range, setRange] = usePilotageRange(() => derniersMois(3));
  const [version, setVersion] = useState(0);
  const [vue, setVue] = useState<"tous" | "devis" | "factures">("tous");
  const [recherche, setRecherche] = useState("");
  const [synchro, setSynchro] = useState<string | null>(null);
  const e = useEvenementiel(range, version);
  const lignes = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return e.lignes.filter((l) => (vue === "tous" || (vue === "devis" ? l.type === "devis" : l.type === "facture")) && (!q || `${l.client_nom ?? ""} ${l.numero ?? ""} ${l.objet ?? ""} ${l.description ?? ""}`.toLowerCase().includes(q)));
  }, [e.lignes, vue, recherche]);
  const synchroniser = async () => {
    if (!etab) return;
    setSynchro("Synchronisation…");
    const r = await fetchApi("/api/evenementiel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ etablissement_id: etab.id }) });
    const j = await r.json().catch(() => ({}));
    setSynchro(r.ok ? `${j.devis} devis et ${j.factures} factures relus` : (j?.error ?? "Erreur"));
    if (r.ok) setVersion((v) => v + 1);
  };
  const raccourcis = [{ libelle: "30 j", r: derniersJours(30) }, { libelle: "Ce mois", r: moisEnCours() }, { libelle: "3 mois", r: derniersMois(3) }, { libelle: "12 mois", r: derniersMois(12) }];
  const t = e.totaux;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: bureau ? "18px 28px 60px" : "12px 14px 60px", display: "grid", gap: 14, alignContent: "start" }}>
      <style>{`.ev-ligne:hover td{background:#f7f3ec}`}</style>
      <EnteteAnalyse titre="Devis et factures" question="L'événementiel tel qu'il est facturé dans Pennylane : devis en cours, factures, encaissements. Compté dans le CA." range={range} onRange={setRange}
        raccourcis={raccourcis} comparaison={`${libellePeriode(range)}${e.synchro_at ? ` · relu le ${new Date(e.synchro_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} à ${new Date(e.synchro_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : ""}`}
        droite={canWrite ? <button type="button" onClick={synchroniser} style={BTN}>Relire Pennylane</button> : undefined} />
      {synchro && <div style={{ fontSize: 12.5, color: MUTED }}>{synchro}</div>}
      {!e.estPiccola && <Cadre><EtatVide icone="ventes" titre="Réservé à Piccola Mia" texte="Les devis et factures Pennylane concernent SARL I Fratelli. Passe sur Piccola Mia dans la barre latérale." /></Cadre>}
      {e.estPiccola && e.erreur && <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(180,68,58,0.08)", color: MAUVAIS, fontSize: 13 }}>{e.erreur}</div>}
      {e.estPiccola && e.chargement && !t && <Chargement texte="Lecture des devis et factures…" />}
      {e.estPiccola && t && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: bureau ? "repeat(4, 1fr)" : "repeat(2, 1fr)", gap: bureau ? 10 : 8, opacity: e.chargement ? 0.6 : 1 }}>
            <Tuile compacte={!bureau} icone="euro" libelle="Facturé HT" valeur={euros(t.facture_ht)} sous={`${t.nb_factures} facture${t.nb_factures > 1 ? "s" : ""} · ${euros(t.facture_ttc)} TTC`} />
            <Tuile compacte={!bureau} icone="recu" couleur={BON} libelle="Encaissé" valeur={euros(t.encaisse_ttc)} sous="factures payées, TTC" />
            <Tuile compacte={!bureau} icone="attente" couleur={t.a_encaisser_ttc > 0 ? ATTENTION : BON} libelle="À encaisser" valeur={euros(t.a_encaisser_ttc)} sous="reste dû, TTC" active={vue === "factures"} onClick={() => setVue(vue === "factures" ? "tous" : "factures")} />
            <Tuile compacte={!bureau} icone="fiche" couleur={INFO} libelle="Devis en attente" valeur={nombre(t.devis_en_attente)} sous={`${euros(t.devis_en_attente_ht)} HT à concrétiser`} active={vue === "devis"} onClick={() => setVue(vue === "devis" ? "tous" : "devis")} />
          </div>
          <Cadre sansMarge>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", padding: "12px 16px" }}>
              {(["tous", "devis", "factures"] as const).map((v) => <button key={v} type="button" onClick={() => setVue(v)} style={styleFiltre(vue === v)}>{v === "tous" ? "Tous" : v === "devis" ? "Devis" : "Factures"}</button>)}
              <input value={recherche} onChange={(ev) => setRecherche(ev.target.value)} placeholder="Client, numéro, objet…" style={{ ...CHAMP, borderRadius: 20, flex: "1 1 200px", maxWidth: 360 }} />
              <span style={{ marginLeft: "auto", fontSize: 12.5, color: MUTED }}>{lignes.length} document{lignes.length > 1 ? "s" : ""}</span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead><tr><th style={{ ...TH, padding: 0, width: 6 }} /><th style={TH}>Date</th><th style={TH}>Document</th><th style={TH}>Client</th>{bureau && <th style={TH}>Objet</th>}<th style={{ ...TH, textAlign: "right" }}>HT</th><th style={{ ...TH, textAlign: "right" }}>TTC</th><th style={TH}>État</th><th style={TH} /></tr></thead>
                <tbody>
                  {lignes.map((l) => { const s = statut(l); return (
                    <tr key={`${l.type}-${l.id}`} className="ev-ligne">
                      <td style={liseret(l.type === "devis" ? INFO : s.couleur)} />
                      <td style={{ ...TD, whiteSpace: "nowrap" }}>{dateCourte(l.date)}</td>
                      <td style={{ ...TD, fontWeight: 600, whiteSpace: "nowrap" }}>{l.type === "devis" ? "Devis" : l.avoir_de ? "Avoir" : "Facture"} <span style={{ color: MUTED, fontWeight: 500 }}>{l.numero}</span></td>
                      <td style={TD}>{l.client_nom ?? "—"}</td>
                      {bureau && <td style={{ ...TD, color: MUTED, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={[l.objet, l.description, l.texte_libre].filter(Boolean).join(" · ")}>{[l.objet, l.description].filter(Boolean).join(" · ") || (l.texte_libre ?? "")}</td>}
                      <td style={TDN}>{euros(l.montant_ht)}</td>
                      <td style={{ ...TDN, color: MUTED }}>{euros(l.montant_ttc)}</td>
                      <td style={{ ...TD, whiteSpace: "nowrap" }}><span style={pastille(s.couleur)}>{s.libelle}</span>{l.type === "facture" && !l.paye && l.reste_ttc != null && l.reste_ttc > 0 && l.reste_ttc < l.montant_ttc - 0.01 && <span style={{ fontSize: 11, color: MUTED, marginLeft: 6 }}>reste {euros(l.reste_ttc)}</span>}</td>
                      <td style={{ ...TD, whiteSpace: "nowrap" }}>{l.url_pdf && <a href={l.url_pdf} target="_blank" rel="noreferrer" style={{ color: "#D4775A", fontWeight: 600, textDecoration: "none", fontSize: 12.5 }}>PDF</a>}</td>
                    </tr>
                  ); })}
                  {lignes.length === 0 && <tr><td colSpan={9} style={{ ...TD, color: FAIBLE, textAlign: "center", padding: 24 }}>Aucun document sur la période{e.synchro_at ? "" : " : lance « Relire Pennylane »"}.</td></tr>}
                </tbody>
              </table>
            </div>
            <div style={{ padding: "10px 16px 14px" }}><Note>Source : Pennylane, SARL I Fratelli, relu chaque matin. Les factures (hors annulées) comptent dans le CA de Piccola Mia à la date de facture ; le rapprochement des virements reste dans Pennylane.</Note></div>
          </Cadre>
        </>
      )}
    </div>
  );
}
