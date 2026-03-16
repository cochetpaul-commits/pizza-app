"use client"

import { useEffect, useMemo, useState, useCallback } from "react"
import { NavBar } from "@/components/NavBar"
import { TopNav } from "@/components/TopNav"
import { useProfile } from "@/lib/ProfileContext"
import { useEtablissement } from "@/lib/EtablissementContext"
import { useShifts } from "@/hooks/useShifts"
import { useEmployes } from "@/hooks/useEmployes"
import { usePlanningLegal, type Alerte } from "@/hooks/usePlanningLegal"
import { usePopina, useRatiosSemaine, OBJECTIFS_BELLO_MIO } from "@/hooks/usePopina"
import { useSettings } from "@/hooks/useSettings"
import { supabase } from "@/lib/supabase"
import type { Shift, Poste } from "@/lib/supabase"

// ── Helpers ──────────────────────────────────────────────────────────────────

function getMonday(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay() || 7
  d.setDate(d.getDate() - day + 1)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function fmtDate(d: Date): string { return d.toISOString().slice(0, 10) }

function fmtDateShort(d: Date): string {
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })
}

function fmtTime(t: string): string { return t.slice(0, 5) }

function shiftDureeNette(debut: string, fin: string, pause: number): number {
  const [h1, m1] = debut.split(":").map(Number)
  const [h2, m2] = fin.split(":").map(Number)
  let minutes = (h2 * 60 + m2) - (h1 * 60 + m1)
  if (minutes < 0) minutes += 24 * 60
  return Math.max(0, (minutes - pause) / 60)
}

function getWeekNumber(date: Date): number {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const yearStart = new Date(d.getFullYear(), 0, 1)
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}

type FilterEquipe = "Tous" | "Cuisine" | "Salle" | "Shop"

// ── Component ────────────────────────────────────────────────────────────────

