"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useParams, useRouter } from "next/navigation"
import { NavBar } from "@/components/NavBar"
import { useProfile } from "@/lib/ProfileContext"
import { supabase, type Employe, type Contrat, supabaseError } from "@/lib/supabase"
import { useContrats } from "@/hooks/useEmployes"

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = "infos" | "contrats" | "temps" | "conges" | "documents" | "permissions"

const TABS: { key: Tab; label: string }[] = [
  { key: "infos", label: "Infos" },
  { key: "contrats", label: "Contrats" },
  { key: "temps", label: "Temps" },
  { key: "conges", label: "Congés" },
  { key: "documents", label: "Documents" },
  { key: "permissions", label: "Permissions" },
]

const CONTRAT_LABELS: Record<string, { label: string; color: string }> = {
  CDI: { label: "CDI", color: "#4a6741" },
  CDD: { label: "CDD", color: "#D4775A" },
  extra: { label: "Extra", color: "#A0845C" },
  TNS: { label: "TNS", color: "#9B8EC4" },
  interim: { label: "Intérim", color: "#95A5A6" },
  apprenti: { label: "Apprenti", color: "#F4D03F" },
  stagiaire: { label: "Stagiaire", color: "#B8D4E8" },
}

const CIVILITE_OPTIONS = [
  { value: "", label: "—" },
  { value: "M", label: "M." },
  { value: "Mme", label: "Mme" },
]

const SITUATION_FAM = [
  { value: "", label: "—" },
  { value: "celibataire", label: "Célibataire" },
  { value: "marie", label: "Marié(e)" },
  { value: "pacse", label: "Pacsé(e)" },
  { value: "divorce", label: "Divorcé(e)" },
  { value: "veuf", label: "Veuf/Veuve" },
]

// ── Page ──────────────────────────────────────────────────────────────────────

export default function EmployeDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { canWrite } = useProfile()

  const [employe, setEmploye] = useState<Employe | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>("infos")

  const fetchEmploye = useCallback(async () => {
    if (!id) return
    setLoading(true)
    const { data, error: err } = await supabase
      .from("employes").select("*").eq("id", id).single()
    setLoading(false)
    if (err) { setError(supabaseError(err)); return }
    setEmploye(data as Employe)
  }, [id])

  useEffect(() => { fetchEmploye() }, [fetchEmploye])

  if (loading) {
    return (
      <>
        <NavBar backHref="/rh/equipe" backLabel="Équipe" />
        <main style={{ maxWidth: 800, margin: "0 auto", padding: "40px 16px", textAlign: "center", color: "#999", fontSize: 13 }}>
          Chargement...
        </main>
      </>
    )
  }

  if (error || !employe) {
    return (
      <>
        <NavBar backHref="/rh/equipe" backLabel="Équipe" />
        <main style={{ maxWidth: 800, margin: "0 auto", padding: "40px 16px", textAlign: "center" }}>
          <div className="errorBox">{error ?? "Collaborateur introuvable"}</div>
          <button type="button" className="btn" onClick={() => router.push("/rh/equipe")} style={{ marginTop: 16 }}>
            ← Retour à l&apos;équipe
          </button>
        </main>
      </>
    )
  }

  const contratInfo = CONTRAT_LABELS[employe.contrat_type ?? ""] ?? { label: employe.contrat_type ?? "—", color: "#999" }
  const isTNS = employe.contrat_type === "TNS"

  return (
    <>
      <NavBar backHref="/rh/equipe" backLabel="Équipe" />
      <main style={{ maxWidth: 800, margin: "0 auto", padding: "0 16px 60px" }}>
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div style={{ padding: "24px 0 20px", display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{
            width: 56, height: 56, borderRadius: "50%", flexShrink: 0,
            background: isTNS
              ? "linear-gradient(135deg, #9B8EC4, #7B6FA4)"
              : "linear-gradient(135deg, #D4775A, #C4674A)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 20, fontWeight: 700, color: "#fff",
            fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
          }}>
            {employe.initiales ?? (employe.prenom[0] + employe.nom[0]).toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <h1 style={{
              margin: 0, fontSize: 22, fontWeight: 700, color: "#1a1a1a",
              fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
              letterSpacing: 1, textTransform: "uppercase",
            }}>
              {employe.prenom} {employe.nom}
            </h1>
            <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{
                fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 6,
                background: `${contratInfo.color}14`, color: contratInfo.color,
                border: `1px solid ${contratInfo.color}30`,
              }}>
                {contratInfo.label}
              </span>
              {employe.poste_rh && (
                <span style={{ fontSize: 12, color: "#666" }}>{employe.poste_rh}</span>
              )}
              {employe.matricule && (
                <span style={{ fontSize: 11, color: "#b0a894" }}>#{employe.matricule}</span>
              )}
            </div>
          </div>
          {!employe.actif && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 6,
              background: "rgba(139,26,26,0.08)", color: "#8B1A1A",
              border: "1px solid rgba(139,26,26,0.2)",
            }}>
              ARCHIVÉ
            </span>
          )}
        </div>

        {/* ── Tabs ───────────────────────────────────────────────────── */}
        <div style={{
          display: "flex", gap: 0, borderBottom: "2px solid #ece6db",
          marginBottom: 24, overflowX: "auto",
        }}>
          {TABS.map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              style={{
                padding: "10px 16px", fontSize: 11, fontWeight: 700,
                color: tab === t.key ? "#D4775A" : "#999",
                background: "transparent", border: "none", cursor: "pointer",
                borderBottom: tab === t.key ? "2px solid #D4775A" : "2px solid transparent",
                marginBottom: -2,
                fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
                letterSpacing: 1, textTransform: "uppercase", whiteSpace: "nowrap",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Tab Content ────────────────────────────────────────────── */}
        {tab === "infos" && <TabInfos employe={employe} canWrite={canWrite} onUpdate={fetchEmploye} />}
        {tab === "contrats" && <TabContrats employeId={employe.id} canWrite={canWrite} contratType={employe.contrat_type} />}
        {tab === "temps" && <TabPlaceholder title="Temps de travail" description="Historique des heures planifiées et réalisées." />}
        {tab === "conges" && <TabPlaceholder title="Congés & absences" description="Solde CP, historique des absences et demandes." />}
        {tab === "documents" && <TabPlaceholder title="Documents" description="Contrats signés, fiches de paie, attestations." />}
        {tab === "permissions" && <TabPermissions employe={employe} canWrite={canWrite} onUpdate={fetchEmploye} />}
      </main>
    </>
  )
}

