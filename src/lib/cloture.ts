/**
 * Clôture de caisse du soir, Bello Mio (10/10/2026). Logique pure, reprise du prototype validé
 * sur les soirées du 08/10 et du 09/10, avec la règle décidée par Paul : aucun écart toléré,
 * la caisse doit tomber juste au centime avant d'arrêter Popina.
 *
 * Le TPE (Flatpay) et la caisse (Popina) ne sont pas reliés : l'équipe recopie le ticket Z du TPE
 * et l'écran Popina, l'app compare. Les pourboires carte vivent dans le TPE ; dans Popina, un
 * pourboire saisi pour une facture est ajouté à la carte et retiré des espèces (comportement de
 * Popina, sans réglage), d'où sa réintégration dans la carte attendue. Seuls les pourboires du TPE
 * comptent pour la paie.
 */

import { comptageSaisi, composerFond, FOND_CIBLE, totalComptage, type Comptage, type CompositionFond } from "@/lib/fondCaisse";

export type SaisieZ = {
  /** Bloc EUR, ligne TOTAL NET (pourboires compris) */
  total: number | null;
  /** Bloc EUR, ligne POURBOIRES */
  pourboires: number | null;
  /** Ligne American Express des accords cartes (0 si absente) */
  amex: number | null;
  /** Bloc CONECS, TOTAL NET */
  conecs: number | null;
  /** Bloc CONECS, POURBOIRES */
  conecsPourboires: number | null;
  /** Bloc CONECS, nombre après « VENTE x » */
  conecsNb: number | null;
};

export type SaisiePopina = {
  cb: number | null;
  conecs: number | null;
  conecsNb: number | null;
  amex: number | null;
  especes: number | null;
  /** Total pourboires affiché par Popina (pourboires carte saisis pour une facture) */
  pourboires: number | null;
  /** Dont pourboire saisi sur un paiement AMEX pour une facture */
  pourboireAmexFacture: number | null;
};

export type SaisieTiroir = {
  /** Fond de caisse : 100 € chaque soir (le fond idéal est remis le lundi) */
  fond: number | null;
  compte: number | null;
  /** Comptage coupure par coupure (clé : coupure en centimes) ; remplace « compte » quand il est saisi */
  coupures?: Comptage | null;
};

export type SaisieCloture = { z: SaisieZ; popina: SaisiePopina; tiroir: SaisieTiroir };

export type LigneEcart = { mode: "cb" | "conecs" | "amex"; libelle: string; popina: number; attendu: number; ecart: number };

export type Niveau = "vide" | "ok" | "mode" | "manque" | "trop";

export type ResultatCloture = {
  niveau: Niveau;
  titre: string;
  etapes: string[];
  lignes: LigneEcart[];
  cibleCb: number;
  ecartCb: number;
  cibleConecs: number;
  ecartConecs: number;
  ecartAmex: number;
  /** Somme des écarts : ce qui reste quand les erreurs de mode sont corrigées */
  residu: number;
  /** Pourboire AMEX calculé par différence (0 si négatif) */
  pourboireAmex: number;
  /** Pourboires carte du jour pour la paie : TPE uniquement (EUR + Conecs + AMEX) */
  pourboiresPaie: number;
  tiroirAttendu: number;
  /** Espèces comptées (comptage par coupure s'il est saisi) */
  tiroirCompte: number | null;
  ecartTiroir: number | null;
  /** Ce qu'il faut laisser pour le fond et ce qui part à la banque (avec le comptage par coupure) */
  fondCaisse: CompositionFond | null;
  /** Enveloppe banque (€) : les espèces Popina du soir (le trop perçu ou le manque se règle avec les pourboires) */
  enveloppe: number | null;
  /** Ce qui manque pour pouvoir valider (espèces Popina, comptage du tiroir) */
  manquePourValider: string[];
};

