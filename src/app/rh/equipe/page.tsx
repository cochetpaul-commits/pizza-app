"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { NavBar } from "@/components/NavBar"
import { TopNav } from "@/components/TopNav"
import { useProfile } from "@/lib/ProfileContext"
import { useEtablissement } from "@/lib/EtablissementContext"
import { useEmployes, type EmployeAvecContrat } from "@/hooks/useEmployes"
import { AddCollaborateurModal } from "@/components/rh/AddCollaborateurModal"

// ── Constants ─────────────────────────────────────────────────────────────────

type FilterEquipe = "Tous" | "Cuisine" | "Salle" | "Shop"
type FilterContrat = "Tous" | "CDI" | "CDD" | "extra" | "TNS" | "interim" | "apprenti" | "stagiaire"

const EQUIPE_COLORS: Record<string, string> = {
  Cuisine: "#E74C3C",
  Salle: "#A9CCE3",
  Shop: "#F4D03F",
}

const CONTRAT_LABELS: Record<string, { label: string; color: string }> = {
  CDI: { label: "CDI", color: "#4a6741" },
  CDD: { label: "CDD", color: "#D4775A" },
  extra: { label: "Extra", color: "#A0845C" },
  TNS: { label: "TNS", color: "#9B8EC4" },
  interim: { label: "Intérim", color: "#95A5A6" },
  apprenti: { label: "Apprenti", color: "#F4D03F" },
  stagiaire: { label: "Stagiaire", color: "#B8D4E8" },
}

const CONTRAT_FILTERS: { value: FilterContrat; label: string }[] = [
  { value: "Tous", label: "Tous" },
  { value: "CDI", label: "CDI" },
  { value: "CDD", label: "CDD" },
  { value: "extra", label: "Extra" },
  { value: "TNS", label: "TNS" },
  { value: "interim", label: "Intérim" },
  { value: "apprenti", label: "Apprenti" },
  { value: "stagiaire", label: "Stagiaire" },
]

// ── Page ──────────────────────────────────────────────────────────────────────