// ── Tab: Infos ────────────────────────────────────────────────────────────────

function TabInfos({ employe, canWrite, onUpdate }: { employe: Employe; canWrite: boolean; onUpdate: () => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Partial<Employe>>({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const merged = useMemo(() => ({ ...employe, ...draft }), [employe, draft])

  const set = (field: keyof Employe) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setDraft(prev => ({ ...prev, [field]: e.target.value || null }))
  }
  const setNum = (field: keyof Employe) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setDraft(prev => ({ ...prev, [field]: e.target.value ? Number(e.target.value) : null }))
  }
  const setBool = (field: keyof Employe) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setDraft(prev => ({ ...prev, [field]: e.target.checked }))
  }

  async function handleSave() {
    if (!Object.keys(draft).length) { setEditing(false); return }
    setSaving(true); setSaveError(null)
    const { error } = await supabase.from("employes").update(draft).eq("id", employe.id)
    setSaving(false)
    if (error) { setSaveError(supabaseError(error)); return }
    setEditing(false); setDraft({}); onUpdate()
  }

  function handleCancel() {
    setEditing(false); setDraft({}); setSaveError(null)
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {/* Edit toggle */}
      {canWrite && (
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          {editing ? (
            <>
              <button type="button" className="btn" onClick={handleCancel}>Annuler</button>
              <button type="button" className="btn btnPrimary" onClick={handleSave} disabled={saving}>
                {saving ? "Enregistrement..." : "Enregistrer"}
              </button>
            </>
          ) : (
            <button type="button" className="btn" onClick={() => setEditing(true)}>Modifier</button>
          )}
        </div>
      )}

      {saveError && <div className="errorBox">{saveError}</div>}

      {/* Section: État civil */}
      <Section title="État civil">
        <FieldGrid>
          <InfoField label="Civilité" editing={editing}>
            {editing ? (
              <select className="input" value={merged.civilite ?? ""} onChange={set("civilite")}>
                {CIVILITE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : (
              merged.civilite === "M" ? "M." : merged.civilite === "Mme" ? "Mme" : "—"
            )}
          </InfoField>
          <InfoField label="Prénom" editing={editing}>
            {editing ? <input className="input" value={merged.prenom} onChange={set("prenom")} /> : merged.prenom}
          </InfoField>
          <InfoField label="Nom de naissance" editing={editing}>
            {editing ? <input className="input" value={merged.nom} onChange={set("nom")} /> : merged.nom}
          </InfoField>
          <InfoField label="Nom d'usage" editing={editing}>
            {editing ? <input className="input" value={merged.nom_usage ?? ""} onChange={set("nom_usage")} /> : merged.nom_usage ?? "—"}
          </InfoField>
          <InfoField label="Date de naissance" editing={editing}>
            {editing ? (
              <input className="input" type="date" value={merged.date_naissance ?? ""} onChange={set("date_naissance")} />
            ) : (
              merged.date_naissance ? new Date(merged.date_naissance).toLocaleDateString("fr-FR") : "—"
            )}
          </InfoField>
          <InfoField label="Lieu de naissance" editing={editing}>
            {editing ? <input className="input" value={merged.lieu_naissance ?? ""} onChange={set("lieu_naissance")} /> : merged.lieu_naissance ?? "—"}
          </InfoField>
          <InfoField label="Département naissance" editing={editing}>
            {editing ? <input className="input" value={merged.departement_naissance ?? ""} onChange={set("departement_naissance")} /> : merged.departement_naissance ?? "—"}
          </InfoField>
          <InfoField label="Nationalité" editing={editing}>
            {editing ? <input className="input" value={merged.nationalite} onChange={set("nationalite")} /> : merged.nationalite}
          </InfoField>
          <InfoField label="N° sécurité sociale" editing={editing}>
            {editing ? <input className="input" value={merged.numero_secu ?? ""} onChange={set("numero_secu")} maxLength={15} /> : merged.numero_secu ?? "—"}
          </InfoField>
          <InfoField label="Situation familiale" editing={editing}>
            {editing ? (
              <select className="input" value={merged.situation_familiale ?? ""} onChange={set("situation_familiale")}>
                {SITUATION_FAM.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : (
              SITUATION_FAM.find(s => s.value === merged.situation_familiale)?.label ?? "—"
            )}
          </InfoField>
          <InfoField label="Personnes à charge" editing={editing}>
            {editing ? (
              <input className="input" type="number" min={0} value={merged.nb_personnes_charge} onChange={setNum("nb_personnes_charge")} />
            ) : (
              merged.nb_personnes_charge
            )}
          </InfoField>
          <InfoField label="Genre" editing={editing}>
            {editing ? <input className="input" value={merged.genre ?? ""} onChange={set("genre")} /> : merged.genre ?? "—"}
          </InfoField>
        </FieldGrid>
      </Section>

      {/* Section: Coordonnées */}
      <Section title="Coordonnées">
        <FieldGrid>
          <InfoField label="Email" editing={editing}>
            {editing ? <input className="input" type="email" value={merged.email ?? ""} onChange={set("email")} /> : merged.email ?? "—"}
          </InfoField>
          <InfoField label="Tél. mobile" editing={editing}>
            {editing ? <input className="input" type="tel" value={merged.tel_mobile ?? ""} onChange={set("tel_mobile")} /> : merged.tel_mobile ?? "—"}
          </InfoField>
          <InfoField label="Tél. fixe" editing={editing}>
            {editing ? <input className="input" type="tel" value={merged.tel_fixe ?? ""} onChange={set("tel_fixe")} /> : merged.tel_fixe ?? "—"}
          </InfoField>
          <InfoField label="Adresse" editing={editing} wide>
            {editing ? <input className="input" value={merged.adresse ?? ""} onChange={set("adresse")} /> : merged.adresse ?? "—"}
          </InfoField>
          <InfoField label="Code postal" editing={editing}>
            {editing ? <input className="input" value={merged.code_postal ?? ""} onChange={set("code_postal")} maxLength={5} /> : merged.code_postal ?? "—"}
          </InfoField>
          <InfoField label="Ville" editing={editing}>
            {editing ? <input className="input" value={merged.ville ?? ""} onChange={set("ville")} /> : merged.ville ?? "—"}
          </InfoField>
        </FieldGrid>
      </Section>

      {/* Section: Contact d'urgence */}
      <Section title="Contact d'urgence">
        <FieldGrid>
          <InfoField label="Prénom" editing={editing}>
            {editing ? <input className="input" value={merged.contact_urgence_prenom ?? ""} onChange={set("contact_urgence_prenom")} /> : merged.contact_urgence_prenom ?? "—"}
          </InfoField>
          <InfoField label="Nom" editing={editing}>
            {editing ? <input className="input" value={merged.contact_urgence_nom ?? ""} onChange={set("contact_urgence_nom")} /> : merged.contact_urgence_nom ?? "—"}
          </InfoField>
          <InfoField label="Lien" editing={editing}>
            {editing ? <input className="input" value={merged.contact_urgence_lien ?? ""} onChange={set("contact_urgence_lien")} placeholder="Conjoint, Parent..." /> : merged.contact_urgence_lien ?? "—"}
          </InfoField>
          <InfoField label="Téléphone" editing={editing}>
            {editing ? <input className="input" type="tel" value={merged.contact_urgence_tel ?? ""} onChange={set("contact_urgence_tel")} /> : merged.contact_urgence_tel ?? "—"}
          </InfoField>
        </FieldGrid>
      </Section>

      {/* Section: Santé / Médical */}
      <Section title="Santé">
        <FieldGrid>
          <InfoField label="Handicap" editing={editing}>
            {editing ? (
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                <input type="checkbox" checked={merged.handicap} onChange={setBool("handicap")} /> Oui
              </label>
            ) : (
              merged.handicap ? "Oui" : "Non"
            )}
          </InfoField>
          {merged.handicap && (
            <InfoField label="Type de handicap" editing={editing}>
              {editing ? <input className="input" value={merged.type_handicap ?? ""} onChange={set("type_handicap")} /> : merged.type_handicap ?? "—"}
            </InfoField>
          )}
          <InfoField label="Dernière visite médicale" editing={editing}>
            {editing ? (
              <input className="input" type="date" value={merged.date_visite_medicale ?? ""} onChange={set("date_visite_medicale")} />
            ) : (
              merged.date_visite_medicale ? new Date(merged.date_visite_medicale).toLocaleDateString("fr-FR") : "—"
            )}
          </InfoField>
          <InfoField label="Prochaine visite" editing={editing}>
            {editing ? (
              <input className="input" type="date" value={merged.prochaine_visite_medicale ?? ""} onChange={set("prochaine_visite_medicale")} />
            ) : (
              merged.prochaine_visite_medicale ? new Date(merged.prochaine_visite_medicale).toLocaleDateString("fr-FR") : "—"
            )}
          </InfoField>
          <InfoField label="Surveillance renforcée" editing={editing}>
            {editing ? (
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                <input type="checkbox" checked={merged.visite_renforcee} onChange={setBool("visite_renforcee")} /> Oui
              </label>
            ) : (
              merged.visite_renforcee ? "Oui" : "Non"
            )}
          </InfoField>
          <InfoField label="Travailleur étranger" editing={editing}>
            {editing ? (
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                <input type="checkbox" checked={merged.travailleur_etranger} onChange={setBool("travailleur_etranger")} /> Oui
              </label>
            ) : (
              merged.travailleur_etranger ? "Oui" : "Non"
            )}
          </InfoField>
        </FieldGrid>
      </Section>

      {/* Section: Coordonnées bancaires */}
      <Section title="Coordonnées bancaires">
        <FieldGrid>
          <InfoField label="IBAN" editing={editing} wide>
            {editing ? <input className="input" value={merged.iban ?? ""} onChange={set("iban")} /> : merged.iban ?? "—"}
          </InfoField>
          <InfoField label="BIC" editing={editing}>
            {editing ? <input className="input" value={merged.bic ?? ""} onChange={set("bic")} /> : merged.bic ?? "—"}
          </InfoField>
          <InfoField label="Titulaire du compte" editing={editing}>
            {editing ? <input className="input" value={merged.titulaire_compte ?? ""} onChange={set("titulaire_compte")} /> : merged.titulaire_compte ?? "—"}
          </InfoField>
        </FieldGrid>
      </Section>

      {/* Section: Emploi */}
      <Section title="Emploi">
        <FieldGrid>
          <InfoField label="Matricule" editing={editing}>
            {editing ? <input className="input" value={merged.matricule ?? ""} onChange={set("matricule")} /> : merged.matricule ?? "—"}
          </InfoField>
          <InfoField label="Poste RH" editing={editing}>
            {editing ? <input className="input" value={merged.poste_rh ?? ""} onChange={set("poste_rh")} /> : merged.poste_rh ?? "—"}
          </InfoField>
          <InfoField label="Date ancienneté" editing={editing}>
            {editing ? (
              <input className="input" type="date" value={merged.date_anciennete ?? ""} onChange={set("date_anciennete")} />
            ) : (
              merged.date_anciennete ? new Date(merged.date_anciennete).toLocaleDateString("fr-FR") : "—"
            )}
          </InfoField>
          <InfoField label="Heures / semaine" editing={editing}>
            {editing ? (
              <input className="input" type="number" min={0} max={48} value={merged.heures_semaine ?? ""} onChange={setNum("heures_semaine")} />
            ) : (
              merged.heures_semaine ? `${merged.heures_semaine}h` : "—"
            )}
          </InfoField>
        </FieldGrid>
      </Section>
    </div>
  )
}

// ── Tab: Contrats ─────────────────────────────────────────────────────────────

function TabContrats({ employeId, canWrite, contratType }: { employeId: string; canWrite: boolean; contratType: string | null }) {
  const { contrats, loading, error, create, clore } = useContrats(employeId)
  const [showNew, setShowNew] = useState(false)
  const [closingId, setClosingId] = useState<string | null>(null)
  const [closeDate, setCloseDate] = useState(new Date().toISOString().slice(0, 10))

  if (contratType === "TNS") {
    return (
      <div style={{ padding: 20, textAlign: "center" }}>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 6,
          background: "rgba(155,142,196,0.12)", color: "#9B8EC4",
          border: "1px solid rgba(155,142,196,0.3)",
        }}>
          TNS
        </span>
        <p style={{ fontSize: 13, color: "#666", marginTop: 12 }}>
          Les travailleurs non-salariés ne sont pas soumis à un contrat de travail.
        </p>
      </div>
    )
  }

  if (loading) return <div style={{ padding: 20, textAlign: "center", color: "#999", fontSize: 13 }}>Chargement...</div>
  if (error) return <div className="errorBox">{error}</div>

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {contrats.length === 0 && (
        <div style={{ padding: 20, textAlign: "center", color: "#999", fontSize: 13 }}>
          Aucun contrat enregistré.
        </div>
      )}

      {contrats.map(c => {
        const info = CONTRAT_LABELS[c.type] ?? { label: c.type, color: "#999" }
        return (
          <div key={c.id} className="card" style={{ padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 6,
                  background: `${info.color}14`, color: info.color,
                  border: `1px solid ${info.color}30`,
                }}>
                  {info.label}
                </span>
                {c.actif ? (
                  <span style={{ fontSize: 9, fontWeight: 700, color: "#4a6741", padding: "2px 7px", borderRadius: 6, background: "rgba(74,103,65,0.08)", border: "1px solid rgba(74,103,65,0.2)" }}>
                    ACTIF
                  </span>
                ) : (
                  <span style={{ fontSize: 9, fontWeight: 700, color: "#999", padding: "2px 7px", borderRadius: 6, background: "#f5f5f5", border: "1px solid #e0e0e0" }}>
                    TERMINÉ
                  </span>
                )}
              </div>
              {c.actif && canWrite && (
                closingId === c.id ? (
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input
                      className="input"
                      type="date"
                      value={closeDate}
                      onChange={e => setCloseDate(e.target.value)}
                      style={{ fontSize: 11, padding: "4px 8px" }}
                    />
                    <button type="button" className="btn btnPrimary" style={{ fontSize: 10, padding: "4px 10px" }}
                      onClick={async () => { await clore(c.id, closeDate); setClosingId(null) }}>
                      Confirmer
                    </button>
                    <button type="button" className="btn" style={{ fontSize: 10, padding: "4px 10px" }}
                      onClick={() => setClosingId(null)}>
                      ✕
                    </button>
                  </div>
                ) : (
                  <button type="button" className="btn" style={{ fontSize: 10, padding: "4px 10px" }}
                    onClick={() => setClosingId(c.id)}>
                    Clore le contrat
                  </button>
                )
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, fontSize: 12 }}>
              <div>
                <span style={metaLabel}>Début</span>
                <div>{new Date(c.date_debut).toLocaleDateString("fr-FR")}</div>
              </div>
              <div>
                <span style={metaLabel}>Fin</span>
                <div>{c.date_fin ? new Date(c.date_fin).toLocaleDateString("fr-FR") : "—"}</div>
              </div>
              <div>
                <span style={metaLabel}>Rémunération</span>
                <div style={{ fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif", fontWeight: 700 }}>
                  {c.remuneration.toLocaleString("fr-FR")} €
                </div>
              </div>
              <div>
                <span style={metaLabel}>Emploi</span>
                <div>{c.emploi ?? "—"}</div>
              </div>
              <div>
                <span style={metaLabel}>Heures/sem</span>
                <div>{c.heures_semaine}h</div>
              </div>
              <div>
                <span style={metaLabel}>Qualification</span>
                <div>{c.qualification ?? "—"}</div>
              </div>
            </div>
          </div>
        )
      })}

      {/* New contract form */}
      {canWrite && (
        showNew ? (
          <NewContratForm
            employeId={employeId}
            onCreate={async (data) => { await create(data); setShowNew(false) }}
            onCancel={() => setShowNew(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setShowNew(true)}
            style={{
              padding: "12px 16px", borderRadius: 12, border: "2px dashed #ddd6c8",
              background: "transparent", fontSize: 13, fontWeight: 700,
              color: "#D4775A", cursor: "pointer", letterSpacing: 0.5,
            }}
          >
            + Ajouter un contrat
          </button>
        )
      )}
    </div>
  )
}

// ── New Contrat Form ──────────────────────────────────────────────────────────

function NewContratForm({ employeId, onCreate, onCancel }: {
  employeId: string
  onCreate: (data: Omit<Contrat, "id" | "created_at">) => Promise<void>
  onCancel: () => void
}) {
  const [form, setForm] = useState({
    type: "CDI" as Contrat["type"],
    date_debut: new Date().toISOString().slice(0, 10),
    date_fin: "",
    remuneration: "",
    emploi: "",
    qualification: "",
    heures_semaine: "39",
    jours_semaine: "5",
  })
  const [saving, setSaving] = useState(false)

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm(prev => ({ ...prev, [field]: e.target.value }))
  }

  async function handleSubmit() {
    setSaving(true)
    await onCreate({
      employe_id: employeId,
      type: form.type,
      date_debut: form.date_debut,
      date_fin: form.date_fin || null,
      remuneration: form.remuneration ? parseFloat(form.remuneration) : 0,
      emploi: form.emploi || null,
      qualification: form.qualification || null,
      heures_semaine: parseFloat(form.heures_semaine) || 35,
      jours_semaine: parseInt(form.jours_semaine) || 5,
      actif: true,
    })
    setSaving(false)
  }

  return (
    <div className="card" style={{ padding: 16 }}>
      <h4 style={{
        margin: "0 0 12px", fontSize: 12, fontWeight: 700, color: "#1a1a1a",
        fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
        letterSpacing: 1, textTransform: "uppercase",
      }}>
        Nouveau contrat
      </h4>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <label style={{ display: "block" }}>
          <span style={metaLabel}>Type</span>
          <select className="input" value={form.type} onChange={set("type")}>
            <option value="CDI">CDI</option>
            <option value="CDD">CDD</option>
            <option value="extra">Extra</option>
            <option value="interim">Intérim</option>
            <option value="apprenti">Apprenti</option>
            <option value="stagiaire">Stagiaire</option>
          </select>
        </label>
        <label style={{ display: "block" }}>
          <span style={metaLabel}>Date début</span>
          <input className="input" type="date" value={form.date_debut} onChange={set("date_debut")} />
        </label>
        {(form.type === "CDD" || form.type === "extra" || form.type === "interim" || form.type === "stagiaire") && (
          <label style={{ display: "block" }}>
            <span style={metaLabel}>Date fin</span>
            <input className="input" type="date" value={form.date_fin} onChange={set("date_fin")} />
          </label>
        )}
        <label style={{ display: "block" }}>
          <span style={metaLabel}>Emploi</span>
          <input className="input" value={form.emploi} onChange={set("emploi")} placeholder="Cuisinier..." />
        </label>
        <label style={{ display: "block" }}>
          <span style={metaLabel}>Heures / sem</span>
          <input className="input" type="number" value={form.heures_semaine} onChange={set("heures_semaine")} min={0} max={48} />
        </label>
        <label style={{ display: "block" }}>
          <span style={metaLabel}>Jours / sem</span>
          <input className="input" type="number" value={form.jours_semaine} onChange={set("jours_semaine")} min={1} max={6} />
        </label>
        <label style={{ display: "block" }}>
          <span style={metaLabel}>Salaire brut (€/mois)</span>
          <input className="input" type="number" value={form.remuneration} onChange={set("remuneration")} min={0} step={10} />
        </label>
        <label style={{ display: "block" }}>
          <span style={metaLabel}>Qualification</span>
          <select className="input" value={form.qualification} onChange={set("qualification")}>
            <option value="">—</option>
            <option value="Employé niveau I">Employé niveau I</option>
            <option value="Employé niveau II">Employé niveau II</option>
            <option value="Employé niveau III">Employé niveau III</option>
            <option value="Agent de maîtrise niveau IV">Agent de maîtrise IV</option>
            <option value="Agent de maîtrise niveau V">Agent de maîtrise V</option>
            <option value="Cadre niveau VI">Cadre niveau VI</option>
          </select>
        </label>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
        <button type="button" className="btn" onClick={onCancel}>Annuler</button>
        <button type="button" className="btn btnPrimary" onClick={handleSubmit} disabled={saving || !form.date_debut}>
          {saving ? "Création..." : "Créer le contrat"}
        </button>
      </div>
    </div>
  )
}

// ── Tab: Permissions ──────────────────────────────────────────────────────────

function TabPermissions({ employe, canWrite, onUpdate }: { employe: Employe; canWrite: boolean; onUpdate: () => void }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function updateRole(role: Employe["role"]) {
    setSaving(true); setError(null)
    const { error: err } = await supabase.from("employes").update({ role }).eq("id", employe.id)
    setSaving(false)
    if (err) { setError(supabaseError(err)); return }
    onUpdate()
  }

  async function toggleEquipe(equipe: string) {
    const current = employe.equipe_access ?? []
    const next = current.includes(equipe) ? current.filter(e => e !== equipe) : [...current, equipe]
    if (next.length === 0) return
    setSaving(true); setError(null)
    const { error: err } = await supabase.from("employes").update({ equipe_access: next }).eq("id", employe.id)
    setSaving(false)
    if (err) { setError(supabaseError(err)); return }
    onUpdate()
  }

  const roles: { value: Employe["role"]; label: string; desc: string }[] = [
    { value: "employe", label: "Employé", desc: "Accès lecture à ses propres shifts" },
    { value: "manager", label: "Manager", desc: "Gestion planning de son équipe" },
    { value: "proprietaire", label: "Propriétaire", desc: "Accès complet à l'établissement" },
  ]

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {error && <div className="errorBox">{error}</div>}

      <Section title="Rôle">
        <div style={{ display: "grid", gap: 8 }}>
          {roles.map(r => (
            <div
              key={r.value}
              onClick={() => canWrite && !saving && updateRole(r.value)}
              style={{
                padding: "12px 16px", borderRadius: 12, cursor: canWrite ? "pointer" : "default",
                background: employe.role === r.value ? "rgba(212,119,90,0.06)" : "#fff",
                border: employe.role === r.value ? "2px solid #D4775A" : "1px solid #ece6db",
                transition: "all 0.15s",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: employe.role === r.value ? "#D4775A" : "#1a1a1a" }}>
                {r.label}
              </div>
              <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>{r.desc}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Équipes">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {["Cuisine", "Salle", "Shop"].map(eq => {
            const active = employe.equipe_access?.includes(eq)
            return (
              <button
                key={eq}
                type="button"
                onClick={() => canWrite && !saving && toggleEquipe(eq)}
                disabled={!canWrite || saving}
                style={{
                  padding: "8px 20px", borderRadius: 20,
                  border: active ? "2px solid #D4775A" : "1px solid #ddd6c8",
                  background: active ? "rgba(212,119,90,0.08)" : "#fff",
                  fontSize: 12, fontWeight: 700, cursor: canWrite ? "pointer" : "default",
                  color: active ? "#D4775A" : "#666",
                  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
                  letterSpacing: 1, textTransform: "uppercase",
                }}
              >
                {eq}
              </button>
            )
          })}
        </div>
        <p style={{ fontSize: 11, color: "#b0a894", marginTop: 8 }}>
          Un collaborateur peut appartenir à plusieurs équipes.
        </p>
      </Section>

      {/* Archive */}
      {canWrite && (
        <Section title="Zone dangereuse">
          <ArchiveButton employe={employe} onUpdate={onUpdate} />
        </Section>
      )}
    </div>
  )
}

function ArchiveButton({ employe, onUpdate }: { employe: Employe; onUpdate: () => void }) {
  const router = useRouter()
  const [confirm, setConfirm] = useState(false)
  const [saving, setSaving] = useState(false)

  async function handleArchive() {
    setSaving(true)
    await supabase.from("employes").update({ actif: false }).eq("id", employe.id)
    setSaving(false)
    onUpdate()
    router.push("/rh/equipe")
  }

  if (confirm) {
    return (
      <div style={{
        padding: 16, borderRadius: 12, background: "rgba(139,26,26,0.04)",
        border: "1px solid rgba(139,26,26,0.15)",
      }}>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "#8B1A1A" }}>
          Archiver {employe.prenom} {employe.nom} ? Cette action masquera le collaborateur de la liste active.
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn" onClick={() => setConfirm(false)}>Annuler</button>
          <button
            type="button"
            className="btn"
            onClick={handleArchive}
            disabled={saving}
            style={{ background: "#8B1A1A", color: "#fff", border: "none" }}
          >
            {saving ? "Archivage..." : "Confirmer l'archivage"}
          </button>
        </div>
      </div>
    )
  }

  return (
    <button
      type="button"
      className="btn"
      onClick={() => setConfirm(true)}
      style={{ color: "#8B1A1A", borderColor: "rgba(139,26,26,0.3)" }}
    >
      Archiver ce collaborateur
    </button>
  )
}

