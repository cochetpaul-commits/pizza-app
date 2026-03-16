"use client"

import { useMemo, useState } from "react"
import { NavBar } from "@/components/NavBar"
import { TopNav } from "@/components/TopNav"
import { useAuth } from "@/hooks/useAuth"
import { useEtablissement } from "@/lib/EtablissementContext"
import { useShifts } from "@/hooks/useShifts"
import { supabase } from "@/lib/supabase"
import type { Shift, Poste } from "@/lib/supabase"
import { useEffect } from "react"

// ── Helpers ──────────────────────────────────────────────────────────────────

function getMonday(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay() || 7
  d.setDate(d.getDate() - day + 1)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date); d.setDate(d.getDate() + days); return d
}

function fmtDate(d: Date): string { return d.toISOString().slice(0, 10) }
function fmtTime(t: string): string { return t.slice(0, 5) }

function getWeekNumber(date: Date): number {
  const d = new Date(date); d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const yearStart = new Date(d.getFullYear(), 0, 1)
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}

function shiftDuree(debut: string, fin: string, pause: number): number {
  const [h1, m1] = debut.split(":").map(Number)
  const [h2, m2] = fin.split(":").map(Number)
  let minutes = (h2 * 60 + m2) - (h1 * 60 + m1)
  if (minutes < 0) minutes += 24 * 60
  return Math.max(0, (minutes - pause) / 60)
}