export default function EquipePage() {
  const router = useRouter()
  const { canWrite } = useProfile()
  const { current: etablissement } = useEtablissement()
  const { employes, loading, refetch } = useEmployes(etablissement?.id ?? null)

  const [filterEquipe, setFilterEquipe] = useState<FilterEquipe>("Tous")
  const [filterContrat, setFilterContrat] = useState<FilterContrat>("Tous")
  const [search, setSearch] = useState("")
  const [showAdd, setShowAdd] = useState(false)

  // ── KPI counts ──────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const total = employes.length
    const cuisine = employes.filter(e => e.equipe_access?.includes("Cuisine")).length
    const salle = employes.filter(e => e.equipe_access?.includes("Salle")).length
    const extras = employes.filter(e => e.contrat_type === "extra").length
    return { total, cuisine, salle, extras }
  }, [employes])

  // ── Filtering ───────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return employes.filter(e => {
      if (filterEquipe !== "Tous" && !e.equipe_access?.includes(filterEquipe)) return false
      if (filterContrat !== "Tous" && e.contrat_type !== filterContrat) return false
      if (search) {
        const q = search.toLowerCase()
        const haystack = [e.prenom, e.nom, e.email, e.matricule].filter(Boolean).join(" ").toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [employes, filterEquipe, filterContrat, search])

  return (
    <>
      <NavBar backHref="/" backLabel="Accueil" />
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "0 16px 40px" }}>
        <TopNav
          title="ÉQUIPE"
          subtitle={`${employes.length} collaborateur${employes.length > 1 ? "s" : ""} actif${employes.length > 1 ? "s" : ""}`}
          eyebrow="Ressources humaines"
        />

        {/* ── KPI Cards ──────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
          <KpiCard label="Total actifs" value={kpis.total} color="#1a1a1a" />
          <KpiCard label="Cuisine" value={kpis.cuisine} color="#E74C3C" />
          <KpiCard label="Salle" value={kpis.salle} color="#3498DB" />
          <KpiCard label="Extras" value={kpis.extras} color="#A0845C" />
        </div>

        {/* ── Filters Row ────────────────────────────────────────────── */}
        <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
          {(["Tous", "Cuisine", "Salle", "Shop"] as FilterEquipe[]).map(f => {
            const active = filterEquipe === f
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFilterEquipe(f)}
                style={{
                  padding: "5px 12px", borderRadius: 20,
                  border: active ? "2px solid #D4775A" : "1px solid #ddd6c8",
                  background: active ? "rgba(212,119,90,0.08)" : "#fff",
                  fontSize: 11, fontWeight: 700, cursor: "pointer",
                  color: active ? "#D4775A" : "#666",
                  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
                  letterSpacing: 1, textTransform: "uppercase",
                }}
              >
                {f}
              </button>
            )
          })}

          <span style={{ width: 1, height: 20, background: "#ddd6c8" }} />

          <select
            value={filterContrat}
            onChange={e => setFilterContrat(e.target.value as FilterContrat)}
            style={{
              padding: "5px 10px", borderRadius: 20, border: "1px solid #ddd6c8",
              fontSize: 11, fontWeight: 700, background: "#fff", cursor: "pointer",
              color: filterContrat !== "Tous" ? "#D4775A" : "#666",
              fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
              letterSpacing: 1, textTransform: "uppercase",
            }}
          >
            {CONTRAT_FILTERS.map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>

        {/* ── Search + Add ───────────────────────────────────────────── */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
          <input
            type="text"
            placeholder="Rechercher (nom, prénom, email, matricule)..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              flex: 1, minWidth: 160, padding: "8px 14px", borderRadius: 20,
              border: "1px solid #ddd6c8", fontSize: 12, background: "#fff", outline: "none",
            }}
          />
          <span style={{ fontSize: 11, color: "#999", whiteSpace: "nowrap" }}>
            {filtered.length} résultat{filtered.length > 1 ? "s" : ""}
          </span>
        </div>

        {canWrite && (
          <div style={{ marginBottom: 16 }}>
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              style={{
                width: "100%", padding: "12px 16px", borderRadius: 12,
                border: "2px dashed #ddd6c8", background: "transparent",
                fontSize: 13, fontWeight: 700, color: "#D4775A",
                cursor: "pointer", letterSpacing: 0.5,
              }}
            >
              + Ajouter un collaborateur
            </button>
          </div>
        )}

        {showAdd && (
          <AddCollaborateurModal
            onClose={() => setShowAdd(false)}
            onCreated={() => { refetch(); setShowAdd(false) }}
            etablissementId={etablissement?.id ?? null}
          />
        )}

        {/* ── Table ──────────────────────────────────────────────────── */}
        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#999", fontSize: 13 }}>
            Chargement...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "#999", fontSize: 13 }}>
            Aucun collaborateur trouvé.
          </div>
        ) : (
          <>
            {/* Header (desktop) */}
            <div style={{
              display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1.2fr 1fr 1fr 24px",
              gap: 8, padding: "8px 14px", fontSize: 10, fontWeight: 700,
              color: "#999", letterSpacing: 1, textTransform: "uppercase",
              fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
              borderBottom: "1px solid #ece6db",
            }}>
              <span>Collaborateur</span>
              <span>Contrat</span>
              <span>Équipe</span>
              <span>Email</span>
              <span>Téléphone</span>
              <span>Rattachement</span>
              <span />
            </div>

            <div style={{ display: "grid", gap: 0 }}>
              {filtered.map(emp => (
                <EmployeRow
                  key={emp.id}
                  employe={emp}
                  onClick={() => router.push(`/rh/employe/${emp.id}`)}
                />
              ))}
            </div>
          </>
        )}
      </main>
    </>
  )
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      padding: "14px 12px", background: "#fff", borderRadius: 12,
      border: "1px solid #ece6db", textAlign: "center",
    }}>
      <div style={{
        fontSize: 28, fontWeight: 700, color,
        fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
        lineHeight: 1,
      }}>
        {value}
      </div>
      <div style={{
        fontSize: 10, fontWeight: 700, color: "#999", marginTop: 4,
        fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
        letterSpacing: 1, textTransform: "uppercase",
      }}>
        {label}
      </div>
    </div>
  )
}

