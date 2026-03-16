/**
 * Étape 14 — Tests de non-régression SILAE
 *
 * Ces tests vérifient que l'export SILAE produit des résultats
 * cohérents pour des scénarios réels de Bello Mio (HCR 1979)
 * et Piccola Mia (RAPIDE 1501).
 */
import { describe, it, expect } from "vitest"
import {
  calculerBilanSemaine,
  genererExportSilae,
  exportSilaeToCSV,
  formatValeur,
  formatDateFR,
  type ShiftInput,
  type ContratInput,
  type BilanMensuel,
} from "../useConventionLegale"

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeShifts(days: { date: string; debut: string; fin: string; pause?: number }[]): ShiftInput[] {
  return days.map(d => ({
    date: d.date,
    heure_debut: d.debut,
    heure_fin: d.fin,
    pause_minutes: d.pause ?? 30,
  }))
}

function makeBilanForExport(overrides: Partial<BilanMensuel> = {}): BilanMensuel {
  return {
    heures_travaillees: 0, heures_normales: 0,
    heures_supp_25: 0, heures_supp_50: 0,
    heures_supp_10: 0, heures_supp_20: 0,
    heures_comp_10: 0, heures_comp_25: 0,
    delta_contrat: 0, rc_acquis: 0,
    nb_repas: 0, jours_travailles: 0,
    alertes: [], bilans_semaines: [],
    ...overrides,
  }
}

// ── Scénarios HCR 1979 ──────────────────────────────────────────────────────

describe("SILAE non-régression — HCR 1979 (Bello Mio)", () => {
  const contrat39h: ContratInput = { type: "CDI", heures_semaine: 39, convention: "HCR_1979" }

  it("semaine standard 39h → pas de heures sup", () => {
    const shifts = makeShifts([
      { date: "2026-03-09", debut: "09:00", fin: "15:30" }, // 6h
      { date: "2026-03-10", debut: "09:00", fin: "17:30" }, // 8h
      { date: "2026-03-11", debut: "09:00", fin: "17:30" }, // 8h
      { date: "2026-03-12", debut: "09:00", fin: "17:30" }, // 8h
      { date: "2026-03-13", debut: "09:00", fin: "18:30" }, // 9h = 39h
    ])
    const bilan = calculerBilanSemaine(shifts, contrat39h, "emp-01")
    expect(bilan.heures_travaillees).toBe(39)
    expect(bilan.heures_supp_25).toBe(4) // HCR: 35→39 = 4h à 25%
    expect(bilan.heures_supp_50).toBe(0)
    expect(bilan.nb_repas).toBe(5)
    expect(bilan.alertes).toHaveLength(0)
  })

  it("semaine 45h → 8h sup 25% + 2h sup 50%", () => {
    const shifts = makeShifts([
      { date: "2026-03-09", debut: "09:00", fin: "18:30" }, // 9h
      { date: "2026-03-10", debut: "09:00", fin: "18:30" }, // 9h
      { date: "2026-03-11", debut: "09:00", fin: "18:30" }, // 9h
      { date: "2026-03-12", debut: "09:00", fin: "18:30" }, // 9h
      { date: "2026-03-13", debut: "09:00", fin: "18:30" }, // 9h = 45h
    ])
    const bilan = calculerBilanSemaine(shifts, contrat39h, "emp-01")
    expect(bilan.heures_travaillees).toBe(45)
    expect(bilan.heures_supp_25).toBe(8)  // 35→43 = 8h
    expect(bilan.heures_supp_50).toBe(2)  // 43→45 = 2h
  })

  it("alerte amplitude > 13h", () => {
    const shifts = makeShifts([
      { date: "2026-03-09", debut: "07:00", fin: "21:30", pause: 30 }, // amplitude 14h30
    ])
    const bilan = calculerBilanSemaine(shifts, contrat39h, "emp-01")
    const ampAlertes = bilan.alertes.filter(a => a.type === "amplitude_max")
    expect(ampAlertes.length).toBeGreaterThan(0)
  })

  it("alerte durée jour > 10h net", () => {
    const shifts = makeShifts([
      { date: "2026-03-09", debut: "08:00", fin: "19:00", pause: 30 }, // 10h30 net
    ])
    const bilan = calculerBilanSemaine(shifts, contrat39h, "emp-01")
    const durAlertes = bilan.alertes.filter(a => a.type === "duree_max_jour")
    expect(durAlertes.length).toBeGreaterThan(0)
  })

  it("alerte repos < 11h entre deux jours consécutifs", () => {
    const shifts = makeShifts([
      { date: "2026-03-09", debut: "14:00", fin: "23:00", pause: 30 }, // fin 23h
      { date: "2026-03-10", debut: "08:00", fin: "17:00", pause: 30 }, // début 8h → 9h repos
    ])
    const bilan = calculerBilanSemaine(shifts, contrat39h, "emp-01")
    const reposAlertes = bilan.alertes.filter(a => a.type === "repos_insuffisant")
    expect(reposAlertes.length).toBeGreaterThan(0)
  })

  it("alerte semaine > 48h", () => {
    const shifts = makeShifts([
      { date: "2026-03-09", debut: "08:00", fin: "18:30" }, // 10h
      { date: "2026-03-10", debut: "08:00", fin: "18:30" }, // 10h
      { date: "2026-03-11", debut: "08:00", fin: "18:30" }, // 10h
      { date: "2026-03-12", debut: "08:00", fin: "18:30" }, // 10h
      { date: "2026-03-13", debut: "08:00", fin: "18:30" }, // 10h = 50h
    ])
    const bilan = calculerBilanSemaine(shifts, contrat39h, "emp-01")
    expect(bilan.heures_travaillees).toBe(50)
    const semAlertes = bilan.alertes.filter(a => a.type === "duree_max_semaine")
    expect(semAlertes.length).toBeGreaterThan(0)
  })
})

