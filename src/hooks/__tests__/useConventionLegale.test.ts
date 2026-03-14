import { describe, it, expect } from 'vitest';
import {
  calculerBilanSemaine,
  // calculerBilanMensuel,
  genererExportSilae,
  exportSilaeToCSV,
  timeToMinutes,
  shiftDureeNette,
  formatHeures,
  formatDateFR,
  formatValeur,
  getISOWeekKey,
  joursOuvres,
  calculerEntreeSortie,
  type ShiftInput,
  type ContratInput,
} from '../useConventionLegale';

// ============================================================
// Utilitaires
// ============================================================

describe('timeToMinutes', () => {
  it('convertit 09:00 en 540', () => {
    expect(timeToMinutes('09:00')).toBe(540);
  });
  it('convertit 23:30 en 1410', () => {
    expect(timeToMinutes('23:30')).toBe(1410);
  });
  it('convertit 00:00 en 0', () => {
    expect(timeToMinutes('00:00')).toBe(0);
  });
});

describe('shiftDureeNette', () => {
  it('calcule correctement un shift standard', () => {
    const shift: ShiftInput = { date: '2026-03-09', heure_debut: '09:00', heure_fin: '14:30', pause_minutes: 30 };
    // 5h30 - 30min pause = 5h00
    expect(shiftDureeNette(shift)).toBe(5);
  });

  it('utilise les heures réelles si disponibles', () => {
    const shift: ShiftInput = {
      date: '2026-03-09',
      heure_debut: '09:00', heure_fin: '14:30', pause_minutes: 30,
      heures_reelles_debut: '09:15', heures_reelles_fin: '14:45', pause_reelle_minutes: 30,
    };
    // 5h30 - 30min = 5h00
    expect(shiftDureeNette(shift)).toBe(5);
  });
});

describe('formatHeures', () => {
  it('formate 7.5 en 7h30', () => {
    expect(formatHeures(7.5)).toBe('7h30');
  });
  it('formate 13.67 en 13h40', () => {
    expect(formatHeures(13 + 40/60)).toBe('13h40');
  });
});

describe('formatDateFR', () => {
  it('convertit YYYY-MM-DD en DD/MM/YYYY', () => {
    expect(formatDateFR('2026-02-01')).toBe('01/02/2026');
  });
});

describe('formatValeur', () => {
  it('entier avec 1 décimale (format SILAE)', () => {
    expect(formatValeur(36)).toBe('36.0');
  });
  it('décimal avec 2 chiffres', () => {
    expect(formatValeur(9.42)).toBe('9.42');
  });
  it('supprime un seul zéro trailing', () => {
    expect(formatValeur(177.80)).toBe('177.8');
  });
  it('zéro → 0.0', () => {
    expect(formatValeur(0)).toBe('0.0');
  });
});

describe('getISOWeekKey', () => {
  it('retourne la bonne semaine ISO', () => {
    // Lundi 9 mars 2026 = semaine 11
    expect(getISOWeekKey('2026-03-09')).toBe('2026-W11');
    // Dimanche 15 mars 2026 = encore semaine 11
    expect(getISOWeekKey('2026-03-15')).toBe('2026-W11');
  });
});

// ============================================================
// Bilan Semaine — HCR IDCC 1979
// ============================================================

