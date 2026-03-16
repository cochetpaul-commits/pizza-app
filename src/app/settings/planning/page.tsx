"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { NavBar } from "@/components/NavBar"
import { TopNav } from "@/components/TopNav"
import { RequireRole } from "@/components/RequireRole"
import { useEtablissement } from "@/lib/EtablissementContext"
import { useSettings, type Settings } from "@/hooks/useSettings"
import { supabase, supabaseError, type Poste } from "@/lib/supabase"

// ── Constantes ───────────────────────────────────────────────

const SECTIONS = [
  { id: "social",       label: "Social" },
  { id: "planification", label: "Planification" },
  { id: "conges",       label: "Congés payés" },
  { id: "repas",        label: "Repas" },
  { id: "analyse",      label: "Analyse" },
  { id: "etiquettes",   label: "Étiquettes" },
] as const

type SectionId = typeof SECTIONS[number]["id"]

const EMOJIS = ["🔥","🍕","🥗","🍝","🍰","🥩","🐟","🍷","🪑","🧑‍🍳","🍸","🧊","☕","🫒","🧀","🍞","🧁","🥖"]

const COULEURS = [
  "#D4775A","#E8A87C","#C38D9E","#41B3A3","#4A6741","#6C5B7B",
  "#F67280","#355C7D","#2A363B","#F8B500","#FF6F61","#88B04B",
]

// ── Helpers style ────────────────────────────────────────────

const sectionTitle: React.CSSProperties = {
  fontFamily: "var(--font-oswald)",
  fontWeight: 700,
  fontSize: 15,
  letterSpacing: 1.5,
  textTransform: "uppercase",
  margin: "0 0 16px",
}

const fieldLabel: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "#1a1410",
  marginBottom: 6,
  display: "block",
}

const hint: React.CSSProperties = {
  fontSize: 12,
  color: "#999",
  marginTop: 4,
}

const badgeStyle = (ok: boolean): React.CSSProperties => ({
  display: "inline-block",
  fontSize: 11,
  fontWeight: 700,
  padding: "3px 10px",
  borderRadius: 8,
  background: ok ? "rgba(74,103,65,0.10)" : "rgba(139,26,26,0.08)",
  color: ok ? "#4a6741" : "#8B1A1A",
  border: `1px solid ${ok ? "rgba(74,103,65,0.25)" : "rgba(139,26,26,0.20)"}`,
})

// ── Composants inline ────────────────────────────────────────

function Slider({ label, value, onChange, min, max, step = 1, suffix, hintText }: {
  label: string; value: number; onChange: (v: number) => void
  min: number; max: number; step?: number; suffix?: string; hintText?: string
}) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={fieldLabel}>
        {label}
        <span style={{ float: "right", fontWeight: 700, color: "#D4775A", fontFamily: "var(--font-cormorant)", fontSize: 16 }}>
          {value}{suffix}
        </span>
      </label>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: "#D4775A" }}
      />
      {hintText && <div style={hint}>{hintText}</div>}
    </div>
  )
}

