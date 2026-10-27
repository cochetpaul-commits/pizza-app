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

import { appliquerEchange, comptageSaisi, composerSoir, echangerCagnotte, FOND_CIBLE, idealPourJour, totalComptage, type Comptage, type CompositionFond, type EchangeCagnotte } from "@/lib/fondCaisse";

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

/** Cagnotte des pourboires en espèces, vidée et comptée le vendredi soir (Paul, 26/10/2026) */
export type SaisieCagnotte = {
  total: number | null;
  /** Comptage coupure par coupure (clé : coupure en centimes) ; remplace « total » quand il est saisi */
  coupures?: Comptage | null;
};

export type SaisieCloture = {
  z: SaisieZ; popina: SaisiePopina; tiroir: SaisieTiroir;
  /** Petit écart carte corrigé en « prix sur mesure », déclaré par l'équipe (€, négatif = manque dans Popina) : note obligatoire */
  ajustement?: number | null;
  /** Pourboires espèces de la semaine (cagnotte vidée le vendredi), ajoutés au pot du mois */
  cagnotte?: SaisieCagnotte | null;
};

/** Seuil du petit écart carte réglé en « prix sur mesure » (règle de Paul, 14/10/2026) */
export const SEUIL_AJUSTEMENT = 2;

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
  /** Pourboire AMEX calculé par différence (déjà compris dans les pourboires du Z) */
  pourboireAmex: number;
  /** Pourboires carte du jour pour la paie : TPE uniquement (ligne POURBOIRES du Z, AMEX compris, + Conecs) */
  pourboiresPaie: number;
  tiroirAttendu: number;
  /** Espèces comptées (comptage par coupure s'il est saisi) */
  tiroirCompte: number | null;
  ecartTiroir: number | null;
  /** Le tiroir a le même écart que la carte (à 2 € près) : des espèces saisies en carte, ou l'inverse */
  erreurEspecesCarte: boolean;
  /** Ce qu'il faut laisser pour le fond et ce qui part à la banque (avec le comptage par coupure) */
  fondCaisse: CompositionFond | null;
  /** Enveloppe banque (€) : les espèces Popina du soir (le trop perçu ou le manque se règle avec les pourboires) */
  enveloppe: number | null;
  /** Ce qui manque pour pouvoir valider (espèces Popina, comptage du tiroir) */
  manquePourValider: string[];
  /** Petit écart carte à régler en « prix sur mesure » maintenant (€, négatif = manque dans Popina), sinon null */
  petitEcart: number | null;
  /** Ajustement déclaré pour la soirée : une note est obligatoire pour valider */
  ajustement: number | null;
  /** Pourboires espèces comptés ce soir (cagnotte vidée), pour le pot du mois ; null si rien de saisi */
  pourboiresEspeces: number | null;
  /** Monnaie à faire entre la cagnotte et le tiroir (pièces contre billets), quand les deux sont comptés par coupure */
  echange: EchangeCagnotte | null;
};

/** La note de correction manque-t-elle pour valider ? */
export const noteManquante = (r: Pick<ResultatCloture, "ajustement">, corrections: string[]) =>
  r.ajustement != null && !corrections.some((c) => c.trim());

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

/**
 * Montants d'addition qui donnent `paye` avec un pourboire usuel (0, 3, 5, 10, 15 %), les montants ronds
 * (,00 ou ,50, comme les prix de la carte) d'abord. Vécu 13/10 : l'AMEX de 72,62 € au TPE était une
 * addition de 70,50 € dans Popina (3 %) ; chercher 72,62 € dans Popina ne menait à rien.
 */
export function additionsPossibles(paye: number): { montant: number; pourboire: number }[] {
  const cible = Math.round(paye * 100);
  const out: { montant: number; pourboire: number }[] = [];
  for (const pct of [0, 3, 5, 10, 15]) {
    const base = Math.floor(cible / (1 + pct / 100));
    for (const c of [base - 1, base, base + 1]) {
      if (c > 0 && Math.round(c * (1 + pct / 100)) === cible && !out.some((o) => o.montant === c / 100)) out.push({ montant: c / 100, pourboire: pct });
    }
  }
  const rond = (m: number) => Math.round(m * 100) % 50 === 0;
  return out.sort((a, b) => Number(rond(b.montant)) - Number(rond(a.montant)) || a.pourboire - b.pourboire);
}