export const VIDE: SaisieCloture = {
  z: { total: null, pourboires: null, amex: null, conecs: null, conecsPourboires: null, conecsNb: null },
  popina: { cb: null, conecs: null, conecsNb: null, amex: null, especes: null, pourboires: null, pourboireAmexFacture: null },
  tiroir: { fond: 100, compte: null },
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const v0 = (n: number | null | undefined) => (n == null || Number.isNaN(n) ? 0 : n);
const nul = (n: number) => Math.abs(n) < 0.005;
export const eur = (n: number) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const signe = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${eur(Math.abs(n))}`;

/** Montant saisi au clavier (« 4 735,09 », « 4735.09 ») → nombre, null si vide ou illisible */
export function lireMontant(s: string): number | null {
  const t = s.replace(/[\s  ]/g, "").replace(/€/g, "").replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function calculerCloture(s: SaisieCloture): ResultatCloture {
  const { z, popina: p, tiroir } = s;
  const pourboiresPopina = v0(p.pourboires);
  const pourboiresPopinaCb = r2(pourboiresPopina - v0(p.pourboireAmexFacture));
  const cibleCb = r2(v0(z.total) - v0(z.amex) - v0(z.pourboires) + pourboiresPopinaCb);
  const ecartCb = r2(v0(p.cb) - cibleCb);
  const cibleConecs = r2(v0(z.conecs) - v0(z.conecsPourboires));
  const ecartConecs = r2(v0(p.conecs) - cibleConecs);
  const popinaAmexVentes = r2(v0(p.amex) - v0(p.pourboireAmexFacture));
  const diffAmex = r2(v0(z.amex) - popinaAmexVentes);
  const ecartAmex = diffAmex < 0 ? r2(-diffAmex) : 0;
  const pourboireAmex = diffAmex > 0 ? diffAmex : 0;
  const residu = r2(ecartCb + ecartConecs + ecartAmex);
  const tiroirAttendu = r2(v0(tiroir.fond) + v0(p.especes) + pourboiresPopina);
  const parCoupures = comptageSaisi(tiroir.coupures);
  const tiroirCompte = parCoupures ? totalComptage(tiroir.coupures) / 100 : tiroir.compte;
  const ecartTiroir = tiroirCompte == null ? null : r2(tiroirCompte - tiroirAttendu);
  // Ce qu'il faut laisser pour retrouver 100 € de fond, d'après le comptage
  const fondCaisse = parCoupures && tiroir.coupures ? composerFond(tiroir.coupures, FOND_CIBLE) : null;
  // Règle de Paul (13/10) : l'écart du tiroir se règle avec les pourboires de l'équipe ; la banque reçoit les espèces Popina
  const enveloppe = tiroirCompte != null && p.especes != null ? r2(p.especes) : null;
  const manquePourValider = [
    ...(p.especes == null ? ["les espèces de l'écran Popina"] : []),
    ...(tiroirCompte == null ? ["le comptage du tiroir"] : []),
  ];
  const pourboiresPaie = r2(v0(z.pourboires) + v0(z.conecsPourboires) + pourboireAmex);

  const lignes: LigneEcart[] = [
    { mode: "cb", libelle: "Carte de crédit", popina: v0(p.cb), attendu: cibleCb, ecart: ecartCb },
    { mode: "conecs", libelle: "Carte Connecs", popina: v0(p.conecs), attendu: cibleConecs, ecart: ecartConecs },
    { mode: "amex", libelle: "American Express", popina: v0(p.amex), attendu: v0(z.amex), ecart: ecartAmex },
  ];
  const base = { lignes, cibleCb, ecartCb, cibleConecs, ecartConecs, ecartAmex, residu, pourboireAmex, pourboiresPaie, tiroirAttendu, tiroirCompte, ecartTiroir, fondCaisse, enveloppe, manquePourValider };

  if (z.total == null || p.cb == null) return { ...base, niveau: "vide", titre: "Remplis le ticket Z et l'écran Popina pour voir le verdict.", etapes: [] };

  // Erreurs de mode de paiement : Conecs et AMEX se comparent un par un au TPE
  const modes: string[] = [];
  const nbTxt = z.conecsNb != null && p.conecsNb != null && z.conecsNb !== p.conecsNb
    ? ` Popina compte ${p.conecsNb} paiement${p.conecsNb > 1 ? "s" : ""} Conecs et le TPE ${z.conecsNb}.` : "";
  if (ecartConecs > 0.005) modes.push(`Popina a ${eur(ecartConecs)} de Conecs en trop.${nbTxt} Le paiement Conecs de ${eur(ecartConecs)} qui n'est pas sur le TPE était une carte bancaire : ouvre le ticket et passe ce paiement en Carte de crédit.`);
  if (ecartConecs < -0.005) modes.push(`Il manque ${eur(-ecartConecs)} de Conecs dans Popina.${nbTxt} Un paiement de ${eur(-ecartConecs)} saisi en Carte de crédit était un Conecs : ouvre le ticket et passe-le en Carte Connecs.`);
  if (ecartAmex > 0.005) modes.push(`Popina a ${eur(ecartAmex)} d'AMEX de plus que le TPE. Un paiement saisi en American Express était une autre carte : passe-le en Carte de crédit.`);
  if (diffAmex > 0.005 && v0(p.amex) === 0) modes.push(`Le TPE a ${eur(v0(z.amex))} d'AMEX et Popina aucun. Le paiement AMEX a été saisi en Carte de crédit : passe-le en American Express (son pourboire est compris dans le montant du TPE).`);
  else if (diffAmex > 0.005 && diffAmex > v0(p.amex) * 0.25) modes.push(`L'AMEX du TPE dépasse Popina de ${eur(diffAmex)}, c'est beaucoup pour un pourboire : vérifie qu'un AMEX n'a pas été saisi en Carte de crédit.`);

  const etapes: string[] = [];
  let niveau: Niveau;
  let titre: string;
  if (nul(residu) && modes.length === 0 && nul(ecartCb)) {
    niveau = "ok";
    titre = "Tout colle. Tu peux arrêter la caisse Popina.";
  } else if (nul(residu)) {
    niveau = "mode";
    titre = "Une erreur de mode de paiement à corriger.";
    etapes.push(...modes, "Recopie ensuite les nouveaux montants Popina : le verdict doit passer au vert avant d'arrêter la caisse.");
  } else if (residu < 0) {
    niveau = "manque";
    titre = modes.length ? `Une erreur de mode de paiement, puis ${eur(-residu)} de carte à chercher.` : `Il manque ${eur(-residu)} de carte dans Popina.`;
    etapes.push(...modes);
    etapes.push(`Un paiement carte a été saisi en espèces, ou une table payée au TPE n'est pas soldée dans Popina. Cherche une transaction d'environ ${eur(-residu)} au TPE, pourboire compris : importe l'export Flatpay du jour pour voir les candidates avec leur heure.`);
  } else {
    niveau = "trop";
    titre = modes.length ? `Une erreur de mode de paiement, puis ${eur(residu)} de carte en trop à chercher.` : `Popina a ${eur(residu)} de carte en trop.`;
    etapes.push(...modes);
    etapes.push(`Un paiement saisi en carte dans Popina a été réglé autrement (espèces le plus souvent), ou un montant a été mal tapé. Cherche dans Popina un paiement carte de ${eur(residu)} qui n'est pas au TPE : l'export Flatpay du jour montre les transactions de ce montant et leur heure.`);
  }
  if (niveau === "manque" || niveau === "trop") {
    etapes.push("Si l'écart reste introuvable (faute de frappe d'un ou deux euros), corrige le mode de paiement sur une table pour que la ventilation tombe juste, et note laquelle ci-dessous : le contrôle du lendemain retrouvera la vraie cause.");
  }
  if (ecartTiroir != null) {
    if (nul(ecartTiroir)) etapes.push(`Tiroir juste : ${eur(tiroirCompte ?? 0)} pour ${eur(tiroirAttendu)} attendu.`);
    else if (Math.abs(ecartTiroir - residu) < 0.005) etapes.push(`Tiroir : ${eur(tiroirCompte ?? 0)} compté pour ${eur(tiroirAttendu)} attendu (${signe(ecartTiroir)}). C'est le même écart que la carte : un paiement carte saisi en espèces (ou des espèces saisies en carte si l'écart est positif).`);
    else if (ecartTiroir > 0) etapes.push(`Tiroir : ${eur(ecartTiroir)} de trop perçu (${eur(tiroirCompte ?? 0)} compté pour ${eur(tiroirAttendu)} attendu). À donner aux pourboires de l'équipe.`);
    else etapes.push(`Tiroir : il manque ${eur(-ecartTiroir)} (${eur(tiroirCompte ?? 0)} compté pour ${eur(tiroirAttendu)} attendu). Erreur de rendu de monnaie : à prendre dans les pourboires.`);
  }
  if (pourboiresPopina > 0.005) etapes.push(`Pourboires saisis dans Popina pour des factures : ${eur(pourboiresPopina)}. Annule-les avant d'arrêter la caisse, comme convenu ; le calcul en tient déjà compte.`);
  return { ...base, niveau, titre, etapes };
}