function Toggle({ label, checked, onChange, hintText }: {
  label: string; checked: boolean; onChange: (v: boolean) => void; hintText?: string
}) {
  return (
    <div style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        style={{
          width: 42, height: 24, borderRadius: 12, border: "none", cursor: "pointer", flexShrink: 0,
          background: checked ? "#D4775A" : "#ddd6c8", position: "relative", transition: "background .2s",
        }}
      >
        <span style={{
          position: "absolute", top: 2, left: checked ? 20 : 2,
          width: 20, height: 20, borderRadius: 10, background: "#fff",
          transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
        }} />
      </button>
      <div>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
        {hintText && <div style={hint}>{hintText}</div>}
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────

export default function SettingsPlanningPage() {
  const { current } = useEtablissement()
  const etablissementId = current?.id ?? null
  const { values, update, save, saving, isDirty, loading, error } = useSettings(etablissementId)

  const [activeSection, setActiveSection] = useState<SectionId>("social")
  const [postes, setPostes]     = useState<Poste[]>([])
  const [postesLoading, setPostesLoading] = useState(true)

  // ── Postes ──
  const fetchPostes = useCallback(async () => {
    if (!etablissementId) return
    setPostesLoading(true)
    const { data } = await supabase.from("postes").select("*")
      .eq("etablissement_id", etablissementId).order("equipe").order("nom")
    setPostes((data || []) as Poste[])
    setPostesLoading(false)
  }, [etablissementId])

  useEffect(() => { fetchPostes() }, [fetchPostes])

  // ── Scroll sync ──
  const scrollRef = useRef<HTMLDivElement>(null)
  const scrollTo = (id: SectionId) => {
    setActiveSection(id)
    document.getElementById(`section-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  // ── Simulation coût shift ──
  const simulCout = (heures: number) => {
    const brut = heures * values.taux_horaire_moyen
    const charges = brut * (values.charges_patronales / 100)
    const at = brut * (values.taux_accident_travail / 100)
    const cp = values.cp_dans_taux ? brut * 0.10 : 0
    return Math.round(brut + charges + at + cp)
  }

  if (loading) {
    return (
      <>
        <NavBar backHref="/" backLabel="Accueil" />
        <main className="container">
          <TopNav title="Paramètres planning" subtitle="Chargement…" />
        </main>
      </>
    )
  }

  return (
    <RequireRole allowedRoles={["admin", "direction"]}>
      <NavBar
        backHref="/"
        backLabel="Accueil"
        primaryAction={
          isDirty ? (
            <button className="btn btnPrimary" onClick={save} disabled={saving}>
              {saving ? "Sauvegarde…" : "Sauvegarder"}
            </button>
          ) : null
        }
      />
      <main className="container" style={{ maxWidth: 1100, paddingTop: 16 }}>
        <TopNav title="Paramètres planning" subtitle={current?.nom ?? "Aucun établissement"} />

        {error && (
          <div className="errorBox" style={{ marginTop: 12, fontSize: 13 }}>{error}</div>
        )}

        {isDirty && !saving && (
          <div style={{
            marginTop: 10, padding: "8px 14px", borderRadius: 10, fontSize: 12, fontWeight: 600,
            background: "rgba(212,119,90,0.08)", color: "#D4775A", border: "1px solid rgba(212,119,90,0.20)",
          }}>
            Modifications non sauvegardées
          </div>
        )}

        <div style={{ display: "flex", gap: 28, marginTop: 20 }}>
          {/* ── Sidebar ── */}
          <nav style={{
            width: 180, flexShrink: 0, position: "sticky", top: 80, alignSelf: "flex-start",
          }}>
            {SECTIONS.map(s => (
              <button
                key={s.id}
                onClick={() => scrollTo(s.id)}
                style={{
                  display: "block", width: "100%", textAlign: "left", padding: "10px 14px",
                  border: "none", borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 600,
                  marginBottom: 4,
                  background: activeSection === s.id ? "rgba(212,119,90,0.10)" : "transparent",
                  color: activeSection === s.id ? "#D4775A" : "#666",
                  transition: "background .15s",
                }}
              >
                {s.label}
              </button>
            ))}
          </nav>

          {/* ── Content ── */}
          <div ref={scrollRef} style={{ flex: 1, minWidth: 0 }}>

            {/* ─── 1. Social ─── */}
            <section id="section-social" className="card" style={{ marginBottom: 20, padding: 24 }}>
              <h3 style={sectionTitle}>Social</h3>

              <label style={fieldLabel}>Convention collective</label>
              <select
                className="input"
                value={values.convention}
                onChange={e => update({ convention: e.target.value as Settings["convention"] })}
                style={{ marginBottom: 10 }}
              >
                <option value="HCR_1979">HCR — IDCC 1979</option>
                <option value="RAPIDE_1501">Restauration rapide — IDCC 1501</option>
              </select>

              {values.convention === "HCR_1979" && (
                <div style={badgeStyle(true)}>
                  35h seuil légal · Supp 25% (35–43h) · Supp 50% (&gt;43h) · Amplitude max 13h
                </div>
              )}
              {values.convention === "RAPIDE_1501" && (
                <div style={{ marginBottom: 10 }}>
                  <div style={badgeStyle(false)}>
                    Réservé Piccola Mia — ne pas utiliser pour Bello Mio
                  </div>
                  <div style={{ ...badgeStyle(true), marginTop: 6 }}>
                    35h seuil · Supp 10% (35–39h) · Supp 20% (39–43h) · Supp 50% (&gt;43h)
                  </div>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 16 }}>
                <div>
                  <label style={fieldLabel}>Code APE</label>
                  <input
                    className="input" value={values.code_ape ?? ""} placeholder="5610A"
                    onChange={e => update({ code_ape: e.target.value || null })}
                  />
                </div>
                <div>
                  <label style={fieldLabel}>SIRET</label>
                  <input
                    className="input" value={values.siret ?? ""} placeholder="91321738600014"
                    onChange={e => update({ siret: e.target.value || null })}
                  />
                </div>
                <div>
                  <label style={fieldLabel}>Médecin du travail</label>
                  <input
                    className="input" value={values.medecin_travail ?? ""} placeholder="MT090"
                    onChange={e => update({ medecin_travail: e.target.value || null })}
                  />
                </div>
                <div>
                  <label style={fieldLabel}>Adresse</label>
                  <input
                    className="input" value={values.adresse ?? ""} placeholder="Adresse de l'établissement"
                    onChange={e => update({ adresse: e.target.value || null })}
                  />
                </div>
              </div>
            </section>

            {/* ─── 2. Planification ─── */}
            <section id="section-planification" className="card" style={{ marginBottom: 20, padding: 24 }}>
              <h3 style={sectionTitle}>Planification</h3>

              <Slider
                label="Pause par défaut" value={values.pause_defaut_minutes} suffix=" mn"
                min={0} max={120} step={5}
                onChange={v => update({ pause_defaut_minutes: v })}
              />
              <Slider
                label="Pause auto si shift ≥" value={values.duree_min_pause_auto_h} suffix=" h"
                min={1} max={8} step={0.5}
                onChange={v => update({ duree_min_pause_auto_h: v })}
                hintText="Durée min. de shift pour ajouter automatiquement une pause"
              />
              <Slider
                label="Objectif ratio masse salariale" value={values.objectif_ratio_ms} suffix=" %"
                min={20} max={60}
                onChange={v => update({ objectif_ratio_ms: v })}
              />
              <div style={{ marginBottom: 8 }}>
                <span style={badgeStyle(values.objectif_ratio_ms <= 37)}>
                  {values.objectif_ratio_ms <= 37 ? "Objectif sain" : values.objectif_ratio_ms <= 42 ? "Attention" : "Élevé"}
                </span>
              </div>
              <Slider
                label="Objectif productivité" value={values.objectif_productivite} suffix=" €/h"
                min={20} max={100}
                onChange={v => update({ objectif_productivite: v })}
              />
            </section>

            {/* ─── 3. Congés payés ─── */}
            <section id="section-conges" className="card" style={{ marginBottom: 20, padding: 24 }}>
              <h3 style={sectionTitle}>Congés payés</h3>

              <label style={fieldLabel}>Base de calcul</label>
              <select
                className="input" value={values.cp_base}
                onChange={e => update({ cp_base: e.target.value as "ouvrables" | "ouvres" })}
                style={{ marginBottom: 14 }}
              >
                <option value="ouvrables">Jours ouvrables (30 j/an)</option>
                <option value="ouvres">Jours ouvrés (25 j/an)</option>
              </select>

              <label style={fieldLabel}>Acquisition mensuelle</label>
              <input
                className="input" type="number" step="0.1" value={values.cp_acquisition_mensuelle}
                onChange={e => update({ cp_acquisition_mensuelle: Number(e.target.value) })}
                style={{ marginBottom: 14 }}
              />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={fieldLabel}>Début période CP</label>
                  <select className="input" value={values.cp_periode_debut}
                    onChange={e => update({ cp_periode_debut: e.target.value })}>
                    {Array.from({ length: 12 }, (_, i) => {
                      const m = String(i + 1).padStart(2, "0")
                      return <option key={m} value={`${m}-01`}>{new Date(2026, i).toLocaleString("fr-FR", { month: "long" })}</option>
                    })}
                  </select>
                </div>
                <div>
                  <label style={fieldLabel}>Fin période CP</label>
                  <select className="input" value={values.cp_periode_fin}
                    onChange={e => update({ cp_periode_fin: e.target.value })}>
                    {Array.from({ length: 12 }, (_, i) => {
                      const m = String(i + 1).padStart(2, "0")
                      const lastDay = new Date(2026, i + 1, 0).getDate()
                      return <option key={m} value={`${m}-${lastDay}`}>{new Date(2026, i).toLocaleString("fr-FR", { month: "long" })}</option>
                    })}
                  </select>
                </div>
              </div>

              <div className="card" style={{ marginTop: 16, background: "#faf7f2", padding: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#666" }}>Exercice actuel</div>
                <div style={{ fontSize: 14, marginTop: 4 }}>
                  {values.cp_base === "ouvrables" ? "30" : "25"} jours / an
                  ({values.cp_acquisition_mensuelle} j/mois)
                  — Période du {values.cp_periode_debut.replace("-", "/")} au {values.cp_periode_fin.replace("-", "/")}
                </div>
              </div>
            </section>

            {/* ─── 4. Repas ─── */}
            <section id="section-repas" className="card" style={{ marginBottom: 20, padding: 24 }}>
              <h3 style={sectionTitle}>Repas</h3>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
                {(["AN", "IR", "TR", "PP"] as const).map(t => (
                  <button
                    key={t}
                    className="card"
                    onClick={() => update({ repas_type: t })}
                    style={{
                      cursor: "pointer", textAlign: "center", padding: "14px 8px",
                      border: values.repas_type === t ? "2px solid #D4775A" : "1px solid var(--border)",
                      background: values.repas_type === t ? "rgba(212,119,90,0.06)" : "#fff",
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{t}</div>
                    <div style={{ fontSize: 11, color: "#999", marginTop: 4 }}>
                      {{ AN: "Avantage nature", IR: "Indemnité repas", TR: "Titre restaurant", PP: "Panier repas" }[t]}
                    </div>
                  </button>
                ))}
              </div>

              {values.repas_type === "AN" && (
                <div>
                  <label style={fieldLabel}>Valeur AN par repas (€)</label>
                  <input
                    className="input" type="number" step="0.01" value={values.repas_valeur_an}
                    onChange={e => update({ repas_valeur_an: Number(e.target.value) })}
                  />
                </div>
              )}

              <div style={{ ...hint, marginTop: 12, fontStyle: "italic" }}>
                1 repas par shift, sans condition de durée.
              </div>
            </section>

            {/* ─── 5. Analyse ─── */}
            <section id="section-analyse" className="card" style={{ marginBottom: 20, padding: 24 }}>
              <h3 style={sectionTitle}>Analyse</h3>

              <Slider
                label="Charges patronales" value={values.charges_patronales} suffix=" %"
                min={20} max={50}
                onChange={v => update({ charges_patronales: v })}
              />

              <div style={{ marginBottom: 18 }}>
                <label style={fieldLabel}>Taux accident du travail (%)</label>
                <input
                  className="input" type="number" step="0.01" value={values.taux_accident_travail}
                  onChange={e => update({ taux_accident_travail: Number(e.target.value) })}
                />
                <div style={{ ...hint, color: "#D4775A" }}>
                  Taux notifié par la CARSAT — 1.8%–4.5%. Actuellement {values.taux_accident_travail}% (estimation à corriger).
                </div>
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={fieldLabel}>Taux horaire moyen (€/h)</label>
                <input
                  className="input" type="number" step="0.50" value={values.taux_horaire_moyen}
                  onChange={e => update({ taux_horaire_moyen: Number(e.target.value) })}
                />
              </div>

              <Toggle
                label="Inclure CP dans le taux horaire"
                checked={values.cp_dans_taux}
                onChange={v => update({ cp_dans_taux: v })}
                hintText="Ajoute ~10% au coût horaire pour provisionner les congés payés"
              />

              {/* Simulation */}
              <div className="card" style={{ marginTop: 16, background: "#faf7f2", padding: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#666", marginBottom: 8 }}>
                  Simulation coût shift
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, textAlign: "center" }}>
                  {[4, 7, 9].map(h => (
                    <div key={h} style={{ padding: 10, background: "#fff", borderRadius: 10, border: "1px solid var(--border)" }}>
                      <div style={{ fontWeight: 700, color: "#D4775A", fontFamily: "var(--font-cormorant)", fontSize: 22 }}>
                        {simulCout(h)} €
                      </div>
                      <div style={{ fontSize: 11, color: "#999" }}>Shift {h}h</div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* ─── 6. Étiquettes (postes) ─── */}
            <section id="section-etiquettes" className="card" style={{ marginBottom: 20, padding: 24 }}>
              <h3 style={sectionTitle}>Étiquettes</h3>
              <PostesManager
                etablissementId={etablissementId}
                postes={postes}
                loading={postesLoading}
                onRefresh={fetchPostes}
              />
            </section>

          </div>
        </div>
      </main>
    </RequireRole>
  )
}

// ── Postes Manager ───────────────────────────────────────────

function PostesManager({ etablissementId, postes, loading, onRefresh }: {
  etablissementId: string | null; postes: Poste[]; loading: boolean; onRefresh: () => void
}) {
  const [tab, setTab] = useState<"Cuisine" | "Salle">("Cuisine")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ nom: "", emoji: "🔥", couleur: "#D4775A" })
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)

  const filtered = postes.filter(p => p.equipe === tab)

  const handleCreate = async () => {
    if (!etablissementId || !form.nom.trim()) return
    setSaving(true)
    await supabase.from("postes").upsert({
      etablissement_id: etablissementId, equipe: tab,
      nom: form.nom.trim(), emoji: form.emoji, couleur: form.couleur, actif: true,
    }, { onConflict: "etablissement_id,equipe,nom" })
    setSaving(false)
    setCreating(false)
    setForm({ nom: "", emoji: "🔥", couleur: "#D4775A" })
    onRefresh()
  }

  const handleUpdate = async (id: string) => {
    setSaving(true)
    await supabase.from("postes").update({ nom: form.nom, emoji: form.emoji, couleur: form.couleur }).eq("id", id)
    setSaving(false)
    setEditingId(null)
    onRefresh()
  }

  const handleToggleActif = async (p: Poste) => {
    await supabase.from("postes").update({ actif: !p.actif }).eq("id", p.id)
    onRefresh()
  }

  const startEdit = (p: Poste) => {
    setEditingId(p.id)
    setForm({ nom: p.nom, emoji: p.emoji ?? "🔥", couleur: p.couleur })
    setCreating(false)
  }

  return (
    <div>
      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {(["Cuisine", "Salle"] as const).map(eq => (
          <button
            key={eq}
            className="btn"
            onClick={() => { setTab(eq); setEditingId(null); setCreating(false) }}
            style={{
              background: tab === eq ? "#D4775A" : "#fff",
              color: tab === eq ? "#fff" : "#666",
              borderColor: tab === eq ? "#D4775A" : "var(--border)",
            }}
          >
            {eq}
          </button>
        ))}
        <button
          className="btn"
          onClick={() => { setCreating(true); setEditingId(null); setForm({ nom: "", emoji: "🔥", couleur: "#D4775A" }) }}
          style={{ marginLeft: "auto" }}
        >
          + Ajouter
        </button>
      </div>

      {loading ? (
        <div className="muted">Chargement…</div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {filtered.map(p => (
            <div key={p.id}>
              {editingId === p.id ? (
                <PosteForm
                  form={form} setForm={setForm} saving={saving}
                  onSave={() => handleUpdate(p.id)}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <div
                  style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                    border: "1px solid var(--border)", borderRadius: 10, background: "#fff",
                    opacity: p.actif ? 1 : 0.5,
                  }}
                >
                  <span style={{
                    width: 28, height: 28, borderRadius: 8, background: p.couleur,
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
                  }}>
                    {p.emoji}
                  </span>
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{p.nom}</span>
                  <button className="btn" style={{ height: 28, fontSize: 11 }} onClick={() => startEdit(p)}>
                    Modifier
                  </button>
                  <button
                    className="btn"
                    style={{ height: 28, fontSize: 11, color: p.actif ? "#8B1A1A" : "#4a6741" }}
                    onClick={() => handleToggleActif(p)}
                  >
                    {p.actif ? "Désactiver" : "Réactiver"}
                  </button>
                </div>
              )}
            </div>
          ))}

          {creating && (
            <PosteForm
              form={form} setForm={setForm} saving={saving}
              onSave={handleCreate}
              onCancel={() => setCreating(false)}
            />
          )}

          {!filtered.length && !creating && (
            <div className="muted" style={{ textAlign: "center", padding: 20 }}>
              Aucun poste {tab.toLowerCase()} — cliquez sur + Ajouter
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function PosteForm({ form, setForm, saving, onSave, onCancel }: {
  form: { nom: string; emoji: string; couleur: string }
  setForm: (f: { nom: string; emoji: string; couleur: string }) => void
  saving: boolean; onSave: () => void; onCancel: () => void
}) {
  return (
    <div className="card" style={{ padding: 16, border: "2px solid #D4775A" }}>
      <label style={fieldLabel}>Nom</label>
      <input
        className="input" value={form.nom} placeholder="Nom du poste"
        onChange={e => setForm({ ...form, nom: e.target.value })}
        style={{ marginBottom: 12 }}
      />

      <label style={fieldLabel}>Emoji</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {EMOJIS.map(e => (
          <button
            key={e} type="button"
            onClick={() => setForm({ ...form, emoji: e })}
            style={{
              width: 36, height: 36, borderRadius: 8, border: form.emoji === e ? "2px solid #D4775A" : "1px solid var(--border)",
              background: form.emoji === e ? "rgba(212,119,90,0.10)" : "#fff",
              cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            {e}
          </button>
        ))}
      </div>

      <label style={fieldLabel}>Couleur</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12, alignItems: "center" }}>
        {COULEURS.map(c => (
          <button
            key={c} type="button"
            onClick={() => setForm({ ...form, couleur: c })}
            style={{
              width: 32, height: 32, borderRadius: 8, background: c, border: form.couleur === c ? "3px solid #1a1410" : "2px solid transparent",
              cursor: "pointer",
            }}
          />
        ))}
        <input
          type="color" value={form.couleur}
          onChange={e => setForm({ ...form, couleur: e.target.value })}
          style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid var(--border)", cursor: "pointer", padding: 0 }}
        />
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btnPrimary" onClick={onSave} disabled={saving || !form.nom.trim()}>
          {saving ? "…" : "Enregistrer"}
        </button>
        <button className="btn" onClick={onCancel}>Annuler</button>
      </div>
    </div>
  )
}
