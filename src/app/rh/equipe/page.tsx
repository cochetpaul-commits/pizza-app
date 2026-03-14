"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { NavBar } from "@/components/NavBar";
import { RequireRole } from "@/components/RequireRole";
import { useEtablissement } from "@/lib/EtablissementContext";
import { useProfile } from "@/lib/ProfileContext";

/* ── Types ─────────────────────────────────────────────────────── */

type Employe = {
  id: string;
  prenom: string;
  nom: string;
  initiales: string | null;
  avatar_url: string | null;
  actif: boolean;
  etablissement_id: string;
  equipes_access: string[];
  contrats: {
    type: string;
    heures_semaine: number;
    emploi: string | null;
    actif: boolean;
  }[];
};

type Poste = {
  id: string;
  equipe: string;
  nom: string;
  couleur: string;
  emoji: string | null;
  actif: boolean;
};

type EquipeFilter = "tous" | "Cuisine" | "Salle" | "Shop";
type StatutFilter = "actif" | "inactif" | "tous";

/* ── Helpers ───────────────────────────────────────────────────── */

const CONTRAT_LABELS: Record<string, string> = {
  CDI: "CDI",
  CDD: "CDD",
  extra: "Extra",
  interim: "Intérim",
  apprenti: "Apprenti",
  stagiaire: "Stagiaire",
  TNS: "TNS",
};

const CONTRAT_COLORS: Record<string, { bg: string; fg: string }> = {
  CDI: { bg: "#e8ede6", fg: "#4a6741" },
  CDD: { bg: "rgba(37,99,235,0.10)", fg: "#2563eb" },
  extra: { bg: "#FFF3E0", fg: "#E65100" },
  interim: { bg: "#F3E5F5", fg: "#7B1FA2" },
  TNS: { bg: "rgba(160,132,92,0.12)", fg: "#A0845C" },
  apprenti: { bg: "#E0F7FA", fg: "#00695C" },
  stagiaire: { bg: "#e8e0d0", fg: "#999999" },
};

function getInitials(prenom: string, nom: string): string {
  return ((prenom?.[0] ?? "") + (nom?.[0] ?? "")).toUpperCase();
}

/* ── Component ─────────────────────────────────────────────────── */