/** Récap à copier (message à l'équipe ou à Paul) */
export function recapCloture(jour: string, s: SaisieCloture, r: ResultatCloture, corrections: string[]): string {
  const lignes = [
    `Clôture Bello Mio du ${new Date(`${jour}T12:00:00`).toLocaleDateString("fr-FR")}`,
    `Verdict : ${r.titre}`,
    ...r.lignes.map((l) => `${l.libelle} : Popina ${eur(l.popina)} pour ${eur(l.attendu)} attendu (${nul(l.ecart) ? "juste" : signe(l.ecart)})`),
    `Pourboires carte pour la paie : ${eur(r.pourboiresPaie)}${r.pourboireAmex > 0 ? ` (dont AMEX ${eur(r.pourboireAmex)})` : ""}`,
    r.ecartTiroir != null ? `Tiroir : ${eur(r.tiroirCompte ?? 0)} pour ${eur(r.tiroirAttendu)} attendu (${nul(r.ecartTiroir) ? "juste" : signe(r.ecartTiroir)})` : null,
    r.enveloppe != null ? `Enveloppe banque : ${eur(r.enveloppe)} · fond laissé : ${eur(FOND_CIBLE)}` : null,
    ...corrections.map((c) => `Correction : ${c}`),
    ...r.etapes.map((e) => `• ${e}`),
  ];
  return lignes.filter(Boolean).join("\n");
}