export function calculerCloture(s: SaisieCloture, jour?: string | null): ResultatCloture {
  const { z, popina: p, tiroir } = s;
  const pourboiresPopina = v0(p.pourboires);
  // « Dont pourboire AMEX » ne compte que s'il y a des pourboires saisis dans Popina (vécu 13/10 : 2,12 € tapés là par erreur)
  const pourboireAmexFacture = Math.min(v0(p.pourboireAmexFacture), pourboiresPopina);
  const pourboiresPopinaCb = r2(pourboiresPopina - pourboireAmexFacture);
  const cibleConecs = r2(v0(z.conecs) - v0(z.conecsPourboires));
  const ecartConecs = r2(v0(p.conecs) - cibleConecs);
  const popinaAmexVentes = r2(v0(p.amex) - pourboireAmexFacture);
  const diffAmex = r2(v0(z.amex) - popinaAmexVentes);
  const ecartAmex = diffAmex < 0 ? r2(-diffAmex) : 0;
  // Pourboire AMEX passé au TPE (montant TPE − vente Popina). Vécu 13/10 : il est compté dans la ligne
  // POURBOIRES du Z comme les autres (détail Flatpay de l'AMEX : « Pourboires 2,12 EUR »), donc on ne
  // le retire qu'une fois. Si Popina n'a aucun AMEX, le paiement a été saisi en carte : pas de pourboire déductible.
  const pourboireAmex = diffAmex > 0 && v0(p.amex) > 0 ? Math.min(diffAmex, v0(z.pourboires)) : 0;
  // Carte attendue dans Popina : total du Z − AMEX (pourboire compris) − pourboires hors AMEX + pourboires saisis dans Popina
  const cibleCb = r2(v0(z.total) - v0(z.amex) - (v0(z.pourboires) - pourboireAmex) + pourboiresPopinaCb);
  const ecartCb = r2(v0(p.cb) - cibleCb);
  // AMEX saisi en Carte de crédit (vécu 13/10) : le TPE a de l'AMEX, Popina aucun. Sa vente est dans la carte
  // Popina et son pourboire dans les pourboires du Z : l'écart carte vaut alors exactement l'AMEX du TPE, ce
  // n'est pas un écart à chercher ailleurs.
  const amexEnCarte = v0(z.amex) > 0.005 && v0(p.amex) < 0.005;
  const ecartCbHorsAmex = amexEnCarte ? r2(ecartCb - v0(z.amex)) : ecartCb;
  const residu = r2(ecartCbHorsAmex + ecartConecs + ecartAmex);
  const tiroirAttendu = r2(v0(tiroir.fond) + v0(p.especes) + pourboiresPopina);
  const parCoupures = comptageSaisi(tiroir.coupures);
  const tiroirCompte = parCoupures ? totalComptage(tiroir.coupures) / 100 : tiroir.compte;
  const ecartTiroir = tiroirCompte == null ? null : r2(tiroirCompte - tiroirAttendu);
  // Cagnotte des pourboires vidée ce soir (le vendredi) : total, et monnaie à faire avec le tiroir
  const cagnotteParCoupures = comptageSaisi(s.cagnotte?.coupures);
  const pourboiresEspeces = cagnotteParCoupures ? totalComptage(s.cagnotte?.coupures) / 100 : s.cagnotte?.total ?? null;
  // Le lundi soir, le fond idéal est celui du début de semaine (plus de monnaie)
  const ideal = idealPourJour(jour);
  const echange = parCoupures && tiroir.coupures && cagnotteParCoupures && s.cagnotte?.coupures ? echangerCagnotte(s.cagnotte.coupures, tiroir.coupures, ideal) : null;
  // Ce qu'il faut laisser pour retrouver 100 € de fond, d'après le comptage (après la monnaie faite avec la cagnotte)
  const fondCaisse = parCoupures && tiroir.coupures ? composerSoir(echange ? appliquerEchange(tiroir.coupures, echange) : tiroir.coupures, FOND_CIBLE, p.especes, ideal) : null;
  // Règle de Paul (13/10) : l'écart du tiroir se règle avec les pourboires de l'équipe ; la banque reçoit les espèces Popina
  const enveloppe = tiroirCompte != null && p.especes != null ? r2(p.especes) : null;
  const manquePourValider = [
    ...(p.especes == null ? ["les espèces de l'écran Popina"] : []),
    ...(tiroirCompte == null ? ["le comptage du tiroir"] : []),
  ];
  const pourboiresPaie = r2(v0(z.pourboires) + v0(z.conecsPourboires));

  const lignes: LigneEcart[] = [
    { mode: "cb", libelle: "Carte de crédit", popina: v0(p.cb), attendu: cibleCb, ecart: ecartCb },
    { mode: "conecs", libelle: "Carte Connecs", popina: v0(p.conecs), attendu: cibleConecs, ecart: ecartConecs },
    { mode: "amex", libelle: "American Express", popina: v0(p.amex), attendu: v0(z.amex), ecart: ecartAmex },
  ];
  const base = { lignes, cibleCb, ecartCb, cibleConecs, ecartConecs, ecartAmex, residu, pourboireAmex, pourboiresPaie, tiroirAttendu, tiroirCompte, ecartTiroir, erreurEspecesCarte: false, fondCaisse, enveloppe, manquePourValider, petitEcart: null as number | null, ajustement: s.ajustement ?? null, pourboiresEspeces, echange };

  if (z.total == null || p.cb == null) return { ...base, niveau: "vide", titre: "Remplis le ticket Z et l'écran Popina pour voir le verdict.", etapes: [] };

  // Erreurs de mode de paiement : Conecs et AMEX se comparent un par un au TPE
  const modes: string[] = [];
  const nbTxt = z.conecsNb != null && p.conecsNb != null && z.conecsNb !== p.conecsNb
    ? ` Popina compte ${p.conecsNb} paiement${p.conecsNb > 1 ? "s" : ""} Conecs et le TPE ${z.conecsNb}.` : "";
  if (ecartConecs > 0.005) modes.push(`Popina a ${eur(ecartConecs)} de Conecs en trop.${nbTxt} Le paiement Conecs de ${eur(ecartConecs)} qui n'est pas sur le TPE était une carte bancaire : ouvre le ticket et passe ce paiement en Carte de crédit.`);
  if (ecartConecs < -0.005) modes.push(`Il manque ${eur(-ecartConecs)} de Conecs dans Popina.${nbTxt} Un paiement de ${eur(-ecartConecs)} saisi en Carte de crédit était un Conecs : ouvre le ticket et passe-le en Carte Connecs.`);
  if (ecartAmex > 0.005) modes.push(`Popina a ${eur(ecartAmex)} d'AMEX de plus que le TPE. Un paiement saisi en American Express était une autre carte : passe-le en Carte de crédit.`);
  if (amexEnCarte) {
    // Popina affiche l'addition, sans le pourboire : on donne les montants à chercher, pas celui du TPE
    // Tous les pourcentages usuels, le montant rond (prix de la carte) en premier
    const [premier, ...autres] = additionsPossibles(v0(z.amex));
    const txt = (a: { montant: number; pourboire: number }) => `${eur(a.montant)} (${a.pourboire ? `${a.pourboire} % de pourboire` : "sans pourboire"})`;
    modes.push(`Le TPE a ${eur(v0(z.amex))} d'AMEX, pourboire compris, et Popina aucun : un paiement AMEX a été saisi en Carte de crédit. Popina montre l'addition sans le pourboire : cherche d'abord un paiement carte de ${premier ? txt(premier) : eur(v0(z.amex))}${autres.length ? `, sinon ${autres.map(txt).join(", ")}` : ""}. Ouvre ce ticket et passe le paiement en American Express. L'export Flatpay donne l'heure exacte de l'AMEX.`);
  }
  else if (diffAmex > 0.005 && diffAmex > v0(p.amex) * 0.25) modes.push(`L'AMEX du TPE dépasse Popina de ${eur(diffAmex)}, c'est beaucoup pour un pourboire : vérifie qu'un AMEX n'a pas été saisi en Carte de crédit.`);

  // Petit écart carte (règle de Paul, 14/10) : liquide bon, Conecs et AMEX justes, carte à moins de 2 € près.
  // On ne cherche pas : on rouvre une table payée en carte et on ajuste un article en « prix sur mesure ».
  // Espèces saisies en carte (ou l'inverse) : carte et tiroir ont le même écart, à quelques pièces de pourboire
  // près. Vécu 14/10 : 20 € d'espèces tapés en carte, carte +20,00 € et tiroir +20,10 € ; l'app parlait de
  // trop perçu à donner aux pourboires parce qu'elle exigeait les deux écarts égaux au centime.
  const erreurEspecesCarte = ecartTiroir != null && !nul(residu) && Math.sign(ecartTiroir) === Math.sign(residu)
    && Math.abs(ecartTiroir - residu) <= SEUIL_AJUSTEMENT;
  const liquideBon = ecartTiroir != null && !erreurEspecesCarte;
  const petitEcart = !nul(residu) && modes.length === 0 && Math.abs(residu) <= SEUIL_AJUSTEMENT && liquideBon ? residu : null;
  // L'ajustement n'est retenu que quand l'équipe le déclare (bouton « J'ai fait l'ajustement ») : vécu 15/10,
  // un montant mal tapé un instant (0,48 €) avait été pris pour un ajustement et exigeait une note
  const ajustement = s.ajustement ?? null;

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
  } else if (erreurEspecesCarte) {
    niveau = residu < 0 ? "manque" : "trop";
    titre = residu > 0 ? `Erreur de mode : ${eur(residu)} payés en espèces ont été saisis en carte.` : `Erreur de mode : ${eur(-residu)} payés par carte ont été saisis en espèces.`;
    etapes.push(...modes);
    etapes.push(residu > 0
      ? `La carte Popina a ${eur(residu)} de trop et le tiroir ${eur(ecartTiroir ?? 0)} de trop : c'est le même paiement. Cherche dans Popina un paiement Carte de crédit de ${eur(residu)} et repasse-le en Espèces.`
      : `La carte Popina a ${eur(-residu)} de moins que le TPE et il manque ${eur(-(ecartTiroir ?? 0))} au tiroir : c'est le même paiement. Cherche dans Popina un paiement en Espèces d'environ ${eur(-residu)} (le TPE compte le pourboire) et repasse-le en Carte de crédit.`,
      "Recopie ensuite la carte et les espèces Popina : le verdict et le tiroir doivent passer au vert.");
  } else if (residu < 0) {
    niveau = "manque";
    titre = modes.length ? `Une erreur de mode de paiement, puis ${eur(-residu)} de carte à chercher.` : `Il manque ${eur(-residu)} de carte dans Popina.`;
    etapes.push(...modes);
    if (petitEcart != null) etapes.push(
      // Vécu 13/10 : 0,30 € = une carte payée 24,50 € au TPE pour 24,20 € dans Popina, sans la touche pourboire
      `Petit écart : le client a sans doute payé un peu au-dessus de l'addition. Rouvre une table payée en carte, touche un article, « Prix sur mesure » : augmente-le de ${eur(-residu)}, puis encaisse ces ${eur(-residu)} en Carte de crédit.`,
      "Note la correction ci-dessous (la table et le montant), puis recopie la carte Popina : le verdict doit passer au vert.");
    else etapes.push(`Un paiement carte a été saisi en espèces, ou une table payée au TPE n'est pas soldée dans Popina. Cherche une transaction d'environ ${eur(-residu)} au TPE, pourboire compris : importe l'export Flatpay du jour pour voir les candidates avec leur heure.`);
  } else {
    niveau = "trop";
    titre = modes.length ? `Une erreur de mode de paiement, puis ${eur(residu)} de carte en trop à chercher.` : `Popina a ${eur(residu)} de carte en trop.`;
    etapes.push(...modes);
    if (petitEcart != null) etapes.push(
      `Petit écart : un montant carte a été tapé un peu plus haut dans Popina qu'au TPE. Rouvre une table payée en carte, touche un article, « Prix sur mesure » : baisse-le de ${eur(residu)}, et retire ces ${eur(residu)} du paiement Carte de crédit.`,
      "Note la correction ci-dessous (la table et le montant), puis recopie la carte Popina : le verdict doit passer au vert.");
    else etapes.push(`Un paiement saisi en carte dans Popina a été réglé autrement (espèces le plus souvent), ou un montant a été mal tapé. Cherche dans Popina un paiement carte de ${eur(residu)} qui n'est pas au TPE : l'export Flatpay du jour montre les transactions de ce montant et leur heure.`);
  }
  if ((niveau === "manque" || niveau === "trop") && petitEcart == null && !erreurEspecesCarte) {
    etapes.push(Math.abs(residu) <= SEUIL_AJUSTEMENT && ecartTiroir == null
      ? `Compte le tiroir : si le liquide est bon, un écart carte de ${SEUIL_AJUSTEMENT} € ou moins se règle en « prix sur mesure » sur une table payée en carte.`
      : `Au-delà de ${SEUIL_AJUSTEMENT} €, c'est une vraie erreur : trouve-la avant d'arrêter la caisse.`);
  }
  if (ecartTiroir != null) {
    // Tiroir juste : affiché dans le bloc Tiroir, pas répété dans le verdict
    if (nul(ecartTiroir)) { /* rien */ }
    else if (erreurEspecesCarte) {
      const reste = r2(ecartTiroir - residu);
      etapes.push(`Tiroir : ${eur(tiroirCompte ?? 0)} compté pour ${eur(tiroirAttendu)} attendu (${signe(ecartTiroir)}), le même écart que la carte.${nul(reste) ? "" : ` Une fois le mode corrigé, il restera ${reste > 0 ? `${eur(reste)} de trop perçu pour les pourboires` : `${eur(-reste)} à prendre dans les pourboires`}.`}`);
    }
    else if (!nul(residu)) etapes.push(`Tiroir : ${eur(tiroirCompte ?? 0)} compté pour ${eur(tiroirAttendu)} attendu (${signe(ecartTiroir)}). Règle d'abord la carte : l'écart du tiroir se juge quand la carte est juste.`);
    else if (ecartTiroir > 0) etapes.push(`Tiroir : ${eur(ecartTiroir)} de trop perçu (${eur(tiroirCompte ?? 0)} compté pour ${eur(tiroirAttendu)} attendu). À donner aux pourboires de l'équipe.`);
    else etapes.push(`Tiroir : il manque ${eur(-ecartTiroir)} (${eur(tiroirCompte ?? 0)} compté pour ${eur(tiroirAttendu)} attendu). Erreur de rendu de monnaie : à prendre dans les pourboires.`);
  }
  if (pourboiresPopina > 0.005) etapes.push(`Pourboires saisis dans Popina pour des factures : ${eur(pourboiresPopina)}. Annule-les avant d'arrêter la caisse, comme convenu ; le calcul en tient déjà compte.`);
  if (niveau === "ok" && ajustement != null) etapes.push(`Ajustement de ${signe(-ajustement)} en prix sur mesure : il doit être noté dans les corrections avant de valider.`);
  return { ...base, niveau, titre, etapes, petitEcart, ajustement, erreurEspecesCarte };
}

