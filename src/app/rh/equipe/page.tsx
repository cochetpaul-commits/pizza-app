"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { RequireRole } from "@/components/RequireRole";
import { useEtablissement } from "@/lib/EtablissementContext";
import { useProfile } from "@/lib/ProfileContext";
import { AddCollaborateurModal } from "@/components/rh/AddCollaborateurModal";

/* ── Types ─────────────────────────────────────────────────────── */

type Contrat = {
  id: string;
  employe_id: string;
  type: string;
  heures_semaine: number;
  emploi: string | null;
  actif: boolean;
};

type Employe = {
  id: string;
  prenom: string;
  nom: string;
  initiales: string | null;
  avatar_url: string | null;
  actif: boolean;
  etablissement_id: string;
  equipes_access: string[];
  email: string | null;
  tel_mobile: string | null;
  date_naissance: string | null;
  adresse: string | null;
  code_postal: string | null;
  ville: string | null;
  role: string | null;
  code_pin: string | null;
};

type StatutFilter = "actif" | "inactif" | "tous";

/* ── Helpers ───────────────────────────────────────────────────── */

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrateur",
  manager: "Manager",
  employe: "Employe",
};

function getInitials(prenom: string, nom: string): string {
  return ((prenom?.[0] ?? "") + (nom?.[0] ?? "")).toUpperCase();
}

function getEtabColor(etabSlug?: string): string {
  if (etabSlug === "piccola-mia" || etabSlug === "piccola_mia" || etabSlug === "piccola") return "#efd199";
  if (etabSlug === "bello-mio" || etabSlug === "bello_mia") return "#e27f57";
  return "#D4775A";
}

function computeCompletude(emp: Employe, hasActiveContrat: boolean): number {
  let filled = 0;
  const total = 9;
  // Basic (4)
  if (emp.prenom) filled++;
  if (emp.nom) filled++;
  if (emp.email) filled++;
  if (emp.tel_mobile) filled++;
  // Personal (4)
  if (emp.date_naissance) filled++;
  if (emp.adresse) filled++;
  if (emp.code_postal) filled++;
  if (emp.ville) filled++;
  // Contract (1)
  if (hasActiveContrat) filled++;
  return Math.round((filled / total) * 100);
}

function progressColor(pct: number): string {
  if (pct >= 80) return "#4a6741";
  if (pct >= 50) return "#d4920a";
  return "#c0392b";
}

/* ── Eye Icon SVG ──────────────────────────────────────────────── */

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

/* ── Component ─────────────────────────────────────────────────── */