export default function EquipePage() {
  const router = useRouter();
  const { current: etab } = useEtablissement();
  const { canWrite } = useProfile();

  const [employes, setEmployes] = useState<Employe[]>([]);
  const [postes, setPostes] = useState<Poste[]>([]);
  const [loading, setLoading] = useState(true);
  const [equipeFilter, setEquipeFilter] = useState<EquipeFilter>("tous");
  const [statutFilter, setStatutFilter] = useState<StatutFilter>("actif");
  const [search, setSearch] = useState("");

  // ── Modal state ──
  const [showModal, setShowModal] = useState(false);
  const [newPrenom, setNewPrenom] = useState("");
  const [newNom, setNewNom] = useState("");
  const [newContratType, setNewContratType] = useState("CDI");
  const [newHeures, setNewHeures] = useState(39);
  const [newEmploi, setNewEmploi] = useState("");
  const [saving, setSaving] = useState(false);

  /* ── Load data ── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!etab) return;
      setLoading(true);
      const [empRes, postesRes] = await Promise.all([
        supabase
          .from("employes")
          .select("id, prenom, nom, initiales, avatar_url, actif, etablissement_id, equipes_access, contrats(type, heures_semaine, emploi, actif)")
          .eq("etablissement_id", etab.id)
          .order("nom", { ascending: true }),
        supabase
          .from("postes")
          .select("id, equipe, nom, couleur, emoji, actif")
          .eq("etablissement_id", etab.id)
          .eq("actif", true)
          .order("equipe")
          .order("nom"),
      ]);
      if (cancelled) return;
      setEmployes(empRes.data ?? []);
      setPostes(postesRes.data ?? []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [etab]);

  /* ── Filtered list ── */
  const filtered = employes.filter((e) => {
    // Statut
    if (statutFilter === "actif" && !e.actif) return false;
    if (statutFilter === "inactif" && e.actif) return false;

    // Equipe
    if (equipeFilter !== "tous") {
      const access = e.equipes_access ?? [];
      if (access.length > 0 && !access.includes(equipeFilter)) return false;
    }

    // Search
    if (search) {
      const q = search.toLowerCase();
      const full = `${e.prenom} ${e.nom}`.toLowerCase();
      if (!full.includes(q)) return false;
    }

    return true;
  });

  /* ── Create employee ── */
  const handleCreate = async () => {
    if (!etab || !newPrenom.trim() || !newNom.trim()) return;
    setSaving(true);

    const { data: emp, error } = await supabase
      .from("employes")
      .insert({
        etablissement_id: etab.id,
        prenom: newPrenom.trim(),
        nom: newNom.trim(),
      })
      .select("id")
      .single();

    if (error || !emp) {
      alert("Erreur : " + (error?.message ?? "inconnu"));
      setSaving(false);
      return;
    }

    // Create initial contract
    if (newContratType) {
      await supabase.from("contrats").insert({
        employe_id: emp.id,
        type: newContratType,
        heures_semaine: newHeures,
        emploi: newEmploi.trim() || null,
        remuneration: 0,
        date_debut: new Date().toISOString().slice(0, 10),
      });
    }

    setSaving(false);
    setShowModal(false);
    setNewPrenom("");
    setNewNom("");
    setNewContratType("CDI");
    setNewHeures(39);
    setNewEmploi("");

    router.push(`/rh/employe/${emp.id}`);
  };

  /* ── Postes by equipe (for summary) ── */
  const equipes = ["Cuisine", "Salle", "Shop"] as const;
  const postesByEquipe = equipes.reduce(
    (acc, eq) => {
      acc[eq] = postes.filter((p) => p.equipe === eq);
      return acc;
    },
    {} as Record<string, Poste[]>,
  );

  /* ── Counts ── */
  const countActif = employes.filter((e) => e.actif).length;
  const countInactif = employes.filter((e) => !e.actif).length;

  return (
    <RequireRole allowedRoles={["admin", "direction"]}>
      <NavBar
        backHref="/"
        backLabel="Accueil"
        primaryAction={
          canWrite ? (
            <button
              type="button"
              onClick={() => setShowModal(true)}
              style={primaryBtnStyle}
            >
              + Employe
            </button>
          ) : undefined
        }
      />

      <div style={pageStyle}>
        {/* ── Header ── */}
        <div style={{ marginBottom: 20 }}>
          <h1 style={h1Style}>Equipe</h1>
          <p style={subtitleStyle}>
            {countActif} actif{countActif > 1 ? "s" : ""}
            {countInactif > 0 && (
              <span style={{ color: "#bbb" }}> · {countInactif} inactif{countInactif > 1 ? "s" : ""}</span>
            )}
          </p>
        </div>

        {/* ── Postes summary ── */}
        <div style={postesSummaryStyle}>
          {equipes.map((eq) => {
            const list = postesByEquipe[eq] ?? [];
            if (list.length === 0) return null;
            return (
              <div key={eq} style={{ marginBottom: 8 }}>
                <div style={equipeLabelStyle}>{eq}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {list.map((p) => (
                    <span key={p.id} style={postePillStyle(p.couleur)}>
                      {p.emoji && <span style={{ marginRight: 4 }}>{p.emoji}</span>}
                      {p.nom}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Filters ── */}
        <div style={filtersRow}>
          {/* Search */}
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher..."
            style={searchStyle}
          />

          {/* Equipe filter */}
          <div style={{ display: "flex", gap: 4 }}>
            {(["tous", "Cuisine", "Salle", "Shop"] as EquipeFilter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setEquipeFilter(f)}
                style={pillBtn(equipeFilter === f)}
              >
                {f === "tous" ? "Tous" : f}
              </button>
            ))}
          </div>

          {/* Statut filter */}
          <div style={{ display: "flex", gap: 4 }}>
            {(["actif", "inactif", "tous"] as StatutFilter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setStatutFilter(f)}
                style={pillBtn(statutFilter === f)}
              >
                {f === "tous" ? "Tous" : f === "actif" ? "Actifs" : "Inactifs"}
              </button>
            ))}
          </div>
        </div>

        {/* ── Table ── */}
        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#999" }}>Chargement...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "#999" }}>
            Aucun employe trouve.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}></th>
                  <th style={{ ...thStyle, textAlign: "left" }}>Nom</th>
                  <th style={{ ...thStyle, textAlign: "left" }} className="hide-mobile">Emploi</th>
                  <th style={{ ...thStyle, textAlign: "center" }} className="hide-mobile">Contrat</th>
                  <th style={{ ...thStyle, textAlign: "center" }} className="hide-mobile">Heures</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Statut</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((emp) => {
                  const contrat = emp.contrats?.find((c) => c.actif) ?? emp.contrats?.[0];
                  const initials = emp.initiales || getInitials(emp.prenom, emp.nom);

                  return (
                    <tr
                      key={emp.id}
                      onClick={() => router.push(`/rh/employe/${emp.id}`)}
                      style={trStyle}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.background = "#f5f0e8";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.background = "transparent";
                      }}
                    >
                      {/* Avatar */}
                      <td style={{ ...tdStyle, width: 44, paddingRight: 0 }}>
                        {emp.avatar_url ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={emp.avatar_url}
                            alt=""
                            style={avatarImgStyle}
                          />
                        ) : (
                          <div style={avatarStyle}>
                            {initials}
                          </div>
                        )}
                      </td>

                      {/* Nom */}
                      <td style={{ ...tdStyle, fontWeight: 600 }}>
                        <div>{emp.prenom} {emp.nom}</div>
                        {/* Mobile: show emploi inline */}
                        {contrat?.emploi && (
                          <div className="show-mobile" style={{ fontSize: 12, color: "#999", fontWeight: 400, marginTop: 2 }}>
                            {contrat.emploi}
                          </div>
                        )}
                      </td>

                      {/* Emploi */}
                      <td style={{ ...tdStyle, color: "#6f6a61" }} className="hide-mobile">
                        {contrat?.emploi ?? "—"}
                      </td>

                      {/* Contrat */}
                      <td style={{ ...tdStyle, textAlign: "center" }} className="hide-mobile">
                        {contrat ? (
                          <span style={contratBadge(contrat.type)}>
                            {CONTRAT_LABELS[contrat.type] ?? contrat.type}
                          </span>
                        ) : "—"}
                      </td>

                      {/* Heures */}
                      <td style={{ ...tdStyle, textAlign: "center", fontWeight: 600 }} className="hide-mobile">
                        {contrat ? `${contrat.heures_semaine}h` : "—"}
                      </td>

                      {/* Statut */}
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <span style={statutBadge(emp.actif)}>
                          {emp.actif ? "Actif" : "Inactif"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modal creation ── */}
      {showModal && (
        <div style={overlayStyle} onClick={() => setShowModal(false)}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <h2 style={modalTitleStyle}>Nouvel employe</h2>

            <div style={fieldRow}>
              <label style={labelStyle}>Prenom *</label>
              <input
                style={inputStyle}
                value={newPrenom}
                onChange={(e) => setNewPrenom(e.target.value)}
                placeholder="Jean"
                autoFocus
              />
            </div>

            <div style={fieldRow}>
              <label style={labelStyle}>Nom *</label>
              <input
                style={inputStyle}
                value={newNom}
                onChange={(e) => setNewNom(e.target.value)}
                placeholder="Dupont"
              />
            </div>

            <div style={fieldRow}>
              <label style={labelStyle}>Emploi</label>
              <input
                style={inputStyle}
                value={newEmploi}
                onChange={(e) => setNewEmploi(e.target.value)}
                placeholder="Pizzaiolo, Serveur..."
              />
            </div>

            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ ...fieldRow, flex: 1 }}>
                <label style={labelStyle}>Type contrat</label>
                <select
                  style={inputStyle}
                  value={newContratType}
                  onChange={(e) => setNewContratType(e.target.value)}
                >
                  {Object.entries(CONTRAT_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>

              <div style={{ ...fieldRow, flex: 1 }}>
                <label style={labelStyle}>Heures / semaine</label>
                <input
                  type="number"
                  style={inputStyle}
                  value={newHeures}
                  onChange={(e) => setNewHeures(Number(e.target.value))}
                  min={0}
                  max={48}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                style={cancelBtnStyle}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={saving || !newPrenom.trim() || !newNom.trim()}
                style={{
                  ...primaryBtnStyle,
                  opacity: saving || !newPrenom.trim() || !newNom.trim() ? 0.5 : 1,
                }}
              >
                {saving ? "..." : "Creer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Responsive CSS ── */}
      <style>{`
        .hide-mobile { }
        .show-mobile { display: none !important; }
        @media (max-width: 640px) {
          .hide-mobile { display: none !important; }
          .show-mobile { display: block !important; }
        }
      `}</style>
    </RequireRole>
  );
}

/* ── Styles ───────────────────────────────────────────────────── */

const pageStyle: React.CSSProperties = {
  maxWidth: 900,
  margin: "0 auto",
  padding: "16px 16px 60px",
};

const h1Style: React.CSSProperties = {
  margin: 0,
  fontSize: 28,
  fontWeight: 700,
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
  textTransform: "uppercase",
  letterSpacing: 1.5,
  color: "#1a1a1a",
};

const subtitleStyle: React.CSSProperties = {
  margin: "4px 0 0",
  fontSize: 14,
  color: "#6f6a61",
  fontFamily: "var(--font-dm), 'DM Sans', sans-serif",
};

const postesSummaryStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 12,
  border: "1px solid #ddd6c8",
  padding: "14px 16px",
  marginBottom: 16,
};

const equipeLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 1,
  color: "#999",
  marginBottom: 6,
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
};

const postePillStyle = (color: string): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  padding: "3px 10px",
  borderRadius: 20,
  fontSize: 12,
  fontWeight: 600,
  background: `${color}18`,
  color,
  border: `1px solid ${color}30`,
});