/** Récap à copier (message à l'équipe ou à Paul) */
export function recapCloture(jour: string, s: SaisieCloture, r: ResultatCloture, corrections: string[]): string {
  const lignes = [
    `Clôture Bello Mio du ${new Date(`${jour}T12:00:00`).toLocaleDateString("fr-FR")}`,
    `Verdict : ${r.titre}`,
    ...r.lignes.map((l) => `${l.libelle} : Popina ${eur(l.popina)} pour ${eur(l.attendu)} attendu (${nul(l.ecart) ? "juste" : signe(l.ecart)})`),
    `Pourboires carte pour la paie : ${eur(r.pourboiresPaie)}${r.pourboireAmex > 0 ? ` (dont AMEX ${eur(r.pourboireAmex)})` : ""}`,
    r.pourboiresEspeces != null ? `Pourboires espèces (cagnotte vidée) : ${eur(r.pourboiresEspeces)}` : null,
    r.ecartTiroir != null ? `Tiroir : ${eur(r.tiroirCompte ?? 0)} pour ${eur(r.tiroirAttendu)} attendu (${nul(r.ecartTiroir) ? "juste" : signe(r.ecartTiroir)})` : null,
    r.enveloppe != null ? `Enveloppe banque : ${eur(r.enveloppe)} · fond laissé : ${eur(FOND_CIBLE)}` : null,
    ...corrections.map((c) => `Correction : ${c}`),
    ...r.etapes.map((e) => `• ${e}`),
  ];
  return lignes.filter(Boolean).join("\n");
}