describe('calculerBilanSemaine HCR', () => {
  const contrat43h: ContratInput = { type: 'CDI', heures_semaine: 43, convention: 'HCR_1979' };
  const contrat39h: ContratInput = { type: 'CDI', heures_semaine: 39, convention: 'HCR_1979' };

  // --- Test données réelles : Jacques Tessier S11 ---
  // 43h50 travaillées, contrat 43h → heures sup 50% = 0h50
  it('Jacques Tessier S11 : 43h50 → heures sup 50%', () => {
    // Simuler ~43h50 de travail sur la semaine (6 jours de ~7h18)
    const shifts: ShiftInput[] = [
      // Lundi : 9h00-16h30 (30min pause) = 7h00
      { date: '2026-03-09', heure_debut: '09:00', heure_fin: '16:30', pause_minutes: 30 },
      // Mardi : 9h00-16h45 (30min) = 7h15
      { date: '2026-03-10', heure_debut: '09:00', heure_fin: '16:45', pause_minutes: 30 },
      // Mercredi : 9h00-16h45 (30min) = 7h15
      { date: '2026-03-11', heure_debut: '09:00', heure_fin: '16:45', pause_minutes: 30 },
      // Jeudi : 9h00-16h50 (30min) = 7h20
      { date: '2026-03-12', heure_debut: '09:00', heure_fin: '16:50', pause_minutes: 30 },
      // Vendredi : 9h00-16h30 (30min) = 7h00
      { date: '2026-03-13', heure_debut: '09:00', heure_fin: '16:30', pause_minutes: 30 },
      // Samedi : 9h00-17h30 (30min) = 8h00
      { date: '2026-03-14', heure_debut: '09:00', heure_fin: '17:30', pause_minutes: 30 },
    ];

    const bilan = calculerBilanSemaine(shifts, contrat43h, 'jacques-tessier');

    // Total = 7 + 7.25 + 7.25 + 7.33 + 7 + 8 = 43.83h
    expect(bilan.heures_travaillees).toBeCloseTo(43.83, 1);
    // Heures normales = 43h (contract-aware: normal up to contract hours)
    expect(bilan.heures_normales).toBe(43);
    // Pas de HS10/HS20 pour contrat 43h
    expect(bilan.heures_supp_10).toBe(0);
    expect(bilan.heures_supp_20).toBe(0);
    // Sup 50% = 43.83 - 43 = 0.83h
    expect(bilan.heures_supp_50).toBeCloseTo(0.83, 1);
    // Delta = 43.83 - 43 = +0.83
    expect(bilan.delta_contrat).toBeCloseTo(0.83, 1);
    // 6 shifts = 6 repas
    expect(bilan.nb_repas).toBe(6);
    // Pas d'alerte (amplitude max 8h30 < 13h)
    expect(bilan.alertes).toHaveLength(0);
  });

  // --- Test données réelles : Gwendal Barbot S11 ---
  // 37h30 travaillées, contrat 39h → delta -1h30
  it('Gwendal Barbot S11 : 37h30 → delta -1h30', () => {
    // 5 jours * 7h30 = 37h30
    const shifts: ShiftInput[] = [
      { date: '2026-03-09', heure_debut: '09:00', heure_fin: '17:00', pause_minutes: 30 },
      { date: '2026-03-10', heure_debut: '09:00', heure_fin: '17:00', pause_minutes: 30 },
      { date: '2026-03-11', heure_debut: '09:00', heure_fin: '17:00', pause_minutes: 30 },
      { date: '2026-03-12', heure_debut: '09:00', heure_fin: '17:00', pause_minutes: 30 },
      { date: '2026-03-13', heure_debut: '09:00', heure_fin: '17:00', pause_minutes: 30 },
    ];

    const bilan = calculerBilanSemaine(shifts, contrat39h, 'gwendal-barbot');

    // 5 * 7.5 = 37.5h
    expect(bilan.heures_travaillees).toBe(37.5);
    // Delta = 37.5 - 39 = -1.5
    expect(bilan.delta_contrat).toBe(-1.5);
    // Pas d'heures sup : en-dessous du contrat 39h
    expect(bilan.heures_supp_10).toBe(0);
    expect(bilan.heures_supp_20).toBe(0);
    expect(bilan.heures_supp_50).toBe(0);
    expect(bilan.nb_repas).toBe(5);
  });

  // --- Test : Paul Cochet S11 - pas d'alerte amplitude ---
  it('Paul Cochet S11 : amplitude 7h → pas d\'alerte', () => {
    const shifts: ShiftInput[] = [
      { date: '2026-03-09', heure_debut: '09:30', heure_fin: '16:30', pause_minutes: 30 },
    ];

    const bilan = calculerBilanSemaine(shifts, contrat39h, 'paul-cochet');
    expect(bilan.alertes).toHaveLength(0);
  });

  // --- Test : alerte amplitude avec coupure ---
  it('alerte amplitude avec coupure (9h-14h + 17h-23h = 14h)', () => {
    const shifts: ShiftInput[] = [
      { date: '2026-03-09', heure_debut: '09:00', heure_fin: '14:00', pause_minutes: 0 },
      { date: '2026-03-09', heure_debut: '17:00', heure_fin: '23:00', pause_minutes: 0 },
    ];

    const bilan = calculerBilanSemaine(shifts, contrat39h, 'test-amplitude');

    const alerteAmplitude = bilan.alertes.find(a => a.type === 'amplitude_max');
    expect(alerteAmplitude).toBeDefined();
    expect(alerteAmplitude!.valeur_constatee).toBe(14);
    expect(alerteAmplitude!.valeur_max).toBe(13);
  });

  // --- Test : alerte repos insuffisant ---
  it('alerte repos insuffisant (fin 23h → début 8h = 9h repos)', () => {
    const shifts: ShiftInput[] = [
      { date: '2026-03-09', heure_debut: '14:00', heure_fin: '23:00', pause_minutes: 30 },
      { date: '2026-03-10', heure_debut: '08:00', heure_fin: '16:00', pause_minutes: 30 },
    ];

    const bilan = calculerBilanSemaine(shifts, contrat39h, 'test-repos');

    const alerteRepos = bilan.alertes.find(a => a.type === 'repos_insuffisant');
    expect(alerteRepos).toBeDefined();
    expect(alerteRepos!.valeur_constatee).toBe(9); // 23h → 8h = 9h
    expect(alerteRepos!.valeur_max).toBe(11);
  });

  // --- Test : alerte durée max jour ---
  it('alerte durée max jour (>10h nettes)', () => {
    const shifts: ShiftInput[] = [
      { date: '2026-03-09', heure_debut: '07:00', heure_fin: '18:00', pause_minutes: 30 },
    ];

    const bilan = calculerBilanSemaine(shifts, contrat39h, 'test-duree');

    // 11h - 30min = 10h30 nettes > 10h
    const alerteDuree = bilan.alertes.find(a => a.type === 'duree_max_jour');
    expect(alerteDuree).toBeDefined();
    expect(alerteDuree!.valeur_constatee).toBe(10.5);
  });

  // --- Test : alerte durée max semaine (>48h) ---
  it('alerte durée max semaine (>48h)', () => {
    const shifts: ShiftInput[] = [];
    // 7 jours * 7h15 = 50h45 → alerte
    for (let i = 9; i <= 15; i++) {
      shifts.push({
        date: `2026-03-${i.toString().padStart(2, '0')}`,
        heure_debut: '09:00',
        heure_fin: '16:45',
        pause_minutes: 30,
      });
    }

    const bilan = calculerBilanSemaine(shifts, contrat43h, 'test-semaine-max');

    const alerteSemaine = bilan.alertes.find(a => a.type === 'duree_max_semaine');
    expect(alerteSemaine).toBeDefined();
    // 7 * 7.25 = 50.75h
    expect(alerteSemaine!.valeur_constatee).toBe(50.75);
  });

  // --- Test : temps partiel heures complémentaires ---
  it('temps partiel 24h : heures complémentaires', () => {
    const contrat24h: ContratInput = { type: 'CDI', heures_semaine: 24, convention: 'HCR_1979' };

    // 27h travaillées (24h + 3h)
    const shifts: ShiftInput[] = [
      { date: '2026-03-09', heure_debut: '09:00', heure_fin: '14:30', pause_minutes: 30 }, // 5h
      { date: '2026-03-10', heure_debut: '09:00', heure_fin: '14:30', pause_minutes: 30 }, // 5h
      { date: '2026-03-11', heure_debut: '09:00', heure_fin: '14:30', pause_minutes: 30 }, // 5h
      { date: '2026-03-12', heure_debut: '09:00', heure_fin: '15:30', pause_minutes: 30 }, // 6h
      { date: '2026-03-13', heure_debut: '09:00', heure_fin: '15:30', pause_minutes: 30 }, // 6h
    ];

    const bilan = calculerBilanSemaine(shifts, contrat24h, 'test-partiel');

    expect(bilan.heures_travaillees).toBe(27);
    expect(bilan.heures_normales).toBe(24);
    // +10% de 24h = 2.4h → heures_comp_10 = min(3, 2.4) = 2.4
    expect(bilan.heures_comp_10).toBeCloseTo(2.4, 1);
    // Le reste = 3 - 2.4 = 0.6 → heures_comp_25
    expect(bilan.heures_comp_25).toBeCloseTo(0.6, 1);
    expect(bilan.heures_supp_10).toBe(0);
    expect(bilan.heures_supp_50).toBe(0);
  });

  // --- Test : contrat 39h, 42h travaillées → HS20 uniquement ---
  it('contrat 39h, 42h → HS20 = 3h', () => {
    const shifts: ShiftInput[] = [];
    // 6 jours * 7h = 42h
    for (let i = 9; i <= 14; i++) {
      shifts.push({
        date: `2026-03-${i.toString().padStart(2, '0')}`,
        heure_debut: '09:00',
        heure_fin: '16:30',
        pause_minutes: 30,
      });
    }

    const bilan = calculerBilanSemaine(shifts, contrat39h, 'test-39h-ot');

    expect(bilan.heures_travaillees).toBe(42);
    expect(bilan.heures_normales).toBe(39);
    // Pas de HS10 pour contrat 39h (seuil déjà à 39h)
    expect(bilan.heures_supp_10).toBe(0);
    // HS20 = 42 - 39 = 3h
    expect(bilan.heures_supp_20).toBe(3);
    expect(bilan.heures_supp_50).toBe(0);
  });

  // --- Test : contrat 35h, 41h travaillées → HS10 + HS20 ---
  it('contrat 35h, 41h → HS10 = 4h, HS20 = 2h', () => {
    const contrat35h: ContratInput = { type: 'CDI', heures_semaine: 35, convention: 'HCR_1979' };
    const shifts: ShiftInput[] = [];
    // ~41h : 5 jours * 7h + 1 jour * 6h = 41h
    for (let i = 9; i <= 13; i++) {
      shifts.push({
        date: `2026-03-${i.toString().padStart(2, '0')}`,
        heure_debut: '09:00',
        heure_fin: '16:30',
        pause_minutes: 30, // 7h
      });
    }
    shifts.push({
      date: '2026-03-14',
      heure_debut: '09:00',
      heure_fin: '15:30',
      pause_minutes: 30, // 6h
    });

    const bilan = calculerBilanSemaine(shifts, contrat35h, 'test-35h-ot');

    expect(bilan.heures_travaillees).toBe(41);
    expect(bilan.heures_normales).toBe(35);
    // HS10 = 39 - 35 = 4h
    expect(bilan.heures_supp_10).toBe(4);
    // HS20 = 41 - 39 = 2h
    expect(bilan.heures_supp_20).toBe(2);
    expect(bilan.heures_supp_50).toBe(0);
  });

  // --- Test : extra 42h → HS20 = 3h (extras treated as 39h threshold) ---
  it('extra 42h → HS20 = 3h', () => {
    const contratExtra: ContratInput = { type: 'extra', heures_semaine: 39, convention: 'HCR_1979' };
    const shifts: ShiftInput[] = [];
    for (let i = 9; i <= 14; i++) {
      shifts.push({
        date: `2026-03-${i.toString().padStart(2, '0')}`,
        heure_debut: '09:00',
        heure_fin: '16:30',
        pause_minutes: 30, // 7h
      });
    }

    const bilan = calculerBilanSemaine(shifts, contratExtra, 'test-extra-ot');

    expect(bilan.heures_travaillees).toBe(42);
    expect(bilan.heures_normales).toBe(39);
    expect(bilan.heures_supp_10).toBe(0); // extras start at 39h
    expect(bilan.heures_supp_20).toBe(3);
    expect(bilan.heures_supp_50).toBe(0);
  });

  // --- Test : 1 repas par shift ---
  it('1 repas par shift même si court', () => {
    const shifts: ShiftInput[] = [
      { date: '2026-03-09', heure_debut: '14:30', heure_fin: '16:30', pause_minutes: 0 },
    ];

    const bilan = calculerBilanSemaine(shifts, contrat39h, 'test-repas');
    expect(bilan.nb_repas).toBe(1);
  });

  it('2 shifts le même jour = 2 repas', () => {
    const shifts: ShiftInput[] = [
      { date: '2026-03-09', heure_debut: '09:00', heure_fin: '14:00', pause_minutes: 0 },
      { date: '2026-03-09', heure_debut: '17:00', heure_fin: '22:00', pause_minutes: 0 },
    ];

    const bilan = calculerBilanSemaine(shifts, contrat39h, 'test-repas-2');
    expect(bilan.nb_repas).toBe(2);
  });
});