export default function PlanningsPage() {
  const { canWrite } = useProfile()
  const { current: etablissement } = useEtablissement()
  const etabId = etablissement?.id ?? null

  const [monday, setMonday] = useState(() => getMonday(new Date()))
  const [filter, setFilter] = useState<FilterEquipe>("Tous")
  const [postes, setPostes] = useState<Poste[]>([])

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(monday, i)), [monday])
  const weekNum = getWeekNumber(monday)
  const dateDebut = fmtDate(monday)
  const dateFin = fmtDate(addDays(monday, 6))

  // ── Data hooks ────────────────────────────────────────────────
  const { shifts, byEmployeDay, loading: shiftsLoading, createShift, updateShift, deleteShift, publishWeek, dupliquerSemaine } =
    useShifts(etabId, dateDebut, dateFin)
  const { employes, loading: empLoading } = useEmployes(etabId)
  const { values: settings } = useSettings(etabId)

  // Fetch postes
  useEffect(() => {
    if (!etabId) return
    supabase.from("postes").select("*").eq("etablissement_id", etabId).eq("actif", true)
      .then(({ data }) => setPostes((data ?? []) as Poste[]))
  }, [etabId])

  // Legal bilan
  const bilan = usePlanningLegal({
    employes, shifts, lundiISO: dateDebut,
    convention: settings.convention,
    tauxHoraire: settings.taux_horaire_moyen,
    tauxCharges: (settings.charges_patronales + settings.taux_accident_travail) / 100,
  })

  // Popina CA
  const { data: popinaData } = usePopina({
    locationId: settings.popina_location_id, dateDebut, dateFin,
  })

  const ratios = useRatiosSemaine({
    popinaData,
    heures_travaillees: bilan.total_heures,
    nb_repas: bilan.total_repas,
    heures_supp: bilan.total_heures_supp,
    objectifs: {
      productivite_cible: settings.objectif_productivite,
      ratio_ms_cible: settings.objectif_ratio_ms,
      taux_charges_patronales: settings.charges_patronales / 100,
      valeur_repas_an: settings.repas_valeur_an,
      taux_horaire_moyen: settings.taux_horaire_moyen,
    },
  })

  // ── Filtering ─────────────────────────────────────────────────
  const filteredEmployes = useMemo(() =>
    employes.filter(e => filter === "Tous" || e.equipe_access?.includes(filter)),
    [employes, filter]
  )

  const posteMap = useMemo(() => {
    const m = new Map<string, Poste>()
    for (const p of postes) m.set(p.id, p)
    return m
  }, [postes])

  const weeklyTotals = useMemo(() => {
    const totals = new Map<string, number>()
    for (const s of shifts) {
      const cur = totals.get(s.employe_id) ?? 0
      totals.set(s.employe_id, cur + shiftDureeNette(s.heure_debut, s.heure_fin, s.pause_minutes))
    }
    return totals
  }, [shifts])

  // ── Shift editing ─────────────────────────────────────────────
  const [editShift, setEditShift] = useState<{ shift?: Shift; employe_id: string; date: string } | null>(null)
  const [showDup, setShowDup] = useState(false)
  const [publishing, setPublishing] = useState(false)

  // ── Actions ───────────────────────────────────────────────────
  const handlePublish = useCallback(async () => {
    setPublishing(true)
    await publishWeek(dateDebut, dateFin)
    setPublishing(false)
  }, [publishWeek, dateDebut, dateFin])

  const handleDuplicate = useCallback(async () => {
    if (!etabId) return
    const prevMonday = fmtDate(addDays(monday, -7))
    await dupliquerSemaine({
      etablissement_id: etabId,
      sourceLundi: prevMonday,
      targetLundi: dateDebut,
      statut_cible: "brouillon",
      ecraser_existants: false,
    })
    setShowDup(false)
  }, [etabId, monday, dateDebut, dupliquerSemaine])

  // ── Nav ───────────────────────────────────────────────────────
  const prevWeek = () => setMonday(addDays(monday, -7))
  const nextWeek = () => setMonday(addDays(monday, 7))
  const goToday = () => setMonday(getMonday(new Date()))

  const loading = shiftsLoading || empLoading
  const brouillons = shifts.filter(s => s.statut === "brouillon").length

  return (
    <>
      <NavBar backHref="/" backLabel="Accueil" />
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "0 16px 40px" }}>
        <TopNav
          title="PLANNING"
          subtitle={`Semaine ${weekNum} — ${fmtDateShort(monday)} au ${fmtDateShort(addDays(monday, 6))}`}
          eyebrow="Plannings"
        />

        {/* ── KPI Bar ──────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: 16 }}>
          <KpiCard label="Heures" value={`${Math.round(bilan.total_heures * 10) / 10}h`} />
          <KpiCard label="Coût estimé" value={`${bilan.cout_estime}€`} />
          <KpiCard
            label="Ratio MS"
            value={ratios.ratio_masse_salariale !== null ? `${ratios.ratio_masse_salariale}%` : "—"}
            alert={ratios.alerte_masse_salariale}
          />
          <KpiCard
            label="Productivité"
            value={ratios.productivite !== null ? `${ratios.productivite}€/h` : "—"}
            alert={ratios.alerte_productivite}
          />
          <KpiCard
            label="Alertes"
            value={String(bilan.employes_en_alerte.length)}
            alert={bilan.employes_en_alerte.length > 0}
          />
        </div>

        {/* ── Navigation + Filtres + Actions ───────────────────────── */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" onClick={prevWeek} style={navBtnStyle}>←</button>
          <button type="button" onClick={goToday} style={{ ...navBtnStyle, fontWeight: 700, color: "#D4775A" }}>Aujourd&apos;hui</button>
          <button type="button" onClick={nextWeek} style={navBtnStyle}>→</button>

          <div style={{ flex: 1 }} />

          {(["Tous", "Cuisine", "Salle", "Shop"] as FilterEquipe[]).map(f => (
            <button
              key={f} type="button" onClick={() => setFilter(f)}
              style={{
                padding: "5px 12px", borderRadius: 20,
                border: filter === f ? "2px solid #D4775A" : "1px solid #ddd6c8",
                background: filter === f ? "rgba(212,119,90,0.08)" : "#fff",
                fontSize: 11, fontWeight: 700, cursor: "pointer",
                color: filter === f ? "#D4775A" : "#666",
                fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
                letterSpacing: 1, textTransform: "uppercase",
              }}
            >
              {f}
            </button>
          ))}
        </div>

        {/* ── Action buttons ───────────────────────────────────────── */}
        {canWrite && (
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            {brouillons > 0 && (
              <button type="button" className="btn btnPrimary" onClick={handlePublish} disabled={publishing}
                style={{ fontSize: 11, padding: "6px 14px" }}>
                {publishing ? "Publication..." : `Publier ${brouillons} brouillon${brouillons > 1 ? "s" : ""}`}
              </button>
            )}
            {showDup ? (
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "#666" }}>Dupliquer sem. {getWeekNumber(addDays(monday, -7))} → {weekNum} ?</span>
                <button type="button" className="btn btnPrimary" onClick={handleDuplicate} style={{ fontSize: 11, padding: "6px 14px" }}>
                  Confirmer
                </button>
                <button type="button" className="btn" onClick={() => setShowDup(false)} style={{ fontSize: 11, padding: "6px 14px" }}>
                  Annuler
                </button>
              </div>
            ) : (
              <button type="button" className="btn" onClick={() => setShowDup(true)} style={{ fontSize: 11, padding: "6px 14px" }}>
                Dupliquer semaine préc.
              </button>
            )}
          </div>
        )}

        {/* ── Alertes ──────────────────────────────────────────────── */}
        {bilan.alertes_par_jour.length > 0 && (
          <div style={{
            padding: "10px 14px", borderRadius: 10, marginBottom: 16,
            background: "rgba(139,26,26,0.04)", border: "1px solid rgba(139,26,26,0.12)",
          }}>
            <div style={{
              fontSize: 10, fontWeight: 700, color: "#8B1A1A", marginBottom: 6,
              fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
              letterSpacing: 1, textTransform: "uppercase",
            }}>
              Alertes légales HCR
            </div>
            {bilan.alertes_par_jour.flatMap(d => d.alertes).slice(0, 5).map((a, i) => (
              <div key={i} style={{ fontSize: 11, color: "#8B1A1A", padding: "2px 0" }}>
                {a.message}
              </div>
            ))}
            {bilan.alertes_par_jour.flatMap(d => d.alertes).length > 5 && (
              <div style={{ fontSize: 10, color: "#b05050", marginTop: 4 }}>
                +{bilan.alertes_par_jour.flatMap(d => d.alertes).length - 5} autres alertes
              </div>
            )}
          </div>
        )}

        {/* ── Grid ─────────────────────────────────────────────────── */}
        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "#999", fontSize: 13 }}>Chargement...</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, minWidth: 130, textAlign: "left" }}>Collaborateur</th>
                  {days.map(d => {
                    const isToday = fmtDate(d) === fmtDate(new Date())
                    const dayAlerts = bilan.alertes_par_jour.find(a => a.date === fmtDate(d))
                    return (
                      <th key={fmtDate(d)} style={{
                        ...thStyle, minWidth: 100,
                        background: isToday ? "rgba(212,119,90,0.06)" : undefined,
                      }}>
                        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "#999" }}>
                          {d.toLocaleDateString("fr-FR", { weekday: "short" })}
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: isToday ? "#D4775A" : "#1a1a1a" }}>
                          {d.getDate()}
                          {dayAlerts && (
                            <span style={{
                              marginLeft: 4, fontSize: 8, fontWeight: 700, padding: "1px 5px",
                              borderRadius: 4, background: "rgba(139,26,26,0.08)", color: "#8B1A1A",
                              verticalAlign: "super",
                            }}>
                              {dayAlerts.alertes.length}
                            </span>
                          )}
                        </div>
                      </th>
                    )
                  })}
                  <th style={{ ...thStyle, minWidth: 60 }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployes.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: "center", padding: 40, color: "#999", fontSize: 13 }}>
                      Aucun collaborateur dans cette équipe.
                    </td>
                  </tr>
                ) : (
                  filteredEmployes.map(emp => {
                    const total = weeklyTotals.get(emp.id) ?? 0
                    const isTNS = emp.contrat_type === "TNS"
                    const empBilan = bilan.bilans.find(b => b.employe_id === emp.id)
                    const hasAlerte = empBilan?.has_alerte ?? false

                    return (
                      <tr key={emp.id}>
                        <td style={{
                          ...tdStyle, position: "sticky", left: 0, background: "#fff",
                          zIndex: 2, borderRight: "2px solid #ece6db",
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <div style={{
                              width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                              background: isTNS
                                ? "linear-gradient(135deg, #9B8EC4, #7B6FA4)"
                                : hasAlerte
                                  ? "linear-gradient(135deg, #8B1A1A, #A02020)"
                                  : "linear-gradient(135deg, #D4775A, #C4674A)",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: 10, fontWeight: 700, color: "#fff",
                              fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
                            }}>
                              {emp.initiales ?? (emp.prenom[0] + emp.nom[0]).toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 700, color: "#1a1a1a", lineHeight: 1.2 }}>
                                {emp.prenom}
                              </div>
                              <div style={{ fontSize: 10, color: "#999" }}>
                                {emp.nom}
                                {isTNS && (
                                  <span style={{
                                    marginLeft: 4, fontSize: 8, fontWeight: 700, padding: "1px 4px",
                                    borderRadius: 4, background: "rgba(155,142,196,0.15)", color: "#9B8EC4",
                                  }}>TNS</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {days.map(d => {
                          const dateStr = fmtDate(d)
                          const isToday = dateStr === fmtDate(new Date())
                          const dayShifts = byEmployeDay[emp.id]?.[dateStr] ?? []

                          return (
                            <td key={dateStr} style={{
                              ...tdStyle,
                              background: isToday ? "rgba(212,119,90,0.03)" : undefined,
                              verticalAlign: "top", cursor: canWrite ? "pointer" : undefined,
                            }}
                              onClick={() => {
                                if (!canWrite) return
                                if (dayShifts.length === 1) {
                                  setEditShift({ shift: dayShifts[0], employe_id: emp.id, date: dateStr })
                                } else if (dayShifts.length === 0) {
                                  setEditShift({ employe_id: emp.id, date: dateStr })
                                }
                              }}
                            >
                              {dayShifts.length === 0 ? (
                                <div style={{ color: "#ddd", fontSize: 11, textAlign: "center" }}>
                                  {canWrite ? "+" : "—"}
                                </div>
                              ) : (
                                <div style={{ display: "grid", gap: 3 }}>
                                  {dayShifts.map(s => {
                                    const poste = s.poste_id ? posteMap.get(s.poste_id) : null
                                    return <ShiftCell key={s.id} shift={s} poste={poste ?? null} />
                                  })}
                                </div>
                              )}
                            </td>
                          )
                        })}

                        <td style={{
                          ...tdStyle, textAlign: "center", fontWeight: 700, fontSize: 13,
                          color: isTNS ? "#9B8EC4" : hasAlerte ? "#8B1A1A" : total > 0 ? "#1a1a1a" : "#ddd",
                          fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
                        }}>
                          {total > 0 ? `${Math.round(total * 100) / 100}h` : "—"}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Shift Editor Overlay ─────────────────────────────────── */}
        {editShift && etabId && (
          <ShiftEditor
            shift={editShift.shift ?? null}
            employeId={editShift.employe_id}
            date={editShift.date}
            etablissementId={etabId}
            postes={postes}
            pauseDefaut={settings.pause_defaut_minutes}
            onCreate={createShift}
            onUpdate={updateShift}
            onDelete={deleteShift}
            onClose={() => setEditShift(null)}
          />
        )}
      </main>
    </>
  )
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div style={{
      padding: "10px 8px", background: alert ? "rgba(139,26,26,0.04)" : "#fff",
      borderRadius: 10, border: alert ? "1px solid rgba(139,26,26,0.15)" : "1px solid #ece6db",
      textAlign: "center",
    }}>
      <div style={{
        fontSize: 18, fontWeight: 700, color: alert ? "#8B1A1A" : "#1a1a1a",
        fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif", lineHeight: 1,
      }}>
        {value}
      </div>
      <div style={{
        fontSize: 9, fontWeight: 700, color: alert ? "#8B1A1A" : "#999", marginTop: 3,
        fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
        letterSpacing: 1, textTransform: "uppercase",
      }}>
        {label}
      </div>
    </div>
  )
}

// ── ShiftCell ─────────────────────────────────────────────────────────────────

function ShiftCell({ shift, poste }: { shift: Shift; poste: Poste | null }) {
  const bg = poste ? `${poste.couleur}18` : "rgba(0,0,0,0.04)"
  const border = poste ? `${poste.couleur}40` : "rgba(0,0,0,0.08)"
  const color = poste ? poste.couleur : "#666"
  const isDraft = shift.statut === "brouillon"

  return (
    <div style={{
      padding: "4px 6px", borderRadius: 6, background: bg,
      borderLeft: `3px solid ${border}`, fontSize: 10, lineHeight: 1.3,
      opacity: isDraft ? 0.7 : 1,
    }}>
      <div style={{ fontWeight: 700, color, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>{poste?.emoji ? `${poste.emoji} ` : ""}{poste?.nom ?? "—"}</span>
        {isDraft && (
          <span style={{
            fontSize: 7, fontWeight: 700, padding: "0 3px", borderRadius: 3,
            background: "rgba(160,132,92,0.15)", color: "#A0845C",
          }}>
            B
          </span>
        )}
      </div>
      <div style={{ color: "#666" }}>{fmtTime(shift.heure_debut)}–{fmtTime(shift.heure_fin)}</div>
    </div>
  )
}

// ── Shift Editor ──────────────────────────────────────────────────────────────

function ShiftEditor({ shift, employeId, date, etablissementId, postes, pauseDefaut, onCreate, onUpdate, onDelete, onClose }: {
  shift: Shift | null
  employeId: string; date: string; etablissementId: string
  postes: Poste[]; pauseDefaut: number
  onCreate: (data: Parameters<ReturnType<typeof useShifts>["createShift"]>[0]) => Promise<Shift | null>
  onUpdate: (id: string, data: Partial<Shift>) => Promise<boolean>
  onDelete: (id: string) => Promise<boolean>
  onClose: () => void
}) {
  const [form, setForm] = useState({
    poste_id: shift?.poste_id ?? "",
    heure_debut: shift?.heure_debut?.slice(0, 5) ?? "10:00",
    heure_fin: shift?.heure_fin?.slice(0, 5) ?? "15:00",
    pause_minutes: shift?.pause_minutes ?? pauseDefaut,
    note: shift?.note ?? "",
  })
  const [saving, setSaving] = useState(false)

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm(prev => ({ ...prev, [field]: e.target.value }))
  }

  async function handleSave() {
    setSaving(true)
    if (shift) {
      await onUpdate(shift.id, {
        poste_id: form.poste_id || null,
        heure_debut: form.heure_debut + ":00",
        heure_fin: form.heure_fin + ":00",
        pause_minutes: Number(form.pause_minutes),
        note: form.note || null,
      })
    } else {
      await onCreate({
        employe_id: employeId,
        etablissement_id: etablissementId,
        date,
        poste_id: form.poste_id || null,
        heure_debut: form.heure_debut + ":00",
        heure_fin: form.heure_fin + ":00",
        pause_minutes: Number(form.pause_minutes),
        note: form.note || null,
      })
    }
    setSaving(false)
    onClose()
  }

  async function handleDelete() {
    if (!shift) return
    setSaving(true)
    await onDelete(shift.id)
    setSaving(false)
    onClose()
  }

  const duree = shiftDureeNette(form.heure_debut + ":00", form.heure_fin + ":00", Number(form.pause_minutes))

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
      backdropFilter: "blur(4px)", zIndex: 100,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }} onClick={onClose}>
      <div style={{
        background: "#f2ede4", borderRadius: 16, width: "100%", maxWidth: 400,
        padding: 20, boxShadow: "0 16px 48px rgba(0,0,0,0.2)",
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{
            margin: 0, fontSize: 14, fontWeight: 700,
            fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
            letterSpacing: 1, textTransform: "uppercase",
          }}>
            {shift ? "Modifier le shift" : "Nouveau shift"}
          </h3>
          <span style={{ fontSize: 11, color: "#999" }}>
            {new Date(date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
          </span>
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <label style={{ display: "block" }}>
            <span style={editorLabel}>Poste</span>
            <select className="input" value={form.poste_id} onChange={set("poste_id")}>
              <option value="">— Aucun —</option>
              {postes.map(p => (
                <option key={p.id} value={p.id}>{p.emoji ? `${p.emoji} ` : ""}{p.nom} ({p.equipe})</option>
              ))}
            </select>
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label style={{ display: "block" }}>
              <span style={editorLabel}>Début</span>
              <input className="input" type="time" value={form.heure_debut} onChange={set("heure_debut")} />
            </label>
            <label style={{ display: "block" }}>
              <span style={editorLabel}>Fin</span>
              <input className="input" type="time" value={form.heure_fin} onChange={set("heure_fin")} />
            </label>
          </div>

          <label style={{ display: "block" }}>
            <span style={editorLabel}>Pause (min)</span>
            <input className="input" type="number" value={form.pause_minutes} onChange={set("pause_minutes")} min={0} max={120} />
          </label>

          <label style={{ display: "block" }}>
            <span style={editorLabel}>Note</span>
            <input className="input" value={form.note} onChange={set("note")} placeholder="Optionnel..." />
          </label>

          <div style={{
            fontSize: 12, color: "#666", padding: "6px 10px", borderRadius: 8,
            background: "rgba(212,119,90,0.06)", textAlign: "center",
          }}>
            Durée nette : <strong>{Math.round(duree * 100) / 100}h</strong>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 16 }}>
          <div>
            {shift && (
              <button type="button" className="btn" onClick={handleDelete} disabled={saving}
                style={{ color: "#8B1A1A", borderColor: "rgba(139,26,26,0.3)", fontSize: 12 }}>
                Supprimer
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn" onClick={onClose} style={{ fontSize: 12 }}>Annuler</button>
            <button type="button" className="btn btnPrimary" onClick={handleSave} disabled={saving} style={{ fontSize: 12 }}>
              {saving ? "..." : shift ? "Enregistrer" : "Créer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const navBtnStyle: React.CSSProperties = {
  padding: "5px 12px", borderRadius: 20, border: "1px solid #ddd6c8",
  background: "#fff", fontSize: 11, fontWeight: 600, color: "#666", cursor: "pointer",
}

const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 12 }

const thStyle: React.CSSProperties = {
  padding: "8px 6px", borderBottom: "2px solid #ddd6c8", textAlign: "center",
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif", fontWeight: 700, color: "#1a1a1a",
}

const tdStyle: React.CSSProperties = { padding: "6px", borderBottom: "1px solid #f0ebe3" }

const editorLabel: React.CSSProperties = {
  display: "block", fontSize: 10, fontWeight: 700, color: "#999", marginBottom: 3,
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
  letterSpacing: 0.5, textTransform: "uppercase",
}
