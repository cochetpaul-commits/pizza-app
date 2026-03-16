import { describe, it, expect } from 'vitest';
import {
  calculerBilanSemaine,
  calculerBilanMensuel,
  genererExportSilae,
  exportSilaeToCSV,
  formatValeur,
  formatDateFR,
  type ShiftInput,
  type ContratInput,
} from '../useConventionLegale';

// ============================================================
// Helpers
// ============================================================

function makeShift(date: string, debut: string, fin: string, pause = 30): ShiftInput {
  return { date, heure_debut: debut, heure_fin: fin, pause_minutes: pause };
}

/** Crée N shifts consécutifs à partir du lundi donné */
function makeWeek(lundi: string, specs: [string, string, number?][]): ShiftInput[] {
  const d = new Date(lundi);
  return specs.map(([debut, fin, pause], i) => {
    const date = new Date(d);
    date.setDate(date.getDate() + i);
    return makeShift(date.toISOString().slice(0, 10), debut, fin, pause ?? 30);
  });
}

const HCR_CDI_39: ContratInput = { type: 'CDI', heures_semaine: 39, convention: 'HCR_1979' };
const HCR_CDI_35: ContratInput = { type: 'CDI', heures_semaine: 35, convention: 'HCR_1979' };
const RAPIDE_CDI_39: ContratInput = { type: 'CDI', heures_semaine: 39, convention: 'RAPIDE_1501' };
const EXTRA: ContratInput = { type: 'extra', heures_semaine: 0, convention: 'HCR_1979' };

// ============================================================
// HCR 1979 — Non-régression
// ============================================================

describe('HCR 1979 — non-régression', () => {
  it('39h CDI → 0 HS (heures contractuelles)', () => {
    // 5 × 7h48 net = 39h. Contrat 39h → 35→39h sont contractuelles, pas HS
    const shifts = makeWeek('2026-03-09', [
      ['09:00', '17:18', 30],
      ['09:00', '17:18', 30],
      ['09:00', '17:18', 30],
      ['09:00', '17:18', 30],
      ['09:00', '17:18', 30],
    ]);
    const bilan = calculerBilanSemaine(shifts, HCR_CDI_39, 'emp1');
    expect(bilan.heures_travaillees).toBe(39);
    expect(bilan.heures_supp_10).toBe(0);
    expect(bilan.heures_supp_20).toBe(0);
    expect(bilan.heures_supp_50).toBe(0);
    expect(bilan.delta_contrat).toBe(0);
  });

  it('45h CDI 39h → 4h HS20 + 2h HS50', () => {
    // 5 × 9h net = 45h. Contrat 39h : 39→43h = HS20, >43h = HS50
    const shifts = makeWeek('2026-03-09', [
      ['09:00', '18:30', 30],
      ['09:00', '18:30', 30],
      ['09:00', '18:30', 30],
      ['09:00', '18:30', 30],
      ['09:00', '18:30', 30],
    ]);
    const bilan = calculerBilanSemaine(shifts, HCR_CDI_39, 'emp1');
    expect(bilan.heures_travaillees).toBe(45);
    expect(bilan.heures_supp_10).toBe(0);  // 35→39 = contractuel
    expect(bilan.heures_supp_20).toBe(4);  // 39→43
    expect(bilan.heures_supp_50).toBe(2);  // >43
  });

  it('alerte amplitude >13h', () => {
    const shifts = [makeShift('2026-03-09', '06:00', '20:00', 30)];
    const bilan = calculerBilanSemaine(shifts, HCR_CDI_39, 'emp1');
    const alerteAmp = bilan.alertes.find((a) => a.type === 'amplitude_max');
    expect(alerteAmp).toBeDefined();
    expect(alerteAmp!.valeur_constatee).toBe(14);
  });

  it('alerte durée nette >10h', () => {
    const shifts = [makeShift('2026-03-09', '08:00', '19:00', 30)];
    const bilan = calculerBilanSemaine(shifts, HCR_CDI_39, 'emp1');
    const alerteDuree = bilan.alertes.find((a) => a.type === 'duree_max_jour');
    expect(alerteDuree).toBeDefined();
  });

  it('alerte repos insuffisant <11h', () => {
    const shifts = [
      makeShift('2026-03-09', '08:00', '23:00', 30),
      makeShift('2026-03-10', '07:00', '15:00', 30),
    ];
    const bilan = calculerBilanSemaine(shifts, HCR_CDI_39, 'emp1');
    const alerteRepos = bilan.alertes.find((a) => a.type === 'repos_insuffisant');
    expect(alerteRepos).toBeDefined();
  });

  it('alerte semaine >48h', () => {
    // 6 × 8h30 net = 51h
    const shifts = makeWeek('2026-03-09', [
      ['08:00', '17:00', 30],
      ['08:00', '17:00', 30],
      ['08:00', '17:00', 30],
      ['08:00', '17:00', 30],
      ['08:00', '17:00', 30],
      ['08:00', '17:00', 30],
    ]);
    const bilan = calculerBilanSemaine(shifts, HCR_CDI_39, 'emp1');
    expect(bilan.heures_travaillees).toBeGreaterThan(48);
    const alerteSemaine = bilan.alertes.find((a) => a.type === 'duree_max_semaine');
    expect(alerteSemaine).toBeDefined();
  });
});