// ============================================================
// Bilan Semaine — IDCC 1501 (Restauration rapide)
// ============================================================

describe('calculerBilanSemaine IDCC 1501', () => {
  const contrat39h: ContratInput = { type: 'CDI', heures_semaine: 39, convention: 'RAPIDE_1501' };

  it('40h travaillées → sup 10% = 4h, sup 20% = 1h', () => {
    // 5 jours * 8h = 40h
    const shifts: ShiftInput[] = [];
    for (let i = 9; i <= 13; i++) {
      shifts.push({
        date: `2026-03-${i.toString().padStart(2, '0')}`,
        heure_debut: '09:00',
        heure_fin: '17:30',
        pause_minutes: 30,
      });
    }

    const bilan = calculerBilanSemaine(shifts, contrat39h, 'test-1501');

    expect(bilan.heures_travaillees).toBe(40);
    // Sup 10% = 39 - 35 = 4h
    expect(bilan.heures_supp_10).toBe(4);
    // Sup 20% = 40 - 39 = 1h
    expect(bilan.heures_supp_20).toBe(1);
    expect(bilan.heures_supp_50).toBe(0);
    expect(bilan.heures_supp_25).toBe(0); // HS25 n'existe dans aucune convention
  });

  it('44h travaillées → sup 10% = 4h, sup 20% = 4h, sup 50% = 1h', () => {
    const shifts: ShiftInput[] = [
      { date: '2026-03-09', heure_debut: '08:00', heure_fin: '17:30', pause_minutes: 30 }, // 9h
      { date: '2026-03-10', heure_debut: '08:00', heure_fin: '17:30', pause_minutes: 30 }, // 9h
      { date: '2026-03-11', heure_debut: '08:00', heure_fin: '17:30', pause_minutes: 30 }, // 9h
      { date: '2026-03-12', heure_debut: '08:00', heure_fin: '17:30', pause_minutes: 30 }, // 9h
      { date: '2026-03-13', heure_debut: '08:00', heure_fin: '16:30', pause_minutes: 30 }, // 8h
    ];

    const bilan = calculerBilanSemaine(shifts, contrat39h, 'test-1501-sup50');

    expect(bilan.heures_travaillees).toBe(44);
    expect(bilan.heures_supp_10).toBe(4);  // 35→39
    expect(bilan.heures_supp_20).toBe(4);  // 39→43
    expect(bilan.heures_supp_50).toBe(1);  // 43→44
  });
});