// ── Scénarios RAPIDE 1501 ────────────────────────────────────────────────────

describe("SILAE non-régression — RAPIDE 1501 (Piccola Mia)", () => {
  const contrat39h: ContratInput = { type: "CDI", heures_semaine: 39, convention: "RAPIDE_1501" }

  it("40h travaillées → 4h sup 10%, 1h sup 20%", () => {
    const shifts = makeShifts([
      { date: "2026-03-09", debut: "09:00", fin: "17:30" }, // 8h
      { date: "2026-03-10", debut: "09:00", fin: "17:30" }, // 8h
      { date: "2026-03-11", debut: "09:00", fin: "17:30" }, // 8h
      { date: "2026-03-12", debut: "09:00", fin: "17:30" }, // 8h
      { date: "2026-03-13", debut: "09:00", fin: "17:30" }, // 8h = 40h
    ])
    const bilan = calculerBilanSemaine(shifts, contrat39h, "emp-02")
    expect(bilan.heures_travaillees).toBe(40)
    expect(bilan.heures_supp_10).toBe(4)  // 35→39
    expect(bilan.heures_supp_20).toBe(1)  // 39→40
    expect(bilan.heures_supp_25).toBe(0)  // pas en 1501
  })
})

// ── Export SILAE non-régression ───────────────────────────────────────────────

