/**
 * useConventionLegale — Moteur légal HCR IDCC 1979 / IDCC 1501
 *
 * Calcule les heures supplémentaires, complémentaires, alertes légales,
 * repos compensateurs et repas pour un employé sur une semaine donnée.
 */

// ============================================================
// Types
// ============================================================

export type ShiftInput = {
  date: string;          // 'YYYY-MM-DD'
  heure_debut: string;   // 'HH:MM'
  heure_fin: string;     // 'HH:MM'
  pause_minutes: number;
  heures_reelles_debut?: string;
  heures_reelles_fin?: string;
  pause_reelle_minutes?: number;
};

export type ContratInput = {
  type: string;          // 'CDI'|'CDD'|'extra'|...
  heures_semaine: number;
  convention: 'HCR_1979' | 'RAPIDE_1501';
};

export type Alerte = {
  type: 'amplitude_max' | 'repos_insuffisant' | 'duree_max_jour' | 'duree_max_semaine';
  employe_id: string;
  date: string;
  message: string;
  valeur_constatee: number;
  valeur_max: number;
};

export type BilanSemaine = {
  heures_travaillees: number;
  heures_normales: number;
  heures_supp_25: number;   // legacy (toujours 0, ni HCR ni RAPIDE n'utilisent 25%)
  heures_supp_50: number;   // >43h (les deux conventions)
  heures_supp_10: number;   // HCR : contrat→39h / RAPIDE : 35→39h
  heures_supp_20: number;   // 39h→43h (les deux conventions)
  heures_comp_10: number;   // temps partiel <1/10
  heures_comp_25: number;   // temps partiel 1/10-1/3
  delta_contrat: number;    // positif = dépassement, négatif = manque
  rc_acquis: number;
  nb_repas: number;
  alertes: Alerte[];
};

// ============================================================
// Constantes légales
// ============================================================

const HCR_SEUIL_LEGAL = 35;
const HCR_SEUIL_SUP_10 = 39; // de contrat+1 à 39h (HS 10%)
const HCR_SEUIL_SUP_20 = 43; // de 39h01 à 43h (HS 20%)
const HCR_AMPLITUDE_MAX = 13; // heures
const HCR_REPOS_MIN = 11;     // heures entre deux jours
const HCR_DUREE_MAX_JOUR = 10; // heures nettes
const HCR_DUREE_MAX_SEMAINE = 48;
const HCR_CONTINGENT_ANNUEL = 220; // heures sup avant RC obligatoire

const RAPIDE_SEUIL_LEGAL = 35;
const RAPIDE_SEUIL_SUP_10 = 39; // de 35h01 à 39h
const RAPIDE_SEUIL_SUP_20 = 43; // de 39h01 à 43h

// ============================================================
// Utilitaires
// ============================================================

/** Convertit "HH:MM" en minutes depuis minuit */
function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** Calcule la durée nette d'un shift en heures (avec pause) */
function shiftDureeNette(shift: ShiftInput): number {
  const debut = shift.heures_reelles_debut ?? shift.heure_debut;
  const fin = shift.heures_reelles_fin ?? shift.heure_fin;
  const pause = shift.pause_reelle_minutes ?? shift.pause_minutes;

  let minutes = timeToMinutes(fin) - timeToMinutes(debut);
  // Gestion shifts qui passent minuit
  if (minutes < 0) minutes += 24 * 60;
  // Retirer la pause
  minutes -= pause;
  return Math.max(0, minutes / 60);
}

/** Calcule la durée brute d'un shift en heures (sans retirer la pause) */
function shiftDureeBrute(shift: ShiftInput): number {
  const debut = shift.heures_reelles_debut ?? shift.heure_debut;
  const fin = shift.heures_reelles_fin ?? shift.heure_fin;

  let minutes = timeToMinutes(fin) - timeToMinutes(debut);
  if (minutes < 0) minutes += 24 * 60;
  return minutes / 60;
}

/** Groupe les shifts par date */
function groupByDate(shifts: ShiftInput[]): Map<string, ShiftInput[]> {
  const map = new Map<string, ShiftInput[]>();
  for (const s of shifts) {
    const existing = map.get(s.date) ?? [];
    existing.push(s);
    map.set(s.date, existing);
  }
  return map;
}