// ============================================================
// Export SILAE
// ============================================================

describe('genererExportSilae', () => {
  it('génère les bonnes lignes pour un employé standard', () => {
    const bilan = {
      heures_travaillees: 177.83,
      heures_normales: 140,
      heures_supp_25: 0,
      heures_supp_50: 9.42,
      heures_supp_10: 0,
      heures_supp_20: 0,
      heures_comp_10: 0,
      heures_comp_25: 0,
      delta_contrat: 5,
      rc_acquis: 0,
      nb_repas: 36,
      jours_travailles: 20,
      alertes: [],
      bilans_semaines: [],
    };

    const rows = genererExportSilae(
      bilan, '1', 'CDI',
      '2026-02-01', '2026-02-28',
      undefined, 4.17
    );

    expect(rows).toHaveLength(5);

    // Vérifier le format (SILAE: toujours au moins 1 décimale sauf jours)
    expect(rows[0]).toEqual({
      matricule: '00001',
      code: 'EV-A01',
      valeur: '36.0',
      date_debut: '01/02/2026',
      date_fin: '28/02/2026',
    });

    expect(rows[1].code).toBe('HS-HS50');
    expect(rows[1].valeur).toBe('9.42');

    expect(rows[2].code).toBe('Nombre total de jours travailles');
    expect(rows[2].valeur).toBe('20');

    expect(rows[3].code).toBe('Heures travaillees');
    expect(rows[3].valeur).toBe('177.83');

    expect(rows[4].code).toBe('Nouveau solde RCR');
    expect(rows[4].valeur).toBe('4.17');
  });

  it('utilise "Heures travaillees (extra)" pour les extras', () => {
    const bilan = {
      heures_travaillees: 20,
      heures_normales: 20,
      heures_supp_25: 0,
      heures_supp_50: 0,
      heures_supp_10: 0,
      heures_supp_20: 0,
      heures_comp_10: 0,
      heures_comp_25: 0,
      delta_contrat: 0,
      rc_acquis: 0,
      nb_repas: 3,
      jours_travailles: 3,
      alertes: [],
      bilans_semaines: [],
    };

    const rows = genererExportSilae(bilan, '13', 'extra', '2026-02-01', '2026-02-28');

    const heuresRow = rows.find(r => r.code.startsWith('Heures travaillees'));
    expect(heuresRow!.code).toBe('Heures travaillees (extra)');
    expect(heuresRow!.matricule).toBe('00013');
  });

  it('inclut les absences avec codes SILAE', () => {
    const bilan = {
      heures_travaillees: 150,
      heures_normales: 150,
      heures_supp_25: 0, heures_supp_50: 0, heures_supp_10: 0, heures_supp_20: 0,
      heures_comp_10: 0, heures_comp_25: 0,
      delta_contrat: -10, rc_acquis: 0, nb_repas: 18, jours_travailles: 18,
      alertes: [], bilans_semaines: [],
    };

    const absences = [
      { type: 'maladie', code_silae: 'AB-300', date_debut: '2026-02-11', date_fin: '2026-02-14', nb_jours: 4 },
    ];

    const rows = genererExportSilae(bilan, '5', 'CDI', '2026-02-01', '2026-02-28', absences);

    const absRow = rows.find(r => r.code === 'AB-300');
    expect(absRow).toBeDefined();
    expect(absRow!.valeur).toBe('4.0');
    expect(absRow!.date_debut).toBe('11/02/2026');
    expect(absRow!.date_fin).toBe('14/02/2026');
  });

  it('n\'inclut pas les lignes avec valeur 0', () => {
    const bilan = {
      heures_travaillees: 35,
      heures_normales: 35,
      heures_supp_25: 0, heures_supp_50: 0, heures_supp_10: 0, heures_supp_20: 0,
      heures_comp_10: 0, heures_comp_25: 0,
      delta_contrat: 0, rc_acquis: 0, nb_repas: 5, jours_travailles: 5,
      alertes: [], bilans_semaines: [],
    };

    const rows = genererExportSilae(bilan, '1', 'CDI', '2026-02-01', '2026-02-28', undefined, 0);

    // Pas de lignes HS, pas de RC
    const hsCodes = rows.filter(r => r.code.startsWith('HS-'));
    expect(hsCodes).toHaveLength(0);
    const rcRow = rows.find(r => r.code === 'Nouveau solde RCR');
    expect(rcRow).toBeUndefined();
  });
});

