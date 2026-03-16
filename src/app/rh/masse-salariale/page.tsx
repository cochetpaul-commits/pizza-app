"use client"

import { useState, useMemo } from "react"
import { NavBar } from "@/components/NavBar"
import { TopNav } from "@/components/TopNav"
import { useEtablissement } from "@/lib/EtablissementContext"
import { useEmployes, type EmployeAvecContrat } from "@/hooks/useEmployes"
import { useShifts } from "@/hooks/useShifts"
import { useSettings } from "@/hooks/useSettings"
import { usePopina, useRatiosSemaine } from "@/hooks/usePopina"
import { useConventionLegale, type ShiftInput, type ContratInput } from "@/hooks/useConventionLegale"

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

type EmployeCout = {
  employe: EmployeAvecContrat
  heures: number
  heures_supp: number
  nb_repas: number
  cout_brut: number
  cout_charges: number
  cout_repas: number
  cout_total: number
  remuneration_contrat: number
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MasseSalarialePage() {
  const { current: etablissement } = useEtablissement()
  const etabId = etablissement?.id ?? null
  const { values: settings } = useSettings(etabId)
  const { employes } = useEmployes(etabId)
  const legal = useConventionLegale()

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [view, setView] = useState<"table" | "simulation">("table")

  const { debut, fin } = useMemo(() => getMonthRange(year, month), [year, month])
  const periode = `${year}-${String(month).padStart(2, "0")}`

  const { shifts, loading: shiftsLoading } = useShifts(etabId, debut, fin)

  // Popina for MS ratio
  const { data: popinaData } = usePopina({ locationId: settings.popina_location_id, dateDebut: debut, dateFin: fin })

  // ── Cost per employee ──────────────────────────────────────
  const tauxCharges = (settings.charges_patronales + settings.taux_accident_travail) / 100
  const tauxHoraire = settings.taux_horaire_moyen
  const valeurRepas = settings.repas_valeur_an
  const cpDansTaux = settings.cp_dans_taux

  const couts = useMemo((): EmployeCout[] => {
    return employes
      .filter(e => e.contrat_type !== "TNS" && e.contrat_actif)
      .map(emp => {
        const contratActif = emp.contrat_actif!
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

        let heures = 0, heures_supp = 0, nb_repas = 0
        if (empShifts.length) {
          const contrat: ContratInput = {
            type: contratActif.type,
            heures_semaine: contratActif.heures_semaine,
            convention: settings.convention,
          }
          const bilan = legal.calculerBilanMois(empShifts, contrat, periode)
          heures = bilan.heures_travaillees
          heures_supp = bilan.heures_supp_25 + bilan.heures_supp_50 + bilan.heures_supp_10 + bilan.heures_supp_20
          nb_repas = bilan.nb_repas
        }

        const cout_brut = Math.round(heures * tauxHoraire * 100) / 100
        const cpMaj = cpDansTaux ? 0.10 : 0
        const cout_charges = Math.round(cout_brut * (1 + tauxCharges + cpMaj))
        const cout_repas = Math.round(nb_repas * valeurRepas * 100) / 100
        const cout_total = cout_charges + cout_repas

        return {
          employe: emp,
          heures, heures_supp, nb_repas,
          cout_brut, cout_charges, cout_repas, cout_total,
          remuneration_contrat: contratActif.remuneration,
        }
      })
      .sort((a, b) => b.cout_total - a.cout_total)
  }, [employes, shifts, settings, periode, legal, tauxCharges, tauxHoraire, valeurRepas, cpDansTaux])

  // ── TNS fixed costs ────────────────────────────────────────
  const tns = useMemo(() =>
    employes.filter(e => e.contrat_type === "TNS"),
    [employes]
  )

  // ── Totaux ─────────────────────────────────────────────────
  const totaux = useMemo(() => {
    let heures = 0, supp = 0, repas = 0, brut = 0, charges = 0, repasAN = 0, total = 0
    for (const c of couts) {
      heures += c.heures; supp += c.heures_supp; repas += c.nb_repas
      brut += c.cout_brut; charges += c.cout_charges; repasAN += c.cout_repas; total += c.cout_total
    }
    return {
      heures: Math.round(heures * 100) / 100,
      supp: Math.round(supp * 100) / 100,
      repas, brut: Math.round(brut),
      charges: Math.round(charges), repasAN: Math.round(repasAN * 100) / 100,
      total: Math.round(total),
    }
  }, [couts])

  // MS Ratio
  const ratios = useRatiosSemaine({
    popinaData,
    heures_travaillees: totaux.heures,
    nb_repas: totaux.repas,
    heures_supp: totaux.supp,
    objectifs: {
      productivite_cible: settings.objectif_productivite,
      ratio_ms_cible: settings.objectif_ratio_ms,
      taux_charges_patronales: tauxCharges,
      valeur_repas_an: valeurRepas,
      taux_horaire_moyen: tauxHoraire,
    },
  })

  // ── Nav ────────────────────────────────────────────────────
  const prevMonth = () => { if (month === 1) { setYear(y => y - 1); setMonth(12) } else setMonth(m => m - 1) }
  const nextMonth = () => { if (month === 12) { setYear(y => y + 1); setMonth(1) } else setMonth(m => m + 1) }

  return (
    <>
      <NavBar backHref="/" backLabel="Accueil" />
      <main style={{ maxWidth: 950, margin: "0 auto", padding: "0 16px 40px" }}>
        <TopNav
          title="MASSE SALARIALE"
          subtitle={`${MOIS_FR[month - 1]} ${year}`}
          eyebrow="Ressources humaines"
        />

        {/* ── Month Nav + View toggle ────────────────────────────── */}
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

          {(["table", "simulation"] as const).map(v => (
            <button
              key={v} type="button" onClick={() => setView(v)}
              style={{
                padding: "5px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                border: view === v ? "2px solid #D4775A" : "1px solid #ddd6c8",
                background: view === v ? "rgba(212,119,90,0.08)" : "#fff",
                color: view === v ? "#D4775A" : "#666", cursor: "pointer",
                fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
                letterSpacing: 1, textTransform: "uppercase",
              }}
            >
              {v === "table" ? "Détail" : "Simulation"}
            </button>
          ))}
        </div>

        {/* ── KPI Cards ──────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
          <KpiCard label="Coût total" value={`${totaux.total.toLocaleString("fr-FR")}€`} big />
          <KpiCard label="Dont charges" value={`${(totaux.charges - totaux.brut).toLocaleString("fr-FR")}€`} />
          <KpiCard
            label="Ratio MS"
            value={ratios.ratio_masse_salariale !== null ? `${ratios.ratio_masse_salariale}%` : "—"}
            alert={ratios.alerte_masse_salariale}
            target={`Obj. ${settings.objectif_ratio_ms}%`}
          />
          <KpiCard
            label="Productivité"
            value={ratios.productivite !== null ? `${ratios.productivite}€/h` : "—"}
            alert={ratios.alerte_productivite}
            target={`Obj. ${settings.objectif_productivite}€/h`}
          />
        </div>

        {/* ── Cost Breakdown Bar ──────────────────────────────────── */}
        <CostBreakdown
          brut={totaux.brut}
          charges={totaux.charges - totaux.brut}
          repas={totaux.repasAN}
          caHT={popinaData?.total_ca_ht ?? null}
          objectifRatio={settings.objectif_ratio_ms}
        />

        {shiftsLoading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#999", fontSize: 13 }}>Chargement...</div>
        ) : view === "table" ? (
          <>
            {/* ── Detail Table ────────────────────────────────────── */}
            <div style={{ overflowX: "auto", marginTop: 20 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, textAlign: "left", minWidth: 140 }}>Collaborateur</th>
                    <th style={thStyle}>Heures</th>
                    <th style={thStyle}>H. supp</th>
                    <th style={thStyle}>Repas</th>
                    <th style={thStyle}>Coût brut</th>
                    <th style={thStyle}>Coût chargé</th>
                    <th style={thStyle}>Repas AN</th>
                    <th style={thStyle}>Coût total</th>
                    <th style={thStyle}>% du total</th>
                  </tr>
                </thead>
                <tbody>
                  {couts.map(c => {
                    const pct = totaux.total > 0 ? Math.round(c.cout_total / totaux.total * 1000) / 10 : 0
                    return (
                      <tr key={c.employe.id}>
                        <td style={{ ...tdStyle, fontWeight: 600 }}>
                          {c.employe.prenom} {c.employe.nom}
                          <div style={{ fontSize: 10, color: "#999" }}>
                            {c.employe.contrat_type} · {c.employe.heures_semaine}h · {c.remuneration_contrat.toLocaleString("fr-FR")}€
                          </div>
                        </td>
                        <td style={{ ...tdStyle, textAlign: "center", fontFamily: numFont }}>{c.heures}h</td>
                        <td style={{ ...tdStyle, textAlign: "center", fontFamily: numFont, color: c.heures_supp > 0 ? "#D4775A" : "#999" }}>
                          {c.heures_supp > 0 ? `${Math.round(c.heures_supp * 100) / 100}h` : "—"}
                        </td>
                        <td style={{ ...tdStyle, textAlign: "center" }}>{c.nb_repas}</td>
                        <td style={{ ...tdStyle, textAlign: "right", fontFamily: numFont }}>{c.cout_brut.toLocaleString("fr-FR")}€</td>
                        <td style={{ ...tdStyle, textAlign: "right", fontFamily: numFont }}>{c.cout_charges.toLocaleString("fr-FR")}€</td>
                        <td style={{ ...tdStyle, textAlign: "right", fontFamily: numFont }}>{c.cout_repas}€</td>
                        <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, fontFamily: numFont }}>{c.cout_total.toLocaleString("fr-FR")}€</td>
                        <td style={{ ...tdStyle, textAlign: "center" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <div style={{
                              height: 6, borderRadius: 3, background: "#D4775A",
                              width: `${Math.min(pct, 100)}%`, minWidth: 2, transition: "width 0.3s",
                            }} />
                            <span style={{ fontSize: 10, color: "#999", whiteSpace: "nowrap" }}>{pct}%</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}

                  {/* TNS rows */}
                  {tns.map(emp => (
                    <tr key={emp.id} style={{ opacity: 0.6 }}>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>
                        {emp.prenom} {emp.nom}
                        <span style={{
                          marginLeft: 6, fontSize: 8, fontWeight: 700, padding: "1px 5px",
                          borderRadius: 4, background: "rgba(155,142,196,0.12)", color: "#9B8EC4",
                        }}>TNS</span>
                      </td>
                      <td colSpan={7} style={{ ...tdStyle, textAlign: "center", fontSize: 11, color: "#9B8EC4" }}>
                        Hors masse salariale — coût fixe mensuel
                      </td>
                      <td style={tdStyle} />
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: "2px solid #ddd6c8" }}>
                    <td style={{ ...tdStyle, fontWeight: 700 }}>TOTAL</td>
                    <td style={{ ...tdStyle, textAlign: "center", fontWeight: 700, fontFamily: numFont }}>{totaux.heures}h</td>
                    <td style={{ ...tdStyle, textAlign: "center", fontWeight: 700, fontFamily: numFont, color: "#D4775A" }}>
                      {totaux.supp > 0 ? `${totaux.supp}h` : "—"}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center", fontWeight: 700 }}>{totaux.repas}</td>
                    <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, fontFamily: numFont }}>{totaux.brut.toLocaleString("fr-FR")}€</td>
                    <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, fontFamily: numFont }}>{totaux.charges.toLocaleString("fr-FR")}€</td>
                    <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, fontFamily: numFont }}>{totaux.repasAN}€</td>
                    <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, fontFamily: numFont, fontSize: 14 }}>{totaux.total.toLocaleString("fr-FR")}€</td>
                    <td style={tdStyle} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        ) : (
          /* ── Simulation View ─────────────────────────────────── */
          <SimulationView
            settings={settings}
            totaux={totaux}
            caHT={popinaData?.total_ca_ht ?? null}
          />
        )}

        {/* ── Params reminder ────────────────────────────────────── */}
        <div style={{
          marginTop: 24, padding: "10px 14px", borderRadius: 8,
          background: "rgba(0,0,0,0.02)", border: "1px solid #ece6db",
          fontSize: 10, color: "#b0a894", display: "flex", gap: 16, flexWrap: "wrap",
        }}>
          <span>Taux horaire moyen : <strong>{tauxHoraire}€</strong></span>
          <span>Charges patronales : <strong>{settings.charges_patronales}%</strong></span>
          <span>Taux AT : <strong>{settings.taux_accident_travail}%</strong></span>
          <span>CP dans taux : <strong>{cpDansTaux ? "Oui (+10%)" : "Non"}</strong></span>
          <span>Repas AN : <strong>{valeurRepas}€</strong></span>
          <span>Convention : <strong>{settings.convention === "HCR_1979" ? "HCR 1979" : "Rapide 1501"}</strong></span>
        </div>
      </main>
    </>
  )
}