/** Trie les dates chronologiquement */
function sortedDates(dates: string[]): string[] {
  return [...dates].sort();
}

// ============================================================
// Calculs alertes quotidiennes
// ============================================================

function calculerAlertesJour(
  shiftsJour: ShiftInput[],
  employeId: string,
  date: string
): { alertes: Alerte[]; dureeNette: number } {
  const alertes: Alerte[] = [];

  if (shiftsJour.length === 0) return { alertes, dureeNette: 0 };

  // Durée nette totale du jour
  const dureeNette = shiftsJour.reduce((sum, s) => sum + shiftDureeNette(s), 0);

  // Alerte durée max jour (10h nettes)
  if (dureeNette > HCR_DUREE_MAX_JOUR) {
    alertes.push({
      type: 'duree_max_jour',
      employe_id: employeId,
      date,
      message: `Durée de travail de ${formatHeures(dureeNette)} le ${date}, la loi autorise un maximum de ${HCR_DUREE_MAX_JOUR}h par jour.`,
      valeur_constatee: round2(dureeNette),
      valeur_max: HCR_DUREE_MAX_JOUR,
    });
  }

  // Amplitude quotidienne (premier début → dernière fin)
  const debuts = shiftsJour.map(s => timeToMinutes(s.heures_reelles_debut ?? s.heure_debut));
  const fins = shiftsJour.map(s => timeToMinutes(s.heures_reelles_fin ?? s.heure_fin));
  const premierDebut = Math.min(...debuts);
  let derniereFin = Math.max(...fins);

  // Gestion shifts passant minuit
  if (derniereFin < premierDebut) derniereFin += 24 * 60;

  const amplitude = (derniereFin - premierDebut) / 60;

  if (amplitude > HCR_AMPLITUDE_MAX) {
    alertes.push({
      type: 'amplitude_max',
      employe_id: employeId,
      date,
      message: `Amplitude horaire de ${formatHeures(amplitude)} le ${date}, la loi autorise une amplitude horaire quotidienne de ${HCR_AMPLITUDE_MAX}h maximum.`,
      valeur_constatee: round2(amplitude),
      valeur_max: HCR_AMPLITUDE_MAX,
    });
  }

  return { alertes, dureeNette };
}

/** Vérifie le repos entre deux jours consécutifs */
function calculerReposEntreJours(
  shiftsJourJ: ShiftInput[],
  shiftsJourJ1: ShiftInput[],
  employeId: string,
  dateJ1: string
): Alerte | null {
  if (shiftsJourJ.length === 0 || shiftsJourJ1.length === 0) return null;

  // Dernière fin de J
  const finsJ = shiftsJourJ.map(s => timeToMinutes(s.heures_reelles_fin ?? s.heure_fin));
  const derniereFin = Math.max(...finsJ);

  // Premier début de J+1
  const debutsJ1 = shiftsJourJ1.map(s => timeToMinutes(s.heures_reelles_debut ?? s.heure_debut));
  const premierDebut = Math.min(...debutsJ1);

  // Repos = (24h - derniereFin) + premierDebut
  const repos = (24 * 60 - derniereFin + premierDebut) / 60;

  if (repos < HCR_REPOS_MIN) {
    return {
      type: 'repos_insuffisant',
      employe_id: employeId,
      date: dateJ1,
      message: `Repos de ${formatHeures(repos)} avant le ${dateJ1}, la loi impose un repos quotidien minimum de ${HCR_REPOS_MIN}h.`,
      valeur_constatee: round2(repos),
      valeur_max: HCR_REPOS_MIN,
    };
  }

  return null;
}

// ============================================================
// Calcul bilan semaine
// ============================================================