// ============================================================
// RC (Repos Compensateur)
// ============================================================

describe('RC acquis HCR', () => {
  it('contrat 43h, 45h → rc_acquis = 2 * 50% = 1.0', () => {
    const contrat43h: ContratInput = { type: 'CDI', heures_semaine: 43, convention: 'HCR_1979' };
    // 5 jours * 9h = 45h
    const shifts: ShiftInput[] = [];
    for (let i = 9; i <= 13; i++) {
      shifts.push({
        date: `2026-03-${i.toString().padStart(2, '0')}`,
        heure_debut: '08:00',
        heure_fin: '17:30',
        pause_minutes: 30,
      });
    }
    const bilan = calculerBilanSemaine(shifts, contrat43h, 'test-rc');
    expect(bilan.heures_supp_50).toBe(2);
    // RC = 2h * 50% = 1h
    expect(bilan.rc_acquis).toBe(1);
  });

  it('contrat 35h, 41h → rc = 4*10% + 2*20% = 0.8', () => {
    const contrat35h: ContratInput = { type: 'CDI', heures_semaine: 35, convention: 'HCR_1979' };
    // Need exactly 41h: 5 days * 7h + 1 day * 6h = 41h
    const shifts: ShiftInput[] = [];
    for (let i = 9; i <= 13; i++) {
      shifts.push({
        date: `2026-03-${i.toString().padStart(2, '0')}`,
        heure_debut: '09:00',
        heure_fin: '16:30',
        pause_minutes: 30, // 7h
      });
    }
    shifts.push({
      date: '2026-03-14',
      heure_debut: '09:00',
      heure_fin: '15:30',
      pause_minutes: 30, // 6h
    });
    const bilan = calculerBilanSemaine(shifts, contrat35h, 'test-rc-35');
    expect(bilan.heures_travaillees).toBe(41);
    expect(bilan.heures_supp_10).toBe(4);
    expect(bilan.heures_supp_20).toBe(2);
    // RC = 4*0.10 + 2*0.20 = 0.4 + 0.4 = 0.8
    expect(bilan.rc_acquis).toBe(0.8);
  });

  it('contrat 39h, pas de dépassement → rc = 0', () => {
    const contrat39h: ContratInput = { type: 'CDI', heures_semaine: 39, convention: 'HCR_1979' };
    const shifts: ShiftInput[] = [
      { date: '2026-03-09', heure_debut: '09:00', heure_fin: '17:00', pause_minutes: 30 },
    ];
    const bilan = calculerBilanSemaine(shifts, contrat39h, 'test-rc-no');
    expect(bilan.rc_acquis).toBe(0);
  });
});

