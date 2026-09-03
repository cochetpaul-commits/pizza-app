"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { RequireRole } from "@/components/RequireRole";
import { useEtablissement } from "@/lib/EtablissementContext";
import { AddCollaborateurModal } from "@/components/rh/AddCollaborateurModal";

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
  email: string | null;
  tel_mobile: string | null;
  date_naissance: string | null;
  adresse: string | null;
  code_postal: string | null;
  ville: string | null;
  role: string | null;
  code_pin: string | null;
  auth_user_id: string | null;
  postes?: { nom: string; equipe: string | null } | null;
};


/* ── Helpers ───────────────────────────────────────────────────── */

// Libelles/couleurs identiques a la fiche employe (Compte & acces)
import { mapToPermRole, ROLE_INFO } from "@/lib/permissions";
import { fetchApi } from "@/lib/fetchApi";

function getInitials(prenom: string, nom: string): string {
  return ((prenom?.[0] ?? "") + (nom?.[0] ?? "")).toUpperCase();
}

function getEtabColor(etabSlug?: string): string {
  if (etabSlug === "piccola-mia" || etabSlug === "piccola_mia" || etabSlug === "piccola") return "#e6c428";
  if (etabSlug === "bello-mio" || etabSlug === "bello_mia") return "#e27f57";
  return "#D4775A";
}

/* ── Component ─────────────────────────────────────────────────── */