// ============================================================
// RAPIDE 1501 — Non-régression
// ============================================================

describe('RAPIDE 1501 — non-régression', () => {
  it('40h → 4h HS10 + 1h HS20', () => {
    // 5 × 8h net = 40h (0 pause)
    const shifts = makeWeek('2026-03-09', [
      ['09:00', '17:00', 0],
      ['09:00', '17:00', 0],
      ['09:00', '17:00', 0],
      ['09:00', '17:00', 0],
      ['09:00', '17:00', 0],
    ]);
    const bilan = calculerBilanSemaine(shifts, RAPIDE_CDI_39, 'emp1');
    expect(bilan.heures_travaillees).toBe(40);
    expect(bilan.heures_supp_10).toBe(4);
    expect(bilan.heures_supp_20).toBe(1);
    expect(bilan.heures_supp_50).toBe(0);
  });
});

// ============================================================
// Export SILAE — Non-régression (utilise BilanMensuel)
// ============================================================

describe('Export SILAE — non-régression', () => {
  it('CDI 39h avec 45h travaillées → HS20 + HS50', () => {
    // 5 × 9h net = 45h. Contrat 39h HCR : 39→43h = HS20, >43h = HS50
    const shifts = makeWeek('2026-03-09', [
      ['09:00', '18:30', 30],
      ['09:00', '18:30', 30],
      ['09:00', '18:30', 30],
      ['09:00', '18:30', 30],
      ['09:00', '18:30', 30],
    ]);
    const bilan = calculerBilanMensuel(shifts, HCR_CDI_39, 'emp1');
    const rows = genererExportSilae(bilan, 'MAT001', 'CDI', '2026-03-01', '2026-03-31');
    const hs20 = rows.find((r) => r.code === 'HS-HS20');
    const hs50 = rows.find((r) => r.code === 'HS-HS50');
    expect(hs20).toBeDefined();
    expect(hs20!.valeur).toBe(formatValeur(4));
    expect(hs50).toBeDefined();
    expect(hs50!.valeur).toBe(formatValeur(2));
    // Pas de HS10 car contrat = 39h (35→39h sont heures contractuelles)
    expect(rows.find((r) => r.code === 'HS-HS10')).toBeUndefined();
  });

  it('extra → code EV-A01 (repas)', () => {
    const shifts = [makeShift('2026-03-09', '09:00', '17:00', 30)];
    const bilan = calculerBilanMensuel(shifts, EXTRA, 'emp1');
    const rows = genererExportSilae(bilan, 'EXT01', 'extra', '2026-03-01', '2026-03-31');
    const evA01 = rows.find((r) => r.code === 'EV-A01');
    expect(evA01).toBeDefined();
  });

  it('0 heures sup → pas de ligne HS', () => {
    // 5 × 7h net = 35h
    const shifts = makeWeek('2026-03-09', [
      ['09:00', '16:30', 30],
      ['09:00', '16:30', 30],
      ['09:00', '16:30', 30],
      ['09:00', '16:30', 30],
      ['09:00', '16:30', 30],
    ]);
    const bilan = calculerBilanMensuel(shifts, HCR_CDI_35, 'emp1');
    const rows = genererExportSilae(bilan, 'MAT002', 'CDI', '2026-03-01', '2026-03-31');
    const hsRows = rows.filter((r) => r.code.startsWith('HS-'));
    expect(hsRows.length).toBe(0);
  });

  it('absence maladie → code AB-300', () => {
    const shifts = makeWeek('2026-03-09', [
      ['09:00', '17:00', 30],
      ['09:00', '17:00', 30],
      ['09:00', '17:00', 30],
    ]);
    const bilan = calculerBilanMensuel(shifts, HCR_CDI_39, 'emp1');
    const absences = [{ type: 'maladie', code_silae: 'AB-300', date_debut: '2026-03-12', date_fin: '2026-03-13', nb_jours: 2 }];
    const rows = genererExportSilae(bilan, 'MAT003', 'CDI', '2026-03-01', '2026-03-31', absences);
    const ab300 = rows.find((r) => r.code === 'AB-300');
    expect(ab300).toBeDefined();
    expect(ab300!.valeur).toBe(formatValeur(2));
  });

  it('multi-absences → lignes distinctes', () => {
    const shifts = [makeShift('2026-03-09', '09:00', '17:00', 30)];
    const bilan = calculerBilanMensuel(shifts, HCR_CDI_39, 'emp1');
    const absences = [
      { type: 'maladie', code_silae: 'AB-300', date_debut: '2026-03-12', date_fin: '2026-03-13', nb_jours: 2 },
      { type: 'CP', code_silae: 'AB-100', date_debut: '2026-03-14', date_fin: '2026-03-14', nb_jours: 1 },
    ];
    const rows = genererExportSilae(bilan, 'MAT004', 'CDI', '2026-03-01', '2026-03-31', absences);
    expect(rows.filter((r) => r.code === 'AB-300').length).toBe(1);
    expect(rows.filter((r) => r.code === 'AB-100').length).toBe(1);
  });

  it('RC = 0 → pas de ligne RC', () => {
    const shifts = makeWeek('2026-03-09', [
      ['09:00', '16:30', 30],
      ['09:00', '16:30', 30],
      ['09:00', '16:30', 30],
      ['09:00', '16:30', 30],
      ['09:00', '16:30', 30],
    ]);
    const bilan = calculerBilanMensuel(shifts, HCR_CDI_35, 'emp1');
    const rows = genererExportSilae(bilan, 'MAT005', 'CDI', '2026-03-01', '2026-03-31', [], 0);
    const rcRows = rows.filter((r) => r.code.includes('RC'));
    expect(rcRows.length).toBe(0);
  });
});

