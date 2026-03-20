"use client";

import { useState, useEffect, useCallback } from "react";
import { RequireRole } from "@/components/RequireRole";
import { supabase } from "@/lib/supabaseClient";

type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
};

const ROLES = [
  { key: "group_admin", label: "Proprietaire", desc: "Titulaire du compte, peut modifier les droits d'un admin", color: "#1a1a1a" },
  { key: "admin", label: "Administrateur", desc: "Peut acceder a l'ensemble de l'application", color: "#7B1FA2" },
  { key: "manager", label: "Directeur", desc: "Gere un etablissement de la configuration a la pre-paie", color: "#2D6A4F" },
  { key: "cuisine", label: "Manager Cuisine", desc: "Supervise une equipe par la creation de planning ou la gestion des absences", color: "#D4775A" },
  { key: "salle", label: "Manager Salle", desc: "Supervise l'equipe de salle", color: "#2563eb" },
  { key: "plonge", label: "Employe", desc: "Role par defaut qui permet d'acceder a la plateforme en tant qu'employe", color: "#999" },
];

const PERMISSIONS = {
  planning: [
    "Acces au planning publie de ses equipes/etablissements",
    "Acces au planning non-publie (brouillon)",
    "Acces au planning publie des autres equipes/etablissements",
    "Visualisation des alertes et compteurs",
    "Creation, modification et publication de planning",
    "Peut modifier les plannings publies et valider les shifts de son etablissement",
    "Visualisation des ratios",
  ],
  heures: [
    "Enregistrer ses propres heures de travail",
    "Saisir les heures reelles de son equipe/etablissement",
    "Peut valider ses propres heures reelles",
    "Saisir les heures reelles de toutes les equipes/etablissements",
    "Peut devalider les heures reelles",
    "Peut revaloriser des absences",
  ],
  profil: [
    "Peut acceder a son profil utilisateur",
    "Peut modifier son etat civil et ses informations de contact",
    "Peut consulter ses propres feuilles de presence",
    "Acces au profil des employes de mon equipe ou etablissement",
    "Acces au profil des managers de mon equipe ou etablissement",
    "Acces au profil de tous les salaries de tous les etablissements",
    "Peut supprimer un profil employe ou manager",
  ],
  absences: [
    "Peut modifier manuellement les compteurs de conges payes",
  ],
  paie: [
    "Peut distribuer, consulter et supprimer les bulletins de paie de tous les employes",
  ],
};

const CARD = { background: "#fff", borderRadius: 14, padding: 20, border: "1px solid #ddd6c8", marginBottom: 16 };
const LABEL = { fontSize: 11, fontWeight: 700 as const, color: "#999", textTransform: "uppercase" as const, letterSpacing: 0.5 };

export default function SettingsRolesPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedRole, setSelectedRole] = useState("group_admin");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("profiles")
      .select("id, email, full_name, role")
      .order("role")
      .order("full_name")
      .then(({ data }) => {
        setProfiles((data ?? []) as Profile[]);
        setLoading(false);
      });
  }, []);

  const roleInfo = ROLES.find(r => r.key === selectedRole) ?? ROLES[0];

  const updateRole = useCallback(async (profileId: string, newRole: string) => {
    setProfiles(prev => prev.map(p => p.id === profileId ? { ...p, role: newRole } : p));
    await supabase.from("profiles").update({ role: newRole }).eq("id", profileId);
  }, []);

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px 60px" }}>
        <h1 style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 22, fontWeight: 700, letterSpacing: 1, marginBottom: 20, color: "#1a1a1a" }}>
          Role et Permissions
        </h1>

        {/* Role selector */}
        <div style={CARD}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8 }}>
            {ROLES.map(r => (
              <button
                key={r.key}
                type="button"
                onClick={() => setSelectedRole(r.key)}
                style={{
                  padding: "12px 10px", borderRadius: 10,
                  border: selectedRole === r.key ? `2px solid ${r.color}` : "1px solid #ddd6c8",
                  background: selectedRole === r.key ? `${r.color}0A` : "#fff",
                  cursor: "pointer", textAlign: "left",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a", marginBottom: 4 }}>{r.label}</div>
                <div style={{ fontSize: 10, color: "#999", lineHeight: 1.3 }}>{r.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Permission matrix */}
        <div style={CARD}>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, color: "#1a1a1a" }}>
            Permissions : {roleInfo.label}
          </h2>

          {Object.entries(PERMISSIONS).map(([section, perms]) => (
            <div key={section} style={{ marginBottom: 16 }}>
              <div style={{
                ...LABEL, padding: "8px 12px", background: "#faf7f2",
                borderRadius: 6, marginBottom: 4,
              }}>
                {section === "heures" ? "Gestion des heures" :
                 section === "profil" ? "Profil utilisateur" :
                 section === "absences" ? "Gestion des absences" :
                 section === "paie" ? "Gestion de la paie" :
                 "Planning"}
              </div>
              {perms.map((perm, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "10px 12px",
                  borderBottom: i < perms.length - 1 ? "1px solid #f0ebe3" : "none",
                }}>
                  <span style={{ fontSize: 13, color: "#1a1a1a" }}>{perm}</span>
                  <span style={{ flexShrink: 0, marginLeft: 12 }}>
                    {/* For now show a static check based on role hierarchy */}
                    {selectedRole === "group_admin" || selectedRole === "admin" ? (
                      <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#2D6A4F" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" opacity="0.2" /><polyline points="9 12 11.5 14.5 15 9.5" /></svg>
                    ) : selectedRole === "manager" && (section === "planning" || section === "heures" || section === "profil") ? (
                      <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#2D6A4F" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" opacity="0.2" /><polyline points="9 12 11.5 14.5 15 9.5" /></svg>
                    ) : (section === "profil" && i < 3) || (section === "heures" && i === 0) || (section === "planning" && i === 0) ? (
                      <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#2D6A4F" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" opacity="0.2" /><polyline points="9 12 11.5 14.5 15 9.5" /></svg>
                    ) : (
                      <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.5"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
                    )}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Users with this role */}
        <div style={CARD}>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: "#1a1a1a" }}>
            Utilisateurs avec le role {roleInfo.label}
          </h2>
          {loading ? (
            <p style={{ color: "#999", fontSize: 13 }}>Chargement...</p>
          ) : (
            <div>
              {profiles.filter(p => p.role === selectedRole).length === 0 ? (
                <p style={{ color: "#999", fontSize: 13 }}>Aucun utilisateur avec ce role</p>
              ) : (
                profiles.filter(p => p.role === selectedRole).map(p => (
                  <div key={p.id} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 0", borderBottom: "1px solid #f0ebe3",
                  }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>{p.full_name ?? p.email}</div>
                      <div style={{ fontSize: 11, color: "#999" }}>{p.email}</div>
                    </div>
                    <select
                      value={p.role}
                      onChange={e => updateRole(p.id, e.target.value)}
                      style={{
                        padding: "4px 8px", borderRadius: 6,
                        border: "1px solid #ddd6c8", fontSize: 12, color: "#1a1a1a",
                        background: "#fff",
                      }}
                    >
                      {ROLES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
                    </select>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </RequireRole>
  );
}
