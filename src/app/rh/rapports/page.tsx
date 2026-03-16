"use client"

import { useState, useMemo, useCallback } from "react"
import { NavBar } from "@/components/NavBar"
import { TopNav } from "@/components/TopNav"
import { useEtablissement } from "@/lib/EtablissementContext"
import { useEmployes, type EmployeAvecContrat } from "@/hooks/useEmployes"
import { useShifts } from "@/hooks/useShifts"
import { useSettings } from "@/hooks/useSettings"
import {
  type BilanMois, type ExportSilaeRow,
  useConventionLegale,
} from "@/hooks/useConventionLegale"
import type { ContratInput, ShiftInput } from "@/hooks/useConventionLegale"

// ── Helpers ──────────────────────────────────────────────────────────────────

function getMonthRange(year: number, month: number) {
  const debut = `${year}-${String(month).padStart(2, "0")}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const fin = `${year}-${String(month).padStart(2, "0")}-${lastDay}`
  return { debut, fin }
}

const MOIS_FR = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
]

function downloadCSV(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RapportsPage() {
  const { current: etablissement } = useEtablissement()
  const etabId = etablissement?.id ?? null
  const { values: settings } = useSettings(etabId)
  const { employes } = useEmployes(etabId)
  const legal = useConventionLegale()

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  const { debut, fin } = useMemo(() => getMonthRange(year, month), [year, month])
  const periode = `${year}-${String(month).padStart(2, "0")}`

  const { shifts, loading: shiftsLoading } = useShifts(etabId, debut, fin)
  const loading = shiftsLoading

  // ── Calcul bilans mensuels par employé ──────────────────────
  const bilans = useMemo(() => {
    if (!employes.length || !shifts.length) return []

    return employes
      .filter(e => e.contrat_type !== "TNS")
      .map(emp => {
        const contratActif = emp.contrat_actif
        if (!contratActif) return null

        const empShifts: ShiftInput[] = shifts
          .filter(s => s.employe_id === emp.id)
          .map(s => ({
            date: s.date,
            heure_debut: s.heure_debut,
            heure_fin: s.heure_fin,
            pause_minutes: s.pause_minutes,
            heures_reelles_debut: s.heures_reelles_debut ?? undefined,
            heures_reelles_fin: s.heures_reelles_fin ?? undefined,
            pause_reelle_minutes: s.pause_reelle_minutes ?? undefined,
          }))

        if (!empShifts.length) return null

        const contrat: ContratInput = {
          type: contratActif.type,
          heures_semaine: contratActif.heures_semaine,
          convention: settings.convention,
        }

        const bilan = legal.calculerBilanMois(empShifts, contrat, periode)

        return { employe: emp, bilan, contrat: contratActif }
      })
      .filter(Boolean) as { employe: EmployeAvecContrat; bilan: BilanMois; contrat: NonNullable<EmployeAvecContrat["contrat_actif"]> }[]
  }, [employes, shifts, settings.convention, periode, legal])

  // ── Totaux ──────────────────────────────────────────────────
  const totaux = useMemo(() => {
    let heures = 0, repas = 0, supp = 0, alertes = 0, jours = 0
    for (const { bilan } of bilans) {
      heures += bilan.heures_travaillees
      repas += bilan.nb_repas
      supp += bilan.heures_supp_25 + bilan.heures_supp_50 + bilan.heures_supp_10 + bilan.heures_supp_20
      alertes += bilan.alertes.length
      jours += bilan.jours_travailles
    }
    return { heures: Math.round(heures * 100) / 100, repas, supp: Math.round(supp * 100) / 100, alertes, jours }
  }, [bilans])

  // ── Export SILAE ────────────────────────────────────────────
  const handleExportSilae = useCallback(() => {
    const allRows: ExportSilaeRow[] = []
    for (const { employe, bilan } of bilans) {
      if (!employe.matricule) continue
      const rows = legal.genererExportSilae(
        // BilanMois → BilanMensuel-like object for genererExportSilae
        {
          heures_travaillees: bilan.heures_travaillees,
          heures_normales: bilan.heures_normales,
          heures_supp_25: bilan.heures_supp_25,
          heures_supp_50: bilan.heures_supp_50,
          heures_supp_10: bilan.heures_supp_10,
          heures_supp_20: bilan.heures_supp_20,
          heures_comp_10: bilan.heures_comp_10,
          heures_comp_25: bilan.heures_comp_25,
          delta_contrat: bilan.heures_travaillees - bilan.heures_contractuelles,
          rc_acquis: bilan.solde_rc,
          nb_repas: bilan.nb_repas,
          jours_travailles: bilan.jours_travailles,
          alertes: bilan.alertes,
          bilans_semaines: [],
        },
        employe.matricule,
        employe.contrat_type ?? "CDI",
        debut,
        fin,
      )
      allRows.push(...rows)
    }

    if (!allRows.length) {
      alert("Aucune donnée à exporter. Vérifiez que les employés ont un matricule.")
      return
    }

    const csv = legal.exportSilaeToCSV(allRows)
    const slug = etablissement?.slug ?? "export"
    downloadCSV(csv, `silae_${slug}_${periode}.csv`)
  }, [bilans, legal, debut, fin, periode, etablissement])

  // ── Nav mois ──────────────────────────────────────────────────
  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }

  const missingMatricules = bilans.filter(b => !b.employe.matricule).length

  return (
    <>
      <NavBar backHref="/" backLabel="Accueil" />
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "0 16px 40px" }}>
        <TopNav
          title="RAPPORTS"
          subtitle={`${MOIS_FR[month - 1]} ${year}`}
          eyebrow="Ressources humaines"
        />

        {/* ── Month Navigation ───────────────────────────────────── */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" onClick={prevMonth} style={navBtnStyle}>←</button>
          <span style={{
            fontSize: 14, fontWeight: 700, minWidth: 140, textAlign: "center",
            fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
            letterSpacing: 1, textTransform: "uppercase",
          }}>
            {MOIS_FR[month - 1]} {year}
          </span>
          <button type="button" onClick={nextMonth} style={navBtnStyle}>→</button>

          <div style={{ flex: 1 }} />

          <button
            type="button"
            className="btn btnPrimary"
            onClick={handleExportSilae}
            disabled={bilans.length === 0}
            style={{ fontSize: 12, padding: "8px 16px" }}
          >
            Exporter SILAE (.csv)
          </button>
        </div>

        {/* ── KPI Cards ──────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: 20 }}>
          <KpiCard label="Heures totales" value={`${totaux.heures}h`} />
          <KpiCard label="Heures supp" value={`${totaux.supp}h`} alert={totaux.supp > 0} />
          <KpiCard label="Repas AN" value={String(totaux.repas)} />
          <KpiCard label="Jours travaillés" value={String(totaux.jours)} />
          <KpiCard label="Alertes" value={String(totaux.alertes)} alert={totaux.alertes > 0} />
        </div>

        {/* Warning matricules */}
        {missingMatricules > 0 && (
          <div style={{
            padding: "8px 14px", borderRadius: 8, marginBottom: 16,
            background: "rgba(160,132,92,0.08)", border: "1px solid rgba(160,132,92,0.2)",
            fontSize: 12, color: "#A0845C",
          }}>
            {missingMatricules} collaborateur{missingMatricules > 1 ? "s" : ""} sans matricule — exclu{missingMatricules > 1 ? "s" : ""} de l&apos;export SILAE.
          </div>
        )}

        {/* ── Table ──────────────────────────────────────────────── */}
        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#999", fontSize: 13 }}>Chargement...</div>
        ) : bilans.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "#999", fontSize: 13 }}>
            Aucun shift sur cette période.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, textAlign: "left", minWidth: 150 }}>Collaborateur</th>
                  <th style={thStyle}>Contrat</th>
                  <th style={thStyle}>H. trav.</th>
                  <th style={thStyle}>H. supp</th>
                  <th style={thStyle}>Delta</th>
                  <th style={thStyle}>Repas</th>
                  <th style={thStyle}>Jours</th>
                  <th style={thStyle}>RC</th>
                  <th style={thStyle}>Alertes</th>
                </tr>
              </thead>
              <tbody>
                {bilans.map(({ employe, bilan }) => {
                  const suppTotal = bilan.heures_supp_25 + bilan.heures_supp_50 + bilan.heures_supp_10 + bilan.heures_supp_20
                  const delta = Math.round((bilan.heures_travaillees - bilan.heures_contractuelles) * 100) / 100
                  const hasAlerte = bilan.alertes.length > 0

                  return (
                    <tr key={employe.id}>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span>{employe.prenom} {employe.nom}</span>
                          {!employe.matricule && (
                            <span style={{
                              fontSize: 8, fontWeight: 700, padding: "1px 4px", borderRadius: 3,
                              background: "rgba(160,132,92,0.12)", color: "#A0845C",
                            }}>
                              PAS DE MAT.
                            </span>
                          )}
                        </div>
                        {employe.matricule && (
                          <div style={{ fontSize: 10, color: "#b0a894" }}>#{employe.matricule}</div>
                        )}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <span style={{ fontSize: 10, fontWeight: 700 }}>{employe.contrat_type}</span>
                        <span style={{ fontSize: 10, color: "#999", marginLeft: 4 }}>{employe.heures_semaine}h</span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: "center", fontWeight: 700, fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif" }}>
                        {bilan.heures_travaillees}h
                      </td>
                      <td style={{
                        ...tdStyle, textAlign: "center", fontWeight: 700,
                        color: suppTotal > 0 ? "#D4775A" : "#999",
                        fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
                      }}>
                        {suppTotal > 0 ? `${Math.round(suppTotal * 100) / 100}h` : "—"}
                        {suppTotal > 0 && (
                          <div style={{ fontSize: 9, color: "#999", fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif" }}>
                            {bilan.heures_supp_25 > 0 && `25%: ${bilan.heures_supp_25}h `}
                            {bilan.heures_supp_50 > 0 && `50%: ${bilan.heures_supp_50}h `}
                            {bilan.heures_supp_10 > 0 && `10%: ${bilan.heures_supp_10}h `}
                            {bilan.heures_supp_20 > 0 && `20%: ${bilan.heures_supp_20}h`}
                          </div>
                        )}
                      </td>
                      <td style={{
                        ...tdStyle, textAlign: "center", fontWeight: 600,
                        color: delta > 0 ? "#D4775A" : delta < 0 ? "#3498DB" : "#999",
                      }}>
                        {delta > 0 ? "+" : ""}{delta}h
                      </td>
                      <td style={{ ...tdStyle, textAlign: "center" }}>{bilan.nb_repas}</td>
                      <td style={{ ...tdStyle, textAlign: "center" }}>{bilan.jours_travailles}</td>
                      <td style={{ ...tdStyle, textAlign: "center", color: bilan.solde_rc > 0 ? "#D4775A" : "#999" }}>
                        {bilan.solde_rc > 0 ? `${bilan.solde_rc}h` : "—"}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        {hasAlerte ? (
                          <span style={{
                            fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 6,
                            background: "rgba(139,26,26,0.08)", color: "#8B1A1A",
                            border: "1px solid rgba(139,26,26,0.15)",
                          }}>
                            {bilan.alertes.length}
                          </span>
                        ) : (
                          <span style={{ color: "#4a6741", fontSize: 11 }}>✓</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              {/* Footer totals */}
              <tfoot>
                <tr style={{ borderTop: "2px solid #ddd6c8" }}>
                  <td style={{ ...tdStyle, fontWeight: 700 }}>TOTAL ({bilans.length} collab.)</td>
                  <td style={tdStyle} />
                  <td style={{ ...tdStyle, textAlign: "center", fontWeight: 700, fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif" }}>
                    {totaux.heures}h
                  </td>
                  <td style={{ ...tdStyle, textAlign: "center", fontWeight: 700, color: "#D4775A", fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif" }}>
                    {totaux.supp > 0 ? `${totaux.supp}h` : "—"}
                  </td>
                  <td style={tdStyle} />
                  <td style={{ ...tdStyle, textAlign: "center", fontWeight: 700 }}>{totaux.repas}</td>
                  <td style={{ ...tdStyle, textAlign: "center", fontWeight: 700 }}>{totaux.jours}</td>
                  <td style={tdStyle} />
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    {totaux.alertes > 0 ? (
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 6,
                        background: "rgba(139,26,26,0.08)", color: "#8B1A1A",
                      }}>
                        {totaux.alertes}
                      </span>
                    ) : (
                      <span style={{ color: "#4a6741", fontSize: 11 }}>✓</span>
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* ── Alertes Détaillées ──────────────────────────────────── */}
        {bilans.some(b => b.bilan.alertes.length > 0) && (
          <div style={{ marginTop: 24 }}>
            <h3 style={{
              fontSize: 12, fontWeight: 700, color: "#8B1A1A", marginBottom: 10,
              fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
              letterSpacing: 1, textTransform: "uppercase",
            }}>
              Détail des alertes
            </h3>
            <div style={{
              padding: "12px 14px", borderRadius: 10,
              background: "rgba(139,26,26,0.04)", border: "1px solid rgba(139,26,26,0.12)",
            }}>
              {bilans.flatMap(b => b.bilan.alertes).map((a, i) => (
                <div key={i} style={{ fontSize: 11, color: "#8B1A1A", padding: "3px 0" }}>
                  {a.message}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── SILAE Preview ──────────────────────────────────────── */}
        {bilans.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <h3 style={{
              fontSize: 12, fontWeight: 700, color: "#1a1a1a", marginBottom: 10,
              fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
              letterSpacing: 1, textTransform: "uppercase",
            }}>
              Aperçu export SILAE
            </h3>
            <SilaePreview bilans={bilans} legal={legal} debut={debut} fin={fin} />
          </div>
        )}
      </main>
    </>
  )
}

// ── SILAE Preview ─────────────────────────────────────────────────────────────

function SilaePreview({ bilans, legal, debut, fin }: {
  bilans: { employe: EmployeAvecContrat; bilan: BilanMois }[]
  legal: ReturnType<typeof useConventionLegale>
  debut: string; fin: string
}) {
  const rows = useMemo(() => {
    const allRows: ExportSilaeRow[] = []
    for (const { employe, bilan } of bilans) {
      if (!employe.matricule) continue
      const r = legal.genererExportSilae(
        {
          heures_travaillees: bilan.heures_travaillees,
          heures_normales: bilan.heures_normales,
          heures_supp_25: bilan.heures_supp_25,
          heures_supp_50: bilan.heures_supp_50,
          heures_supp_10: bilan.heures_supp_10,
          heures_supp_20: bilan.heures_supp_20,
          heures_comp_10: bilan.heures_comp_10,
          heures_comp_25: bilan.heures_comp_25,
          delta_contrat: bilan.heures_travaillees - bilan.heures_contractuelles,
          rc_acquis: bilan.solde_rc,
          nb_repas: bilan.nb_repas,
          jours_travailles: bilan.jours_travailles,
          alertes: bilan.alertes,
          bilans_semaines: [],
        },
        employe.matricule,
        employe.contrat_type ?? "CDI",
        debut, fin,
      )
      allRows.push(...r)
    }
    return allRows
  }, [bilans, legal, debut, fin])

  if (!rows.length) {
    return (
      <div style={{ padding: 16, textAlign: "center", color: "#999", fontSize: 12, background: "#fff", borderRadius: 10, border: "1px solid #ece6db" }}>
        Aucune ligne à exporter (vérifiez les matricules).
      </div>
    )
  }

  return (
    <div style={{ overflowX: "auto", background: "#fff", borderRadius: 10, border: "1px solid #ece6db" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
        <thead>
          <tr>
            <th style={previewTh}>Matricule</th>
            <th style={previewTh}>Code</th>
            <th style={previewTh}>Valeur</th>
            <th style={previewTh}>Date début</th>
            <th style={previewTh}>Date fin</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td style={previewTd}>{r.matricule}</td>
              <td style={{ ...previewTd, fontWeight: 600, color: r.code.startsWith("HS") ? "#D4775A" : "#1a1a1a" }}>{r.code}</td>
              <td style={{ ...previewTd, fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif", fontWeight: 700 }}>{r.valeur}</td>
              <td style={previewTd}>{r.date_debut}</td>
              <td style={previewTd}>{r.date_fin}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div style={{
      padding: "12px 8px", background: alert ? "rgba(139,26,26,0.04)" : "#fff",
      borderRadius: 10, border: alert ? "1px solid rgba(139,26,26,0.15)" : "1px solid #ece6db",
      textAlign: "center",
    }}>
      <div style={{
        fontSize: 22, fontWeight: 700, color: alert ? "#8B1A1A" : "#1a1a1a",
        fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif", lineHeight: 1,
      }}>
        {value}
      </div>
      <div style={{
        fontSize: 9, fontWeight: 700, color: alert ? "#8B1A1A" : "#999", marginTop: 4,
        fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
        letterSpacing: 1, textTransform: "uppercase",
      }}>
        {label}
      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const navBtnStyle: React.CSSProperties = {
  padding: "5px 12px", borderRadius: 20, border: "1px solid #ddd6c8",
  background: "#fff", fontSize: 11, fontWeight: 600, color: "#666", cursor: "pointer",
}

const thStyle: React.CSSProperties = {
  padding: "8px 6px", borderBottom: "2px solid #ddd6c8", textAlign: "center",
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif", fontWeight: 700,
  color: "#999", fontSize: 10, letterSpacing: 1, textTransform: "uppercase",
}

const tdStyle: React.CSSProperties = { padding: "8px 6px", borderBottom: "1px solid #f0ebe3" }

const previewTh: React.CSSProperties = {
  padding: "6px 10px", borderBottom: "1px solid #ece6db", textAlign: "left",
  fontSize: 9, fontWeight: 700, color: "#999", letterSpacing: 0.5, textTransform: "uppercase",
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
}

const previewTd: React.CSSProperties = { padding: "5px 10px", borderBottom: "1px solid #f5f0e8", fontSize: 11 }