// ── Cost Breakdown Bar ────────────────────────────────────────────────────────

function CostBreakdown({ brut, charges, repas, caHT, objectifRatio }: {
  brut: number; charges: number; repas: number; caHT: number | null; objectifRatio: number
}) {
  const total = brut + charges + repas
  if (total === 0) return null

  const pBrut = (brut / total) * 100
  const pCharges = (charges / total) * 100
  const pRepas = (repas / total) * 100

  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={barLabel}>Décomposition du coût</span>
        {caHT !== null && (
          <span style={{ fontSize: 10, color: "#999" }}>
            CA HT : <strong style={{ color: "#1a1a1a" }}>{caHT.toLocaleString("fr-FR")}€</strong>
            {" · "}Objectif MS : <strong>{objectifRatio}%</strong>
            {" · "}Budget : <strong>{Math.round(caHT * objectifRatio / 100).toLocaleString("fr-FR")}€</strong>
          </span>
        )}
      </div>
      <div style={{ display: "flex", height: 24, borderRadius: 6, overflow: "hidden", marginBottom: 8 }}>
        <div style={{ width: `${pBrut}%`, background: "#D4775A", transition: "width 0.3s" }} />
        <div style={{ width: `${pCharges}%`, background: "#A0845C", transition: "width 0.3s" }} />
        <div style={{ width: `${pRepas}%`, background: "#4a6741", transition: "width 0.3s" }} />
      </div>
      <div style={{ display: "flex", gap: 16, fontSize: 10 }}>
        <Legend color="#D4775A" label="Brut" value={`${brut.toLocaleString("fr-FR")}€`} />
        <Legend color="#A0845C" label="Charges" value={`${charges.toLocaleString("fr-FR")}€`} />
        <Legend color="#4a6741" label="Repas AN" value={`${repas}€`} />
      </div>
    </div>
  )
}