export default function EquipePage() {
  const router = useRouter();
  const { current: etab } = useEtablissement();

  const [employes, setEmployes] = useState<Employe[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Modal state ──
  const [showModal, setShowModal] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState("");
  const [inviteStatus, setInviteStatus] = useState<Record<string, string>>({});

  /* ── Load data ── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!etab) return;
      setLoading(true);
      const empRes = await supabase
        .from("employes")
        .select("*, postes(nom, equipe)")
        .contains("etablissements_ids", [etab.id])
        .order("nom", { ascending: true });
      if (cancelled) return;
      const emps = empRes.data ?? [];
      setEmployes(emps);

      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [etab]);

  /* ── Active employees only ── */
  const filtered = employes.filter((e) => e.actif);

  const loadData = () => {
    window.location.reload();
  };

  const etabColor = getEtabColor(etab?.slug);

  return (
    <RequireRole permission="profil.view_team">
      <div style={pageStyle}>

        {/* ── Actions ── */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" onClick={() => setShowModal(true)} style={{
            padding: "8px 16px", borderRadius: 10, border: "none",
            background: "#2D6A4F", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer",
          }}>+ Ajouter un employe</button>
          <button type="button" disabled={syncing} onClick={async () => {
            setSyncing(true); setSyncResult("");
            try {
              const res = await fetchApi("/api/combo/sync", { method: "POST" });
              const data = await res.json();
              if (data.ok) {
                const summary = (data.results as { location: string; created: number; updated: number }[])
                  .map((r: { location: string; created: number; updated: number }) => `${r.location} : ${r.created} crees, ${r.updated} mis a jour`).join(" ; ");
                setSyncResult(summary);
                setTimeout(loadData, 1500);
              } else {
                setSyncResult("Erreur : " + (data.error ?? "inconnue"));
              }
            } catch (e) { setSyncResult("Erreur reseau"); console.error(e); }
            setSyncing(false);
          }} style={{
            padding: "8px 16px", borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: "pointer",
            border: "1.5px solid #2563EB", background: "#fff", color: "#2563EB",
            opacity: syncing ? 0.5 : 1,
          }}>{syncing ? "Synchronisation..." : "Sync Combo"}</button>
          {syncResult && <span style={{ fontSize: 11, color: syncResult.startsWith("Erreur") ? "#DC2626" : "#2D6A4F", fontWeight: 600 }}>{syncResult}</span>}
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
                  <th style={{ ...thStyle, textAlign: "left" }} className="hide-mobile">Email</th>
                  <th style={{ ...thStyle, textAlign: "left" }} className="hide-mobile">Telephone</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((emp) => {
                  const initials = emp.initiales || getInitials(emp.prenom, emp.nom);
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
                          </div>
                        </div>
                      </td>

                      {/* Role + poste */}
                      <td style={{ ...tdStyle, fontSize: 13 }} className="hide-mobile">
                        {(() => {
                          const info = ROLE_INFO[mapToPermRole(role)];
                          return (
                            <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
                              <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 9px", borderRadius: 999, background: info.bg, color: info.color }}>
                                {info.label}
                              </span>
                              {emp.postes?.nom && <span className="pastille-cadre">{emp.postes.nom}</span>}
                            </div>
                          );
                        })()}
                      </td>

                      {/* Email */}
                      <td style={{ ...tdStyle, fontSize: 13, color: "#6f6a61", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} className="hide-mobile">
                        {emp.email ?? <span style={{ color: "#ccc" }}>—</span>}
                      </td>

                      {/* Telephone */}
                      <td style={{ ...tdStyle, fontSize: 13, color: "#6f6a61" }} className="hide-mobile">
                        {emp.tel_mobile ?? <span style={{ color: "#ccc" }}>—</span>}
                      </td>

                      {/* Actions */}
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        {emp.auth_user_id ? (
                          <span style={{ fontSize: 10, fontWeight: 700, color: "#2D6A4F", padding: "3px 8px", borderRadius: 6, background: "#2D6A4F10", border: "1px solid #2D6A4F30" }}>Connecte</span>
                        ) : emp.email ? (
                          <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                            {inviteStatus[emp.id] === "sending" ? (
                              <span style={{ fontSize: 10, color: "#999", fontWeight: 600 }}>Envoi...</span>
                            ) : inviteStatus[emp.id] === "sent" ? (
                              <span style={{ fontSize: 10, fontWeight: 700, color: "#2D6A4F" }}>Invite envoye</span>
                            ) : inviteStatus[emp.id]?.startsWith("err:") ? (
                              <span style={{ fontSize: 10, fontWeight: 700, color: "#DC2626" }} title={inviteStatus[emp.id]}>{inviteStatus[emp.id].replace("err:", "")}</span>
                            ) : (
                              <button type="button" onClick={async (e) => {
                                e.stopPropagation();
                                setInviteStatus(prev => ({ ...prev, [emp.id]: "sending" }));
                                try {
                                  // Refresh session to avoid expired token
                                  await supabase.auth.refreshSession();
                                  const { data: { session } } = await supabase.auth.getSession();
                                  if (!session?.access_token) {
                                    setInviteStatus(prev => ({ ...prev, [emp.id]: "err:Session expiree, reconnectez-vous" }));
                                    return;
                                  }
                                  const res = await fetchApi("/api/admin/invite", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
                                    body: JSON.stringify({ email: emp.email, displayName: `${emp.prenom} ${emp.nom}`, role: emp.role ?? "equipier", etablissementsAccess: emp.etablissement_id ? [emp.etablissement_id] : [] }),
                                  });
                                  if (res.ok) {
                                    setInviteStatus(prev => ({ ...prev, [emp.id]: "sent" }));
                                  } else {
                                    const errData = await res.json().catch(() => ({}));
                                    const msg = errData.error?.includes("JWT") ? "Session expiree, reconnectez-vous" : (errData.error || `Erreur ${res.status}`);
                                    setInviteStatus(prev => ({ ...prev, [emp.id]: `err:${msg}` }));
                                  }
                                } catch {
                                  setInviteStatus(prev => ({ ...prev, [emp.id]: "err:Erreur reseau" }));
                                }
                              }} style={{
                                padding: "4px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700,
                                border: "1px solid #2D6A4F40", background: "#2D6A4F08", color: "#2D6A4F", cursor: "pointer",
                              }}>Inviter</button>
                            )}
                          </div>
                        ) : (
                          <span style={{ fontSize: 10, color: "#ccc" }}>Pas d&apos;email</span>
                        )}
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