// ============================================================
// Helpers — Non-régression
// ============================================================

describe('Helpers — non-régression', () => {
  it('formatValeur : entiers → 1 décimale min', () => {
    expect(formatValeur(4)).toBe('4.0');
    expect(formatValeur(0)).toBe('0.0');
  });

  it('formatValeur : décimales conservées', () => {
    expect(formatValeur(4.5)).toBe('4.5');
    expect(formatValeur(3.33)).toBe('3.33');
  });

  it('formatDateFR : ISO → DD/MM/YYYY', () => {
    expect(formatDateFR('2026-03-09')).toBe('09/03/2026');
    expect(formatDateFR('2026-12-31')).toBe('31/12/2026');
  });

  it('CSV parseable et stable', () => {
    const shifts = makeWeek('2026-03-09', [
      ['09:00', '18:30', 30],
      ['09:00', '18:30', 30],
      ['09:00', '18:30', 30],
      ['09:00', '18:30', 30],
      ['09:00', '18:30', 30],
    ]);
    const bilan = calculerBilanMensuel(shifts, HCR_CDI_39, 'emp1');
    const rows = genererExportSilae(bilan, 'MAT001', 'CDI', '2026-03-01', '2026-03-31');
    const csv = exportSilaeToCSV(rows);
    const lines = csv.split('\n').filter(Boolean);
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines[0]).toContain(';');
    // Stable
    expect(csv).toBe(exportSilaeToCSV(rows));
  });
});