// ============================================================
// Jours ouvrés & Entrée/Sortie
// ============================================================

describe('joursOuvres', () => {
  it('février 2026 complet = 20 jours ouvrés', () => {
    // Feb 1 (dim) to Feb 28 (sam) → 20 jours lun-ven
    expect(joursOuvres('2026-02-01', '2026-02-28')).toBe(20);
  });

  it('du 23/02 au 28/02 = 5 jours', () => {
    // 23(lun), 24(mar), 25(mer), 26(jeu), 27(ven) = 5, 28(sam) = 0
    expect(joursOuvres('2026-02-23', '2026-02-28')).toBe(5);
  });

  it('une seule journée (lundi) = 1', () => {
    expect(joursOuvres('2026-03-09', '2026-03-09')).toBe(1);
  });

  it('weekend = 0', () => {
    // March 14 2026 = Saturday, March 15 = Sunday
    expect(joursOuvres('2026-03-14', '2026-03-15')).toBe(0);
  });
});

describe('calculerEntreeSortie', () => {
  it('entrée le 23/02 avec contrat 39h → prorata correct', () => {
    // Feb 2026: 20 jours ouvrés, présent 5 jours → absent 15
    // Ref heures = 39 * 52/12 = 169h
    // Entree/Sortie = 15/20 * 169 = 126.75
    const val = calculerEntreeSortie('2026-02-01', '2026-02-28', '2026-02-23', undefined, 169);
    expect(val).toBe(126.75);
  });

  it('mois complet → 0', () => {
    const val = calculerEntreeSortie('2026-02-01', '2026-02-28', undefined, undefined, 169);
    expect(val).toBe(0);
  });

  it('sortie le 15/02 → prorata jours après sortie', () => {
    // Présent du 1er au 15 fév
    // Jours ouvrés 1-15: Feb 2-6 (5) + Feb 9-13 (5) = 10
    // Absent: 20 - 10 = 10
    // 10/20 * 151.67 = 75.835 → round2 = 75.84 or 75.83 depending on float
    const val = calculerEntreeSortie('2026-02-01', '2026-02-28', undefined, '2026-02-15', 151.67);
    expect(val).toBeCloseTo(75.84, 1);
  });
});