describe("SILAE export — scénarios complets", () => {
  it("CDI 39h Bello Mio — mois complet avec heures sup", () => {
    const bilan = makeBilanForExport({
      heures_travaillees: 175.5,
      heures_normales: 151.67,
      heures_supp_25: 16,
      heures_supp_50: 7.83,
      nb_repas: 22,
      jours_travailles: 22,
    })

    const rows = genererExportSilae(bilan, "42", "CDI", "2026-03-01", "2026-03-31", undefined, 3.92)
    const csv = exportSilaeToCSV(rows)

    // Verify row count: repas + HS25 + HS50 + jours + heures + RC = 6
    expect(rows).toHaveLength(6)

    // Verify matricule padding
    expect(rows[0].matricule).toBe("00042")

    // Verify all codes present
    const codes = rows.map(r => r.code)
    expect(codes).toContain("EV-A01")
    expect(codes).toContain("HS-HS25")
    expect(codes).toContain("HS-HS50")
    expect(codes).toContain("Nombre total de jours travailles")
    expect(codes).toContain("Heures travaillees")
    expect(codes).toContain("Nouveau solde RCR")

    // Verify date format DD/MM/YYYY
    expect(rows[0].date_debut).toBe("01/03/2026")
    expect(rows[0].date_fin).toBe("31/03/2026")

    // Verify CSV format
    const lines = csv.split("\n")
    expect(lines[0]).toBe("Matricule;Code;Valeur;Date debut;Date fin")
    expect(lines.length).toBe(7) // header + 6 data

    // Semicolon separated
    for (const line of lines) {
      expect(line.split(";").length).toBe(5)
    }
  })

  it("Extra — utilise code heures spécifique", () => {
    const bilan = makeBilanForExport({
      heures_travaillees: 24,
      heures_normales: 24,
      nb_repas: 4,
      jours_travailles: 4,
    })

    const rows = genererExportSilae(bilan, "7", "extra", "2026-03-01", "2026-03-31")

    const heuresRow = rows.find(r => r.code.includes("Heures travaillees"))
    expect(heuresRow).toBeDefined()
    expect(heuresRow!.code).toBe("Heures travaillees (extra)")
  })

  it("0 heures sup → pas de lignes HS", () => {
    const bilan = makeBilanForExport({
      heures_travaillees: 151.67,
      heures_normales: 151.67,
      nb_repas: 22,
      jours_travailles: 22,
    })

    const rows = genererExportSilae(bilan, "1", "CDI", "2026-03-01", "2026-03-31")
    const hsRows = rows.filter(r => r.code.startsWith("HS-"))
    expect(hsRows).toHaveLength(0)
  })

  it("absence maladie → ligne AB-300 avec dates spécifiques", () => {
    const bilan = makeBilanForExport({
      heures_travaillees: 120,
      heures_normales: 120,
      nb_repas: 15,
      jours_travailles: 15,
    })

    const absences = [
      { type: "maladie", code_silae: "AB-300", date_debut: "2026-03-16", date_fin: "2026-03-20", nb_jours: 5 },
    ]

    const rows = genererExportSilae(bilan, "3", "CDI", "2026-03-01", "2026-03-31", absences)
    const absRow = rows.find(r => r.code === "AB-300")

    expect(absRow).toBeDefined()
    expect(absRow!.valeur).toBe("5")
    expect(absRow!.date_debut).toBe("16/03/2026")
    expect(absRow!.date_fin).toBe("20/03/2026")
  })

  it("multi-absences avec codes différents", () => {
    const bilan = makeBilanForExport({
      heures_travaillees: 100,
      heures_normales: 100,
      nb_repas: 12,
      jours_travailles: 12,
    })

    const absences = [
      { type: "maladie", code_silae: "AB-300", date_debut: "2026-03-03", date_fin: "2026-03-07", nb_jours: 5 },
      { type: "cp", code_silae: "AB-100", date_debut: "2026-03-24", date_fin: "2026-03-28", nb_jours: 5 },
      { type: "perso_sans_code", date_debut: "2026-03-10", date_fin: "2026-03-10", nb_jours: 1 }, // no code → excluded
    ]

    const rows = genererExportSilae(bilan, "5", "CDI", "2026-03-01", "2026-03-31", absences)
    const absCodes = rows.filter(r => r.code.startsWith("AB-"))
    expect(absCodes).toHaveLength(2)
  })

  it("solde RC = 0 → pas de ligne RCR", () => {
    const bilan = makeBilanForExport({
      heures_travaillees: 39,
      nb_repas: 5,
      jours_travailles: 5,
    })

    const rows = genererExportSilae(bilan, "1", "CDI", "2026-03-01", "2026-03-31", undefined, 0)
    const rcRow = rows.find(r => r.code === "Nouveau solde RCR")
    expect(rcRow).toBeUndefined()
  })
})

// ── Helpers non-régression ───────────────────────────────────────────────────

describe("SILAE helpers — non-régression", () => {
  it("formatValeur — entiers sans décimales", () => {
    expect(formatValeur(36)).toBe("36")
    expect(formatValeur(0)).toBe("0")
  })

  it("formatValeur — décimales sans trailing zeros", () => {
    expect(formatValeur(9.42)).toBe("9.42")
    expect(formatValeur(4.5)).toBe("4.5")
    expect(formatValeur(177.83)).toBe("177.83")
  })

  it("formatDateFR — YYYY-MM-DD → DD/MM/YYYY", () => {
    expect(formatDateFR("2026-03-01")).toBe("01/03/2026")
    expect(formatDateFR("2026-12-31")).toBe("31/12/2026")
  })

  it("CSV output is stable and parseable", () => {
    const rows = [
      { matricule: "00001", code: "EV-A01", valeur: "22", date_debut: "01/03/2026", date_fin: "31/03/2026" },
      { matricule: "00001", code: "HS-HS25", valeur: "16", date_debut: "01/03/2026", date_fin: "31/03/2026" },
      { matricule: "00002", code: "EV-A01", valeur: "18", date_debut: "01/03/2026", date_fin: "31/03/2026" },
    ]

    const csv = exportSilaeToCSV(rows)

    // Parseable
    const lines = csv.split("\n")
    expect(lines[0]).toBe("Matricule;Code;Valeur;Date debut;Date fin")
    expect(lines).toHaveLength(4)

    // Each line has exactly 5 fields
    for (const line of lines) {
      expect(line.split(";")).toHaveLength(5)
    }

    // No quotes, no commas in values
    expect(csv).not.toContain('"')
    expect(csv).not.toContain(",")
  })
})