export function calculerBilanSemaine(
  shifts: ShiftInput[],
  contrat: ContratInput,
  employeId: string
): BilanSemaine {
  const byDate = groupByDate(shifts);
  const dates = sortedDates([...byDate.keys()]);

  let heuresTotales = 0;
  const alertes: Alerte[] = [];
  let nbRepas = 0;

  // Calculs quotidiens
  for (const date of dates) {
    const shiftsJour = byDate.get(date)!;
    const { alertes: alertesJour, dureeNette } = calculerAlertesJour(
      shiftsJour,
      employeId,
      date
    );
    heuresTotales += dureeNette;
    alertes.push(...alertesJour);

    // 1 repas par shift
    nbRepas += shiftsJour.length;
  }

  // Repos entre jours consécutifs
  for (let i = 0; i < dates.length - 1; i++) {
    const dateJ = dates[i];
    const dateJ1 = dates[i + 1];

    // Vérifier que les dates sont consécutives
    const d1 = new Date(dateJ);
    const d2 = new Date(dateJ1);
    const diffDays = (d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24);

    if (diffDays === 1) {
      const alerte = calculerReposEntreJours(
        byDate.get(dateJ)!,
        byDate.get(dateJ1)!,
        employeId,
        dateJ1
      );
      if (alerte) alertes.push(alerte);
    }
  }

  // Alerte durée max semaine
  if (heuresTotales > HCR_DUREE_MAX_SEMAINE) {
    alertes.push({
      type: 'duree_max_semaine',
      employe_id: employeId,
      date: dates[0] ?? '',
      message: `${formatHeures(heuresTotales)} travaillées cette semaine, la loi autorise un maximum de ${HCR_DUREE_MAX_SEMAINE}h hebdomadaires.`,
      valeur_constatee: round2(heuresTotales),
      valeur_max: HCR_DUREE_MAX_SEMAINE,
    });
  }

  // Calcul heures sup/comp selon convention
  const bilan = calculerHeuresSup(heuresTotales, contrat);

  return {
    ...bilan,
    heures_travaillees: round2(heuresTotales),
    delta_contrat: round2(heuresTotales - contrat.heures_semaine),
    nb_repas: nbRepas,
    alertes,
  };
}

// ============================================================
// Calcul heures supplémentaires / complémentaires
// ============================================================

function calculerHeuresSup(
  heuresTotales: number,
  contrat: ContratInput
): Omit<BilanSemaine, 'heures_travaillees' | 'delta_contrat' | 'nb_repas' | 'alertes'> {
  const isTempsPartiel = contrat.heures_semaine < HCR_SEUIL_LEGAL;

  if (contrat.convention === 'HCR_1979') {
    return calculerHeuresSupHCR(heuresTotales, contrat, isTempsPartiel);
  } else {
    return calculerHeuresSupRapide(heuresTotales, contrat, isTempsPartiel);
  }
}