const filtersRow: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  alignItems: "center",
  marginBottom: 16,
};

const searchStyle: React.CSSProperties = {
  flex: "1 1 160px",
  minWidth: 120,
  padding: "7px 12px",
  borderRadius: 8,
  border: "1px solid #ddd6c8",
  fontSize: 13,
  background: "#fff",
  outline: "none",
};

const pillBtn = (active: boolean): React.CSSProperties => ({
  padding: "5px 12px",
  borderRadius: 20,
  border: active ? "1px solid #D4775A" : "1px solid #ddd6c8",
  background: active ? "#D4775A" : "#fff",
  color: active ? "#fff" : "#1a1a1a",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
});

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  background: "#fff",
  borderRadius: 12,
  overflow: "hidden",
  border: "1px solid #ddd6c8",
};

const thStyle: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0.5,
  color: "#999",
  borderBottom: "1px solid #ddd6c8",
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: 14,
  borderBottom: "1px solid #f0ebe3",
  verticalAlign: "middle",
};

const trStyle: React.CSSProperties = {
  cursor: "pointer",
  transition: "background 0.15s",
};

const avatarStyle: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: "50%",
  background: "#D4775A",
  color: "#fff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 13,
  fontWeight: 700,
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
};

const avatarImgStyle: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: "50%",
  objectFit: "cover",
};