describe('genererExportSilae avec entrée en cours de mois', () => {
  it('génère la ligne Entree / Sortie avec dates restreintes', () => {
    const bilan = {
      heures_travaillees: 41.08,
      heures_normales: 41.08,
      heures_supp_25: 0, heures_supp_50: 0, heures_supp_10: 0, heures_supp_20: 0,
      heures_comp_10: 0, heures_comp_25: 0,
      delta_contrat: 0, rc_acquis: 0, nb_repas: 9, jours_travailles: 5,
      alertes: [], bilans_semaines: [],
    };

    const rows = genererExportSilae(bilan, '45', 'CDI', '2026-02-01', '2026-02-28', undefined, undefined, {
      dateEntree: '2026-02-23',
      heuresMensuellesRef: 169,
    });

    // Dates = 23/02 → 28/02
    const repasRow = rows.find(r => r.code === 'EV-A01');
    expect(repasRow!.date_debut).toBe('23/02/2026');
    expect(repasRow!.date_fin).toBe('28/02/2026');

    // Entree / Sortie line
    const esRow = rows.find(r => r.code === 'Entree / Sortie');
    expect(esRow).toBeDefined();
    expect(esRow!.valeur).toBe('126.75');
    expect(esRow!.date_debut).toBe('23/02/2026');
  });
});

describe('exportSilaeToCSV', () => {
  it('génère le bon format CSV', () => {
    const rows = [
      { matricule: '00001', code: 'EV-A01', valeur: '36.0', date_debut: '01/02/2026', date_fin: '28/02/2026' },
      { matricule: '00001', code: 'HS-HS50', valeur: '9.42', date_debut: '01/02/2026', date_fin: '28/02/2026' },
    ];

    const csv = exportSilaeToCSV(rows);
    const lines = csv.split('\n');

    expect(lines[0]).toBe('Matricule;Code;Valeur;Date debut;Date fin');
    expect(lines[1]).toBe('00001;EV-A01;36.0;01/02/2026;28/02/2026');
    expect(lines[2]).toBe('00001;HS-HS50;9.42;01/02/2026;28/02/2026');
  });
});