function calculerHeuresSupHCR(
  heures: number,
  contrat: ContratInput,
  isTempsPartiel: boolean
): Omit<BilanSemaine, 'heures_travaillees' | 'delta_contrat' | 'nb_repas' | 'alertes'> {
  let heures_normales = 0;
  let heures_supp_10 = 0;
  let heures_supp_20 = 0;
  let heures_supp_50 = 0;
  let heures_comp_10 = 0;
  let heures_comp_25 = 0;
  let rc_acquis = 0;

  if (isTempsPartiel) {
    // Temps partiel : heures complémentaires
    const seuilComp10 = contrat.heures_semaine * 1.1;
    const seuilComp25 = contrat.heures_semaine * (1 + 1 / 3);

    heures_normales = Math.min(heures, contrat.heures_semaine);

    if (heures > contrat.heures_semaine) {
      if (heures <= seuilComp10) {
        heures_comp_10 = round2(heures - contrat.heures_semaine);
      } else if (heures <= seuilComp25) {
        heures_comp_10 = round2(seuilComp10 - contrat.heures_semaine);
        heures_comp_25 = round2(heures - seuilComp10);
      } else {
        heures_comp_10 = round2(seuilComp10 - contrat.heures_semaine);
        heures_comp_25 = round2(seuilComp25 - seuilComp10);
        // Au-delà de 1/3, heures sup selon seuils HCR
        if (heures > HCR_SEUIL_LEGAL) {
          heures_supp_10 = round2(Math.min(heures, HCR_SEUIL_SUP_10) - HCR_SEUIL_LEGAL);
          heures_supp_20 = round2(Math.max(0, Math.min(heures, HCR_SEUIL_SUP_20) - HCR_SEUIL_SUP_10));
          heures_supp_50 = round2(Math.max(0, heures - HCR_SEUIL_SUP_20));
        }
      }
    }
  } else {
    // Temps plein : heures supplémentaires
    // Contract-aware: normal hours = up to contract hours (which is >= 35h)
    // HS bands start from contract hours, not from 35h
    //
    // 43h contract: normal up to 43h, >43h = HS50
    // 39h contract: normal up to 39h, 39→43h = HS20, >43h = HS50
    // 35h contract: normal up to 35h, 35→39h = HS10, 39→43h = HS20, >43h = HS50
    // Extra: treated as 39h threshold (normal up to 39h)
    const seuil = contrat.type === 'extra'
      ? HCR_SEUIL_SUP_10 // extras: seuil = 39h
      : contrat.heures_semaine;

    heures_normales = Math.min(heures, seuil);

    if (heures > seuil) {
      // HS10: from seuil to 39h (only if seuil < 39)
      if (seuil < HCR_SEUIL_SUP_10) {
        heures_supp_10 = round2(Math.min(heures, HCR_SEUIL_SUP_10) - seuil);
      }
      // HS20: from max(seuil, 39) to 43h
      const seuil20 = Math.max(seuil, HCR_SEUIL_SUP_10);
      if (heures > seuil20 && seuil20 < HCR_SEUIL_SUP_20) {
        heures_supp_20 = round2(Math.min(heures, HCR_SEUIL_SUP_20) - seuil20);
      }
      // HS50: above 43h
      heures_supp_50 = round2(Math.max(0, heures - HCR_SEUIL_SUP_20));
    }

    // RC acquis : majoration convertie en repos
    // HS10 → 10% en repos, HS20 → 20%, HS50 → 50%
    rc_acquis = round2(
      heures_supp_10 * 0.10 +
      heures_supp_20 * 0.20 +
      heures_supp_50 * 0.50
    );
  }

  return {
    heures_normales: round2(heures_normales),
    heures_supp_25: 0, // HCR n'utilise pas HS25
    heures_supp_50: round2(heures_supp_50),
    heures_supp_10: round2(heures_supp_10),
    heures_supp_20: round2(heures_supp_20),
    heures_comp_10: round2(heures_comp_10),
    heures_comp_25: round2(heures_comp_25),
    rc_acquis,
  };
}

function calculerHeuresSupRapide(
  heures: number,
  contrat: ContratInput,
  isTempsPartiel: boolean
): Omit<BilanSemaine, 'heures_travaillees' | 'delta_contrat' | 'nb_repas' | 'alertes'> {
  let heures_normales = 0;
  let heures_supp_10 = 0;
  let heures_supp_20 = 0;
  let heures_supp_50 = 0;
  let heures_comp_10 = 0;
  let heures_comp_25 = 0;

  if (isTempsPartiel) {
    const seuilComp10 = contrat.heures_semaine * 1.1;
    const seuilComp25 = contrat.heures_semaine * (1 + 1 / 3);

    heures_normales = Math.min(heures, contrat.heures_semaine);

    if (heures > contrat.heures_semaine) {
      if (heures <= seuilComp10) {
        heures_comp_10 = round2(heures - contrat.heures_semaine);
      } else if (heures <= seuilComp25) {
        heures_comp_10 = round2(seuilComp10 - contrat.heures_semaine);
        heures_comp_25 = round2(heures - seuilComp10);
      } else {
        heures_comp_10 = round2(seuilComp10 - contrat.heures_semaine);
        heures_comp_25 = round2(seuilComp25 - seuilComp10);
        if (heures > RAPIDE_SEUIL_LEGAL) {
          heures_supp_10 = round2(Math.min(heures, RAPIDE_SEUIL_SUP_10) - RAPIDE_SEUIL_LEGAL);
          heures_supp_20 = round2(Math.min(heures, RAPIDE_SEUIL_SUP_20) - RAPIDE_SEUIL_SUP_10);
          heures_supp_50 = round2(Math.max(0, heures - RAPIDE_SEUIL_SUP_20));
        }
      }
    }
  } else {
    heures_normales = Math.min(heures, RAPIDE_SEUIL_LEGAL);

    if (heures > RAPIDE_SEUIL_LEGAL) {
      // Sup 10% : de 35h01 à 39h
      heures_supp_10 = round2(Math.min(heures, RAPIDE_SEUIL_SUP_10) - RAPIDE_SEUIL_LEGAL);
      // Sup 20% : de 39h01 à 43h
      heures_supp_20 = round2(Math.min(heures, RAPIDE_SEUIL_SUP_20) - RAPIDE_SEUIL_SUP_10);
      // Sup 50% : au-delà de 43h
      heures_supp_50 = round2(Math.max(0, heures - RAPIDE_SEUIL_SUP_20));
    }
  }

  return {
    heures_normales: round2(heures_normales),
    heures_supp_25: 0, // IDCC 1501 n'a pas de sup 25%
    heures_supp_50: round2(heures_supp_50),
    heures_supp_10: round2(heures_supp_10),
    heures_supp_20: round2(heures_supp_20),
    heures_comp_10: round2(heures_comp_10),
    heures_comp_25: round2(heures_comp_25),
    rc_acquis: 0,
  };
}

