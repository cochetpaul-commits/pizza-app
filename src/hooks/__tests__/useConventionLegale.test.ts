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
  it('entier sans décimales', () => {
    expect(formatValeur(36)).toBe('36');
  });
  it('décimal avec 2 chiffres', () => {
    expect(formatValeur(9.42)).toBe('9.42');
  });
  it('supprime les zéros trailing', () => {
    expect(formatValeur(177.80)).toBe('177.8');
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
    // Heures normales = 35h
    expect(bilan.heures_normales).toBe(35);
    // Sup 25% = 43 - 35 = 8h
    expect(bilan.heures_supp_25).toBe(8);
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
    // Sup 25% = 37.5 - 35 = 2.5h
    expect(bilan.heures_supp_25).toBe(2.5);
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
    expect(bilan.heures_supp_25).toBe(0);
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
    expect(bilan.heures_supp_25).toBe(0); // pas en 1501
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

    // Vérifier le format
    expect(rows[0]).toEqual({
      matricule: '00001',
      code: 'EV-A01',
      valeur: '36',
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
    expect(absRow!.valeur).toBe('4');
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

describe('exportSilaeToCSV', () => {
  it('génère le bon format CSV', () => {
    const rows = [
      { matricule: '00001', code: 'EV-A01', valeur: '36', date_debut: '01/02/2026', date_fin: '28/02/2026' },
      { matricule: '00001', code: 'HS-HS50', valeur: '9.42', date_debut: '01/02/2026', date_fin: '28/02/2026' },
    ];

    const csv = exportSilaeToCSV(rows);
    const lines = csv.split('\n');

    expect(lines[0]).toBe('Matricule;Code;Valeur;Date debut;Date fin');
    expect(lines[1]).toBe('00001;EV-A01;36;01/02/2026;28/02/2026');
    expect(lines[2]).toBe('00001;HS-HS50;9.42;01/02/2026;28/02/2026');
  });
});