function Legend({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <div style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
      <span style={{ color: "#999" }}>{label}</span>
      <strong style={{ color: "#1a1a1a" }}>{value}</strong>
    </div>
  )
}

// ── Simulation View ───────────────────────────────────────────────────────────

function SimulationView({ settings, totaux, caHT }: {
  settings: { charges_patronales: number; taux_accident_travail: number; taux_horaire_moyen: number; repas_valeur_an: number; cp_dans_taux: boolean; objectif_ratio_ms: number }
  totaux: { heures: number; repas: number; total: number }
  caHT: number | null
}) {
  const [simCharges, setSimCharges] = useState(settings.charges_patronales)
  const [simTauxAT, setSimTauxAT] = useState(settings.taux_accident_travail)
  const [simTaux, setSimTaux] = useState(settings.taux_horaire_moyen)
  const [simRepas, setSimRepas] = useState(settings.repas_valeur_an)
  const [simCP, setSimCP] = useState(settings.cp_dans_taux)

  const simCoutBrut = Math.round(totaux.heures * simTaux)
  const simTauxTotal = (simCharges + simTauxAT) / 100 + (simCP ? 0.10 : 0)
  const simCoutCharges = Math.round(simCoutBrut * (1 + simTauxTotal))
  const simCoutRepas = Math.round(totaux.repas * simRepas * 100) / 100
  const simTotal = Math.round(simCoutCharges + simCoutRepas)
  const simRatio = caHT && caHT > 0 ? Math.round(simTotal / caHT * 10000) / 100 : null

  const diffTotal = simTotal - totaux.total

  return (
    <div style={{ marginTop: 20 }}>
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <h3 style={sectionTitle}>Paramètres de simulation</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <SimSlider label="Taux horaire moyen" value={simTaux} onChange={setSimTaux} min={10} max={30} step={0.5} unit="€/h" />
          <SimSlider label="Charges patronales" value={simCharges} onChange={setSimCharges} min={20} max={50} step={0.5} unit="%" />
          <SimSlider label="Taux AT" value={simTauxAT} onChange={setSimTauxAT} min={0.5} max={5} step={0.1} unit="%" />
          <SimSlider label="Repas AN" value={simRepas} onChange={setSimRepas} min={0} max={8} step={0.01} unit="€" />
          <div>
            <span style={sliderLabel}>CP dans taux</span>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginTop: 6 }}>
              <input type="checkbox" checked={simCP} onChange={e => setSimCP(e.target.checked)} />
              {simCP ? "Oui (+10%)" : "Non"}
            </label>
          </div>
        </div>
      </div>

      {/* Results */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        <SimResult label="Coût total simulé" value={`${simTotal.toLocaleString("fr-FR")}€`} />
        <SimResult
          label="Différence"
          value={`${diffTotal >= 0 ? "+" : ""}${diffTotal.toLocaleString("fr-FR")}€`}
          color={diffTotal > 0 ? "#8B1A1A" : diffTotal < 0 ? "#4a6741" : "#999"}
        />
        <SimResult
          label="Ratio MS simulé"
          value={simRatio !== null ? `${simRatio}%` : "—"}
          color={simRatio !== null && simRatio > settings.objectif_ratio_ms ? "#8B1A1A" : "#4a6741"}
          sub={`Objectif : ${settings.objectif_ratio_ms}%`}
        />
      </div>

      {/* Detail */}
      <div className="card" style={{ padding: 14, marginTop: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12 }}>
          <DetailRow label="Heures (inchangées)" value={`${totaux.heures}h`} />
          <DetailRow label="Coût brut" value={`${simCoutBrut.toLocaleString("fr-FR")}€`} />
          <DetailRow label={`Taux total charges (${Math.round(simTauxTotal * 10000) / 100}%)`} value={`${(simCoutCharges - simCoutBrut).toLocaleString("fr-FR")}€`} />
          <DetailRow label={`Repas AN (${totaux.repas} × ${simRepas}€)`} value={`${simCoutRepas}€`} />
        </div>
      </div>
    </div>
  )
}