// ============================================================
// Calcul bilan mensuel (agrégation de semaines)
// ============================================================

export type BilanMensuel = {
  heures_travaillees: number;
  heures_normales: number;
  heures_supp_25: number;
  heures_supp_50: number;
  heures_supp_10: number;
  heures_supp_20: number;
  heures_comp_10: number;
  heures_comp_25: number;
  delta_contrat: number;
  rc_acquis: number;
  nb_repas: number;
  jours_travailles: number;
  alertes: Alerte[];
  bilans_semaines: BilanSemaine[];
};

/**
 * Calcule le bilan mensuel en agrégeant les bilans semaine par semaine.
 * Les shifts doivent être triés par date.
 * La semaine ISO (lundi → dimanche) est utilisée.
 */
export function calculerBilanMensuel(
  shifts: ShiftInput[],
  contrat: ContratInput,
  employeId: string
): BilanMensuel {
  // Grouper par semaine ISO
  const byWeek = new Map<string, ShiftInput[]>();
  for (const s of shifts) {
    const weekKey = getISOWeekKey(s.date);
    const existing = byWeek.get(weekKey) ?? [];
    existing.push(s);
    byWeek.set(weekKey, existing);
  }

  const bilans: BilanSemaine[] = [];
  let totalHeures = 0;
  let totalRepas = 0;
  let totalSupp25 = 0;
  let totalSupp50 = 0;
  let totalSupp10 = 0;
  let totalSupp20 = 0;
  let totalComp10 = 0;
  let totalComp25 = 0;
  let totalNormales = 0;
  let totalRC = 0;
  const allAlertes: Alerte[] = [];

  // Calculer les jours distincts travaillés
  const joursTravailles = new Set(shifts.map(s => s.date)).size;

  for (const [, weekShifts] of byWeek) {
    const bilan = calculerBilanSemaine(weekShifts, contrat, employeId);
    bilans.push(bilan);
    totalHeures += bilan.heures_travaillees;
    totalRepas += bilan.nb_repas;
    totalSupp25 += bilan.heures_supp_25;
    totalSupp50 += bilan.heures_supp_50;
    totalSupp10 += bilan.heures_supp_10;
    totalSupp20 += bilan.heures_supp_20;
    totalComp10 += bilan.heures_comp_10;
    totalComp25 += bilan.heures_comp_25;
    totalNormales += bilan.heures_normales;
    totalRC += bilan.rc_acquis;
    allAlertes.push(...bilan.alertes);
  }

  // Delta mensuel : heures contractuelles mensuelles estimées
  const semainesMois = shifts.length > 0 ? byWeek.size : 0;
  const heuresContratMois = contrat.heures_semaine * semainesMois;

  return {
    heures_travaillees: round2(totalHeures),
    heures_normales: round2(totalNormales),
    heures_supp_25: round2(totalSupp25),
    heures_supp_50: round2(totalSupp50),
    heures_supp_10: round2(totalSupp10),
    heures_supp_20: round2(totalSupp20),
    heures_comp_10: round2(totalComp10),
    heures_comp_25: round2(totalComp25),
    delta_contrat: round2(totalHeures - heuresContratMois),
    rc_acquis: round2(totalRC),
    nb_repas: totalRepas,
    jours_travailles: joursTravailles,
    alertes: allAlertes,
    bilans_semaines: bilans,
  };
}