const JOURS_FR = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MesShiftsPage() {
  const { profile } = useAuth()
  const { current: etablissement } = useEtablissement()
  const etabId = etablissement?.id ?? null

  const [monday, setMonday] = useState(() => getMonday(new Date()))
  const [postes, setPostes] = useState<Poste[]>([])
  const [employeId, setEmployeId] = useState<string | null>(null)

  const dateDebut = fmtDate(monday)
  const dateFin = fmtDate(addDays(monday, 6))
  const weekNum = getWeekNumber(monday)

  const { shifts, loading } = useShifts(etabId, dateDebut, dateFin)

  // Find employee id matching current user profile
  useEffect(() => {
    if (!profile?.id || !etabId) return
    supabase
      .from("employes")
      .select("id")
      .eq("etablissement_id", etabId)
      .eq("email", profile.display_name) // Fallback: match by auth user id or email
      .eq("actif", true)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setEmployeId(data.id)
      })
    // Also try matching by user_id if a column exists, else rely on all shifts
  }, [profile?.id, etabId, profile?.display_name])

  // Fetch postes
  useEffect(() => {
    if (!etabId) return
    supabase.from("postes").select("*").eq("etablissement_id", etabId).eq("actif", true)
      .then(({ data }) => setPostes((data ?? []) as Poste[]))
  }, [etabId])

  const posteMap = useMemo(() => {
    const m = new Map<string, Poste>()
    for (const p of postes) m.set(p.id, p)
    return m
  }, [postes])

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(monday, i)), [monday])

  // Filter to employee's shifts (if matched) or show all for now
  const myShifts = useMemo(() => {
    if (employeId) return shifts.filter(s => s.employe_id === employeId)
    return shifts
  }, [shifts, employeId])

  const shiftsByDay = useMemo(() => {
    const m = new Map<string, Shift[]>()
    for (const d of days) m.set(fmtDate(d), [])
    for (const s of myShifts) {
      const arr = m.get(s.date)
      if (arr) arr.push(s)
    }
    return m
  }, [myShifts, days])

  const totalHeures = useMemo(() =>
    Math.round(myShifts.reduce((a, s) => a + shiftDuree(s.heure_debut, s.heure_fin, s.pause_minutes), 0) * 100) / 100,
    [myShifts]
  )

  const totalRepas = myShifts.length

  const prevWeek = () => setMonday(addDays(monday, -7))
  const nextWeek = () => setMonday(addDays(monday, 7))
  const goToday = () => setMonday(getMonday(new Date()))

  return (
    <>
      <NavBar backHref="/" backLabel="Accueil" />
      <main style={{ maxWidth: 600, margin: "0 auto", padding: "0 16px 40px" }}>
        <TopNav
          title="MES SHIFTS"
          subtitle={`Semaine ${weekNum}`}
          eyebrow="Mon planning"
        />

        {/* ── Week Nav ───────────────────────────────────────────── */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center", justifyContent: "center" }}>
          <button type="button" onClick={prevWeek} style={navBtnStyle}>←</button>
          <button type="button" onClick={goToday} style={{ ...navBtnStyle, fontWeight: 700, color: "#D4775A" }}>
            Aujourd&apos;hui
          </button>
          <button type="button" onClick={nextWeek} style={navBtnStyle}>→</button>
        </div>

        {/* ── Summary Cards ──────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
          <SummaryCard label="Heures" value={`${totalHeures}h`} />
          <SummaryCard label="Shifts" value={String(myShifts.length)} />
          <SummaryCard label="Repas" value={String(totalRepas)} />
        </div>

        {/* ── Day Cards ──────────────────────────────────────────── */}
        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#999", fontSize: 13 }}>Chargement...</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {days.map((d, i) => {
              const dateStr = fmtDate(d)
              const isToday = dateStr === fmtDate(new Date())
              const dayShifts = shiftsByDay.get(dateStr) ?? []
              const isOff = dayShifts.length === 0

              return (
                <div key={dateStr} style={{
                  padding: "14px 16px", borderRadius: 12,
                  background: isToday ? "rgba(212,119,90,0.05)" : "#fff",
                  border: isToday ? "2px solid #D4775A" : "1px solid #ece6db",
                }}>
                  {/* Day header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: isOff ? 0 : 10 }}>
                    <div>
                      <span style={{
                        fontSize: 12, fontWeight: 700, color: isToday ? "#D4775A" : "#1a1a1a",
                        fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
                        letterSpacing: 1, textTransform: "uppercase",
                      }}>
                        {JOURS_FR[i]}
                      </span>
                      <span style={{ fontSize: 11, color: "#999", marginLeft: 8 }}>
                        {d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                      </span>
                    </div>
                    {isOff ? (
                      <span style={{ fontSize: 10, color: "#ccc", fontWeight: 600 }}>REPOS</span>
                    ) : (
                      <span style={{
                        fontSize: 11, fontWeight: 700, color: "#1a1a1a",
                        fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
                      }}>
                        {Math.round(dayShifts.reduce((a, s) => a + shiftDuree(s.heure_debut, s.heure_fin, s.pause_minutes), 0) * 100) / 100}h
                      </span>
                    )}
                  </div>

                  {/* Shifts */}
                  {dayShifts.length > 0 && (
                    <div style={{ display: "grid", gap: 6 }}>
                      {dayShifts.map(s => {
                        const poste = s.poste_id ? posteMap.get(s.poste_id) : null
                        const color = poste?.couleur ?? "#666"
                        const duree = shiftDuree(s.heure_debut, s.heure_fin, s.pause_minutes)
                        return (
                          <div key={s.id} style={{
                            display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                            borderRadius: 8, background: `${color}08`, borderLeft: `4px solid ${color}`,
                          }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color }}>
                                {poste?.emoji ? `${poste.emoji} ` : ""}{poste?.nom ?? "—"}
                              </div>
                              <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
                                {fmtTime(s.heure_debut)} – {fmtTime(s.heure_fin)}
                                <span style={{ color: "#b0a894", marginLeft: 6, fontSize: 10 }}>
                                  ({s.pause_minutes}mn pause)
                                </span>
                              </div>
                            </div>
                            <div style={{
                              fontSize: 16, fontWeight: 700, color: "#1a1a1a",
                              fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
                            }}>
                              {Math.round(duree * 100) / 100}h
                            </div>
                            {s.statut === "brouillon" && (
                              <span style={{
                                fontSize: 8, fontWeight: 700, padding: "2px 5px", borderRadius: 4,
                                background: "rgba(160,132,92,0.12)", color: "#A0845C",
                              }}>
                                BROUILLON
                              </span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {dayShifts.some(sh => sh.note) && (
                    <div style={{ marginTop: 6, fontSize: 11, color: "#999", fontStyle: "italic" }}>
                      {dayShifts.filter(sh => sh.note).map(sh => sh.note).join(" · ")}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>
    </>
  )
}

// ── Summary Card ──────────────────────────────────────────────────────────────

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      padding: "12px 8px", background: "#fff", borderRadius: 10,
      border: "1px solid #ece6db", textAlign: "center",
    }}>
      <div style={{
        fontSize: 22, fontWeight: 700, color: "#1a1a1a",
        fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif", lineHeight: 1,
      }}>
        {value}
      </div>
      <div style={{
        fontSize: 9, fontWeight: 700, color: "#999", marginTop: 4,
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
  padding: "5px 14px", borderRadius: 20, border: "1px solid #ddd6c8",
  background: "#fff", fontSize: 11, fontWeight: 600, color: "#666", cursor: "pointer",
}