function SimSlider({ label, value, onChange, min, max, step, unit }: {
  label: string; value: number; onChange: (v: number) => void; min: number; max: number; step: number; unit: string
}) {
  return (
    <div>
      <span style={sliderLabel}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(Number(e.target.value))}
          style={{ flex: 1, accentColor: "#D4775A" }}
        />
        <span style={{
          fontSize: 13, fontWeight: 700, minWidth: 50, textAlign: "right",
          fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
        }}>
          {value}{unit}
        </span>
      </div>
    </div>
  )
}

function SimResult({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div className="card" style={{ padding: 14, textAlign: "center" }}>
      <div style={{
        fontSize: 24, fontWeight: 700, color: color ?? "#1a1a1a",
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
      {sub && <div style={{ fontSize: 10, color: "#b0a894", marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #f0ebe3" }}>
      <span style={{ color: "#666" }}>{label}</span>
      <span style={{ fontWeight: 600, fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif" }}>{value}</span>
    </div>
  )
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({ label, value, alert, big, target }: { label: string; value: string; alert?: boolean; big?: boolean; target?: string }) {
  return (
    <div style={{
      padding: "14px 10px", background: alert ? "rgba(139,26,26,0.04)" : "#fff",
      borderRadius: 10, border: alert ? "1px solid rgba(139,26,26,0.15)" : "1px solid #ece6db",
      textAlign: "center",
    }}>
      <div style={{
        fontSize: big ? 28 : 22, fontWeight: 700, color: alert ? "#8B1A1A" : "#1a1a1a",
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
      {target && <div style={{ fontSize: 9, color: "#b0a894", marginTop: 2 }}>{target}</div>}
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
  color: "#999", fontSize: 9, letterSpacing: 1, textTransform: "uppercase",
}

const tdStyle: React.CSSProperties = { padding: "8px 6px", borderBottom: "1px solid #f0ebe3" }

const numFont = "var(--font-cormorant), 'Cormorant Garamond', serif"

const barLabel: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: "#1a1a1a",
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
  letterSpacing: 1, textTransform: "uppercase",
}

const sectionTitle: React.CSSProperties = {
  margin: "0 0 14px", fontSize: 12, fontWeight: 700, color: "#1a1a1a",
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
  letterSpacing: 1, textTransform: "uppercase",
}

const sliderLabel: React.CSSProperties = {
  display: "block", fontSize: 10, fontWeight: 700, color: "#999",
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
  letterSpacing: 0.5, textTransform: "uppercase",
}