// ============================================================
// Export SILAE
// ============================================================

export type ExportSilaeRow = {
  matricule: string;
  code: string;
  valeur: string;
  date_debut: string; // DD/MM/YYYY
  date_fin: string;   // DD/MM/YYYY
};

export function genererExportSilae(
  bilan: BilanMensuel,
  matricule: string,
  contratType: string,
  dateDebut: string, // YYYY-MM-DD (premier jour du mois)
  dateFin: string,   // YYYY-MM-DD (dernier jour du mois)
  absences?: Array<{ type: string; code_silae?: string; date_debut: string; date_fin: string; nb_jours: number }>,
  soldeRC?: number,
  options?: {
    dateEntree?: string;   // YYYY-MM-DD — date d'entrée si en cours de mois
    dateSortie?: string;   // YYYY-MM-DD — date de sortie si en cours de mois
    heuresMensuellesRef?: number; // heures mensuelles contractuelles (ex: 169 pour 39h)
  }
): ExportSilaeRow[] {
  const rows: ExportSilaeRow[] = [];
  const mat = matricule.padStart(5, '0');
  const ddFr = formatDateFR(dateDebut);
  const dfFr = formatDateFR(dateFin);

  // Dates effectives (restreintes si entrée/sortie en cours de mois)
  const ddEff = options?.dateEntree ? formatDateFR(options.dateEntree) : ddFr;
  const dfEff = options?.dateSortie ? formatDateFR(options.dateSortie) : dfFr;

  // Avantage en nature repas
  if (bilan.nb_repas > 0) {
    rows.push({ matricule: mat, code: 'EV-A01', valeur: formatValeur(bilan.nb_repas), date_debut: ddEff, date_fin: dfEff });
  }

  // Entrée / Sortie (prorata heures contractuelles non travaillées)
  if (options?.dateEntree || options?.dateSortie) {
    const entreeSortie = calculerEntreeSortie(dateDebut, dateFin, options.dateEntree, options.dateSortie, options.heuresMensuellesRef);
    if (entreeSortie > 0) {
      rows.push({ matricule: mat, code: 'Entree / Sortie', valeur: formatValeur(entreeSortie), date_debut: ddEff, date_fin: dfEff });
    }
  }

  // Heures sup
  if (bilan.heures_supp_10 > 0) {
    rows.push({ matricule: mat, code: 'HS-HS10', valeur: formatValeur(bilan.heures_supp_10), date_debut: ddEff, date_fin: dfEff });
  }
  if (bilan.heures_supp_20 > 0) {
    rows.push({ matricule: mat, code: 'HS-HS20', valeur: formatValeur(bilan.heures_supp_20), date_debut: ddEff, date_fin: dfEff });
  }
  if (bilan.heures_supp_25 > 0) {
    rows.push({ matricule: mat, code: 'HS-HS25', valeur: formatValeur(bilan.heures_supp_25), date_debut: ddEff, date_fin: dfEff });
  }
  if (bilan.heures_supp_50 > 0) {
    rows.push({ matricule: mat, code: 'HS-HS50', valeur: formatValeur(bilan.heures_supp_50), date_debut: ddEff, date_fin: dfEff });
  }

  // Jours travaillés (format entier, pas de décimale)
  if (bilan.jours_travailles > 0) {
    rows.push({ matricule: mat, code: 'Nombre total de jours travailles', valeur: String(Math.round(bilan.jours_travailles)), date_debut: ddEff, date_fin: dfEff });
  }

  // Heures travaillées
  if (bilan.heures_travaillees > 0) {
    const codeHeures = contratType === 'extra' ? 'Heures travaillees (extra)' : 'Heures travaillees';
    rows.push({ matricule: mat, code: codeHeures, valeur: formatValeur(bilan.heures_travaillees), date_debut: ddEff, date_fin: dfEff });
  }

  // Solde RC
  if (soldeRC !== undefined && soldeRC > 0) {
    rows.push({ matricule: mat, code: 'Nouveau solde RCR', valeur: formatValeur(soldeRC), date_debut: ddEff, date_fin: dfEff });
  }

  // Absences
  if (absences) {
    for (const abs of absences) {
      if (abs.code_silae && abs.nb_jours > 0) {
        rows.push({
          matricule: mat,
          code: abs.code_silae,
          valeur: formatValeur(abs.nb_jours),
          date_debut: formatDateFR(abs.date_debut),
          date_fin: formatDateFR(abs.date_fin),
        });
      }
    }
  }

  return rows;
}