export default function EquipePage() {
  const router = useRouter();
  const { current: etab } = useEtablissement();
  const { canWrite } = useProfile();

  const [employes, setEmployes] = useState<Employe[]>([]);
  const [contrats, setContrats] = useState<Contrat[]>([]);
  const [loading, setLoading] = useState(true);
  const [statutFilter, setStatutFilter] = useState<StatutFilter>("actif");
  const [search, setSearch] = useState("");
  const [revealedPins, setRevealedPins] = useState<Set<string>>(new Set());

  // ── Modal state ──
  const [showModal, setShowModal] = useState(false);

  /* ── Load data ── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!etab) return;
      setLoading(true);
      const empRes = await supabase
        .from("employes")
        .select("*")
        .eq("etablissement_id", etab.id)
        .order("nom", { ascending: true });
      if (cancelled) return;
      const emps = empRes.data ?? [];
      setEmployes(emps);

      const empIds = emps.map((e: Employe) => e.id);
      if (empIds.length > 0) {
        const contratRes = await supabase
          .from("contrats")
          .select("id, employe_id, type, heures_semaine, emploi, actif")
          .eq("actif", true)
          .in("employe_id", empIds);
        if (cancelled) return;
        setContrats(contratRes.data ?? []);
      } else {
        setContrats([]);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [etab]);

  /* ── Helpers for contrats ── */
  const hasActiveContrat = (empId: string) => {
    return contrats.some((c) => c.employe_id === empId && c.actif);
  };

  /* ── Filtered list ── */
  const filtered = employes.filter((e) => {
    if (statutFilter === "actif" && !e.actif) return false;
    if (statutFilter === "inactif" && e.actif) return false;
    if (search) {
      const q = search.toLowerCase();
      const full = `${e.prenom} ${e.nom}`.toLowerCase();
      if (!full.includes(q)) return false;
    }
    return true;
  });

  const togglePin = (id: string) => {
    setRevealedPins((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const loadData = () => {
    window.location.reload();
  };

  /* ── Counts ── */
  const countActif = employes.filter((e) => e.actif).length;
  const countInactif = employes.filter((e) => !e.actif).length;

  const etabColor = getEtabColor(etab?.slug);

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <div style={pageStyle}>
        {/* ── Header ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
          <div>
            <h1 style={h1Style}>Equipe</h1>
            <p style={subtitleStyle}>
              {countActif} actif{countActif > 1 ? "s" : ""}
              {countInactif > 0 && (
                <span style={{ color: "#bbb" }}> · {countInactif} inactif{countInactif > 1 ? "s" : ""}</span>
              )}
            </p>
          </div>
          {canWrite && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <button type="button" onClick={() => setShowModal(true)} style={primaryBtnStyle}>+ Employe</button>
            </div>
          )}
        </div>

        {/* ── Filters ── */}
        <div style={filtersRow}>
          {/* Search */}
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom..."
            style={searchStyle}
          />

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
                  <th style={{ ...thStyle, textAlign: "left" }}>Nom</th>
                  <th style={{ ...thStyle, textAlign: "left" }} className="hide-mobile">Role</th>
                  <th style={{ ...thStyle, textAlign: "center" }} className="hide-mobile">Code PIN</th>
                  <th style={{ ...thStyle, textAlign: "left" }} className="hide-mobile">Email</th>
                  <th style={{ ...thStyle, textAlign: "left" }} className="hide-mobile">Telephone</th>
                  <th style={{ ...thStyle, textAlign: "center" }} className="hide-mobile">Dossier RH</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((emp) => {
                  const initials = emp.initiales || getInitials(emp.prenom, emp.nom);
                  const pct = computeCompletude(emp, hasActiveContrat(emp.id));
                  const pinRevealed = revealedPins.has(emp.id);
                  const role = emp.role ?? "employe";

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
                      {/* Nom + Avatar + badge */}
                      <td style={{ ...tdStyle, minWidth: 180 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          {emp.avatar_url ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={emp.avatar_url}
                              alt=""
                              style={avatarImgStyle}
                            />
                          ) : (
                            <div style={{ ...avatarStyle, background: etabColor }}>
                              {initials}
                            </div>
                          )}
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 14, color: "#1a1a1a" }}>
                              {emp.prenom} {emp.nom}
                            </div>
                            <span style={statutBadge(emp.actif)}>
                              {emp.actif ? "Actif" : "Inactif"}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td style={{ ...tdStyle, color: "#6f6a61", fontSize: 13 }} className="hide-mobile">
                        {ROLE_LABELS[role] ?? role}
                      </td>

                      {/* Code PIN */}
                      <td style={{ ...tdStyle, textAlign: "center" }} className="hide-mobile">
                        {emp.code_pin ? (
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontFamily: "monospace", fontSize: 13, letterSpacing: 2 }}>
                              {pinRevealed ? emp.code_pin : "••••"}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); togglePin(emp.id); }}
                              style={eyeBtnStyle}
                              title={pinRevealed ? "Masquer" : "Afficher"}
                            >
                              <EyeIcon open={pinRevealed} />
                            </button>
                          </div>
                        ) : (
                          <span style={{ color: "#ccc" }}>—</span>
                        )}
                      </td>

                      {/* Email */}
                      <td style={{ ...tdStyle, fontSize: 13, color: "#6f6a61", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} className="hide-mobile">
                        {emp.email ?? <span style={{ color: "#ccc" }}>—</span>}
                      </td>

                      {/* Telephone */}
                      <td style={{ ...tdStyle, fontSize: 13, color: "#6f6a61" }} className="hide-mobile">
                        {emp.tel_mobile ?? <span style={{ color: "#ccc" }}>—</span>}
                      </td>

                      {/* Dossier RH */}
                      <td style={{ ...tdStyle, textAlign: "center", minWidth: 120 }} className="hide-mobile">
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                          <div style={progressBarBg}>
                            <div style={{ ...progressBarFill, width: `${pct}%`, background: progressColor(pct) }} />
                          </div>
                          <span style={{ fontSize: 11, color: progressColor(pct), fontWeight: 600 }}>
                            {pct}% — {pct >= 100 ? "Complet" : "Incomplet"}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Add Employee Modal ── */}
      {showModal && (
        <AddCollaborateurModal
          etablissementId={etab?.id ?? ""}
          onClose={() => setShowModal(false)}
          onCreated={loadData}
        />
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

const filtersRow: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  alignItems: "center",
  marginBottom: 16,
};

const searchStyle: React.CSSProperties = {
  flex: "1 1 200px",
  minWidth: 140,
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
  flexShrink: 0,
};

const avatarImgStyle: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: "50%",
  objectFit: "cover",
  flexShrink: 0,
};

const statutBadge = (actif: boolean): React.CSSProperties => ({
  display: "inline-block",
  padding: "1px 8px",
  borderRadius: 8,
  fontSize: 11,
  fontWeight: 700,
  background: actif ? "#e8ede6" : "#f0f0f0",
  color: actif ? "#4a6741" : "#bbb",
  marginTop: 2,
});

const eyeBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: 2,
  color: "#999",
  display: "inline-flex",
  alignItems: "center",
};

const progressBarBg: React.CSSProperties = {
  width: "100%",
  maxWidth: 80,
  height: 4,
  borderRadius: 2,
  background: "#eee",
  overflow: "hidden",
};

const progressBarFill: React.CSSProperties = {
  height: "100%",
  borderRadius: 2,
  transition: "width 0.3s",
};

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