// ── Employee Row ──────────────────────────────────────────────────────────────

function EmployeRow({ employe: e, onClick }: { employe: EmployeAvecContrat; onClick: () => void }) {
  const contrat = CONTRAT_LABELS[e.contrat_type ?? ""] ?? { label: e.contrat_type ?? "—", color: "#999" }
  const isMultiEtab = (e.equipe_access?.length ?? 0) > 1
  const isTNS = e.contrat_type === "TNS"

  return (
    <div
      onClick={onClick}
      style={{
        display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1.2fr 1fr 1fr 24px",
        gap: 8, padding: "12px 14px", alignItems: "center",
        background: "#fff", borderBottom: "1px solid #ece6db",
        cursor: "pointer", transition: "background 0.1s",
      }}
      onMouseEnter={ev => { (ev.currentTarget as HTMLElement).style.background = "rgba(212,119,90,0.03)" }}
      onMouseLeave={ev => { (ev.currentTarget as HTMLElement).style.background = "#fff" }}
    >
      {/* Collaborateur */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <div style={{
          width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
          background: isTNS
            ? "linear-gradient(135deg, #9B8EC4, #7B6FA4)"
            : "linear-gradient(135deg, #D4775A, #C4674A)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, fontWeight: 700, color: "#fff",
          fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
        }}>
          {e.initiales ?? (e.prenom[0] + e.nom[0]).toUpperCase()}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {e.prenom} {e.nom}
          </div>
          {e.poste_rh && (
            <div style={{ fontSize: 10, color: "#999", marginTop: 1 }}>{e.poste_rh}</div>
          )}
        </div>
      </div>

      {/* Contrat */}
      <div>
        <span style={{
          fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 6,
          background: `${contrat.color}14`, color: contrat.color,
          border: `1px solid ${contrat.color}30`,
        }}>
          {contrat.label}
        </span>
        {e.heures_semaine && (
          <span style={{ fontSize: 10, color: "#999", marginLeft: 4 }}>{e.heures_semaine}h</span>
        )}
      </div>

      {/* Équipe */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {e.equipe_access?.map(eq => (
          <span key={eq} style={{
            fontSize: 9, fontWeight: 600, padding: "2px 7px", borderRadius: 6,
            background: `${EQUIPE_COLORS[eq] ?? "#999"}14`,
            color: EQUIPE_COLORS[eq] ?? "#999",
            border: `1px solid ${EQUIPE_COLORS[eq] ?? "#999"}30`,
          }}>
            {eq}
          </span>
        ))}
      </div>

      {/* Email */}
      <div style={{ fontSize: 11, color: "#666", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {e.email ?? "—"}
      </div>

      {/* Téléphone */}
      <div style={{ fontSize: 11, color: "#666" }}>
        {e.tel_mobile ?? "—"}
      </div>

      {/* Rattachement */}
      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
        {e.matricule && (
          <span style={{ fontSize: 10, color: "#b0a894" }}>#{e.matricule}</span>
        )}
        {isMultiEtab && (
          <span title="Multi-établissements" style={{ fontSize: 12 }}>🔀</span>
        )}
        {isTNS && (
          <span style={{
            fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 4,
            background: "rgba(155,142,196,0.12)", color: "#9B8EC4",
            border: "1px solid rgba(155,142,196,0.3)",
          }}>
            TNS
          </span>
        )}
      </div>

      {/* Arrow */}
      <span style={{ color: "#ccc", fontSize: 16, textAlign: "right" }}>›</span>
    </div>
  )
}