export function exportSilaeToCSV(rows: ExportSilaeRow[]): string {
  const header = 'Matricule;Code;Valeur;Date debut;Date fin';
  const lines = rows.map(r => `${r.matricule};${r.code};${r.valeur};${r.date_debut};${r.date_fin}`);
  return [header, ...lines].join('\n');
}

// ============================================================
// Entrée / Sortie en cours de mois
// ============================================================

/** Compte les jours ouvrés (lun-ven) entre deux dates incluses */
function joursOuvres(debut: string, fin: string): number {
  let count = 0;
  const d = new Date(debut + 'T00:00:00');
  const end = new Date(fin + 'T00:00:00');
  while (d <= end) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

/**
 * Calcule la valeur "Entree / Sortie" = heures contractuelles non travaillées
 * du fait d'une entrée tardive ou sortie anticipée dans le mois.
 *
 * Méthode : prorata des jours ouvrés absents sur le total du mois
 * × heures mensuelles de référence (heures_semaine × 52/12)
 */
function calculerEntreeSortie(
  debutMois: string,
  finMois: string,
  dateEntree?: string,
  dateSortie?: string,
  heuresMensuellesRef?: number
): number {
  const joursTotal = joursOuvres(debutMois, finMois);
  if (joursTotal === 0) return 0;

  // Jours ouvrés effectivement présent
  const debutPresence = dateEntree ?? debutMois;
  const finPresence = dateSortie ?? finMois;
  const joursPresent = joursOuvres(debutPresence, finPresence);

  const joursAbsent = joursTotal - joursPresent;
  if (joursAbsent <= 0) return 0;

  // Heures mensuelles de référence (par défaut 151.67h = 35h × 52/12)
  const heuresRef = heuresMensuellesRef ?? 151.67;

  return round2((joursAbsent / joursTotal) * heuresRef);
}

// ============================================================
// Helpers
// ============================================================

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatHeures(h: number): string {
  const heures = Math.floor(h);
  const minutes = Math.round((h - heures) * 60);
  return `${heures}h${minutes.toString().padStart(2, '0')}`;
}

function formatDateFR(dateISO: string): string {
  // YYYY-MM-DD → DD/MM/YYYY
  const [y, m, d] = dateISO.split('-');
  return `${d}/${m}/${y}`;
}

function formatValeur(v: number): string {
  // SILAE format: always at least 1 decimal place
  // 36 → "36.0", 9.42 → "9.42", 163 → "163.0", 0 → "0.0"
  return v.toFixed(2).replace(/0$/, '');
}

/** Retourne la clé de semaine ISO (YYYY-WXX) */
function getISOWeekKey(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  const dayOfWeek = date.getDay() || 7; // 1=lundi, 7=dimanche
  // Jeudi de la même semaine ISO
  const thursday = new Date(date);
  thursday.setDate(date.getDate() + (4 - dayOfWeek));
  const yearStart = new Date(thursday.getFullYear(), 0, 1);
  const weekNo = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${thursday.getFullYear()}-W${weekNo.toString().padStart(2, '0')}`;
}

// Export constants for testing
export const CONSTANTS = {
  HCR_SEUIL_LEGAL,
  HCR_SEUIL_SUP_10,
  HCR_SEUIL_SUP_20,
  HCR_AMPLITUDE_MAX,
  HCR_REPOS_MIN,
  HCR_DUREE_MAX_JOUR,
  HCR_DUREE_MAX_SEMAINE,
  HCR_CONTINGENT_ANNUEL,
  RAPIDE_SEUIL_LEGAL,
  RAPIDE_SEUIL_SUP_10,
  RAPIDE_SEUIL_SUP_20,
};

// Export utilities for testing
export { timeToMinutes, shiftDureeNette, shiftDureeBrute, formatHeures, formatDateFR, formatValeur, getISOWeekKey, joursOuvres, calculerEntreeSortie };