// ── Tab: Placeholder ──────────────────────────────────────────────────────────

function TabPlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <div style={{
      padding: "48px 20px", textAlign: "center", background: "#fff",
      borderRadius: 12, border: "1px solid #ece6db",
    }}>
      <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.3 }}>🚧</div>
      <h3 style={{
        margin: "0 0 6px", fontSize: 16, fontWeight: 700, color: "#1a1a1a",
        fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
        letterSpacing: 1, textTransform: "uppercase",
      }}>
        {title}
      </h3>
      <p style={{ margin: 0, fontSize: 13, color: "#999" }}>{description}</p>
    </div>
  )
}

// ── Shared Sub-Components ─────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <h3 style={{
        margin: "0 0 14px", fontSize: 12, fontWeight: 700, color: "#1a1a1a",
        fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
        letterSpacing: 1, textTransform: "uppercase",
      }}>
        {title}
      </h3>
      {children}
    </div>
  )
}

function FieldGrid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      {children}
    </div>
  )
}

function InfoField({ label, editing, wide, children }: {
  label: string; editing: boolean; wide?: boolean; children: React.ReactNode
}) {
  return (
    <div style={{ gridColumn: wide ? "1 / -1" : undefined }}>
      <div style={metaLabel}>{label}</div>
      {editing ? (
        children
      ) : (
        <div style={{ fontSize: 13, color: "#1a1a1a", marginTop: 2 }}>{children}</div>
      )}
    </div>
  )
}

const metaLabel: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: "#999", marginBottom: 3,
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
  letterSpacing: 0.5, textTransform: "uppercase",
}