const contratBadge = (type: string): React.CSSProperties => {
  const c = CONTRAT_COLORS[type] ?? { bg: "#e8e0d0", fg: "#999" };
  return {
    display: "inline-block",
    padding: "2px 10px",
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 700,
    background: c.bg,
    color: c.fg,
  };
};

const statutBadge = (actif: boolean): React.CSSProperties => ({
  display: "inline-block",
  padding: "2px 10px",
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 700,
  background: actif ? "#e8ede6" : "#f0f0f0",
  color: actif ? "#4a6741" : "#bbb",
});

const primaryBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  height: 32,
  padding: "0 14px",
  borderRadius: 20,
  border: "none",
  background: "#D4775A",
  color: "#fff",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const cancelBtnStyle: React.CSSProperties = {
  padding: "8px 18px",
  borderRadius: 8,
  border: "1px solid #ddd6c8",
  background: "#fff",
  color: "#1a1a1a",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};

/* ── Modal ── */
const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.4)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 200,
  padding: 16,
};

const modalStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 16,
  padding: 28,
  width: "100%",
  maxWidth: 420,
  maxHeight: "90vh",
  overflowY: "auto",
  boxShadow: "0 12px 40px rgba(0,0,0,0.15)",
};

const modalTitleStyle: React.CSSProperties = {
  margin: "0 0 20px",
  fontSize: 20,
  fontWeight: 700,
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
  color: "#1a1a1a",
};

const fieldRow: React.CSSProperties = {
  marginBottom: 14,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: 4,
  fontSize: 12,
  fontWeight: 600,
  color: "#6f6a61",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #ddd6c8",
  fontSize: 14,
  background: "#fff",
  outline: "none",
  boxSizing: "border-box",
};
