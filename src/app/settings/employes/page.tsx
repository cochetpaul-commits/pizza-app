"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { RequireRole } from "@/components/RequireRole";
import { useEtablissement } from "@/lib/EtablissementContext";
import { AddCollaborateurModal } from "@/components/rh/AddCollaborateurModal";
import { fetchApi } from "@/lib/fetchApi";

type Employe = {
  id: string;
  prenom: string;
  nom: string;
  initiales: string | null;
  email: string | null;
  tel_mobile: string | null;
  role: string | null;
  equipes_access: string[];
  etablissement_id: string;
  actif: boolean;
  avatar_url: string | null;
};

type Etab = { id: string; nom: string; slug: string };

const ROLE_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  proprietaire: { label: "Proprietaire", color: "#D4775A", bg: "rgba(212,119,90,0.1)" },
  admin: { label: "Admin", color: "#2D6A4F", bg: "rgba(45,106,79,0.1)" },
  direction: { label: "Directeur", color: "#2563eb", bg: "rgba(37,99,235,0.1)" },
  manager: { label: "Manager", color: "#7B1FA2", bg: "rgba(123,31,162,0.1)" },
  employe: { label: "Employe", color: "#1a1a1a", bg: "transparent" },
  group_admin: { label: "Proprietaire", color: "#D4775A", bg: "rgba(212,119,90,0.1)" },
  cuisine: { label: "Employe", color: "#1a1a1a", bg: "transparent" },
  salle: { label: "Employe", color: "#1a1a1a", bg: "transparent" },
  plonge: { label: "Employe", color: "#1a1a1a", bg: "transparent" },
};

const INPUT: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "1px solid #ddd6c8", fontSize: 14, boxSizing: "border-box" };

export default function SettingsEmployesPage() {
  const router = useRouter();
  const { current: currentEtab } = useEtablissement();
  const [showAddModal, setShowAddModal] = useState(false);
  const [employes, setEmployes] = useState<Employe[]>([]);
  const [etabs, setEtabs] = useState<Etab[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [etabFilter, setEtabFilter] = useState("all");
  const [contratFilter, setContratFilter] = useState("all");
  const [statutFilter, setStatutFilter] = useState("actif");
  const [sortBy, setSortBy] = useState("nom");
  const [authEmails, setAuthEmails] = useState<Set<string>>(new Set());
  const [invitingId, setInvitingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [empRes, etabRes, profileRes] = await Promise.all([
        supabase.from("employes").select("id, prenom, nom, initiales, email, tel_mobile, role, equipes_access, etablissement_id, actif, avatar_url").order("nom"),
        supabase.from("etablissements").select("id, nom, slug").eq("actif", true).order("nom"),
        supabase.from("profiles").select("email"),
      ]);
      if (!cancelled) {
        setEmployes((empRes.data ?? []) as Employe[]);
        setEtabs((etabRes.data ?? []) as Etab[]);
        const emails = new Set((profileRes.data ?? []).map((p: { email: string }) => p.email?.toLowerCase()).filter(Boolean));
        setAuthEmails(emails);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const etabMap = useMemo(() => {
    const m = new Map<string, Etab>();
    etabs.forEach(e => m.set(e.id, e));
    return m;
  }, [etabs]);

  const filtered = useMemo(() => {
    let list = employes;
    if (statutFilter === "actif") list = list.filter(e => e.actif);
    else if (statutFilter === "inactif") list = list.filter(e => !e.actif);
    if (etabFilter !== "all") list = list.filter(e => e.etablissement_id === etabFilter);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(e =>
        e.prenom.toLowerCase().includes(s) ||
        e.nom.toLowerCase().includes(s) ||
        (e.email ?? "").toLowerCase().includes(s) ||
        (e.role ?? "").toLowerCase().includes(s)
      );
    }
    if (sortBy === "nom") list = [...list].sort((a, b) => a.nom.localeCompare(b.nom));
    else if (sortBy === "prenom") list = [...list].sort((a, b) => a.prenom.localeCompare(b.prenom));
    return list;
  }, [employes, statutFilter, etabFilter, search, sortBy]);

  const getRattachement = (emp: Employe) => {
    const etab = etabMap.get(emp.etablissement_id);
    const equipe = emp.equipes_access?.[0] ?? "";
    return `${etab?.nom ?? "—"} / ${equipe || "—"}`;
  };

  const getRoleBadge = (role: string | null) => {
    const r = ROLE_LABELS[role ?? "employe"] ?? ROLE_LABELS.employe;
    if (r.bg === "transparent") return <span style={{ fontSize: 12, color: r.color }}>{r.label}</span>;
    return (
      <span style={{ padding: "2px 8px", borderRadius: 4, background: r.bg, color: r.color, fontSize: 11, fontWeight: 600 }}>
        {r.label}
      </span>
    );
  };

  const totalEquipes = useMemo(() => {
    const set = new Set<string>();
    employes.forEach(e => (e.equipes_access ?? []).forEach(eq => set.add(`${e.etablissement_id}:${eq}`)));
    return set.size;
  }, [employes]);

  const handleInvite = useCallback(async (emp: Employe) => {
    if (!emp.email) return;
    setInvitingId(emp.id);
    const dbRole = emp.role === "group_admin" ? "group_admin" : "equipier";
    const res = await fetchApi("/api/admin/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: emp.email,
        displayName: `${emp.prenom} ${emp.nom}`,
        role: dbRole,
        etablissementsAccess: [emp.etablissement_id],
      }),
    });
    setInvitingId(null);
    if (res.ok) {
      setAuthEmails(prev => new Set([...prev, emp.email!.toLowerCase()]));
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Erreur lors de l'invitation");
    }
  }, []);

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px 60px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h1 style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 26, fontWeight: 700, letterSpacing: 1, color: "#1a1a1a" }}>
            Equipe
          </h1>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={() => {
              const url = etabFilter !== "all" ? `/api/rh/rup?etab=${etabFilter}` : "/api/rh/rup";
              window.open(url, "_blank");
            }} style={{
              display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", borderRadius: 10,
              border: "1px solid #ddd6c8", background: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", color: "#1a1a1a",
            }}>
              Registre Unique
            </button>
            <button type="button" onClick={() => setShowAddModal(true)} style={{
              display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", borderRadius: 10,
              background: "#1a1a1a", color: "#fff", border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer",
            }}>
              + Collaborateur
            </button>
          </div>
        </div>

        {/* Search */}
        <input
          type="text" placeholder="Rechercher par prenom, nom, matricule ou role"
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ ...INPUT, width: "100%", marginBottom: 12 }}
        />

        {/* Filters */}
        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          <select style={{ ...INPUT, width: "auto", minWidth: 250 }} value={etabFilter} onChange={e => setEtabFilter(e.target.value)}>
            <option value="all">Tous les etablissements ({etabs.length}) / Toutes les equipes ({totalEquipes})</option>
            {etabs.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
          </select>
          <select style={{ ...INPUT, width: "auto", minWidth: 180 }} value={contratFilter} onChange={e => setContratFilter(e.target.value)}>
            <option value="all">Tous les types de contrats</option>
            <option value="CDI">CDI</option>
            <option value="CDD">CDD</option>
            <option value="extra">Extra</option>
            <option value="apprenti">Apprenti</option>
          </select>
          <select style={{ ...INPUT, width: "auto", minWidth: 150 }} value={statutFilter} onChange={e => setStatutFilter(e.target.value)}>
            <option value="actif">Utilisateurs actifs</option>
            <option value="inactif">Utilisateurs inactifs</option>
            <option value="tous">Tous</option>
          </select>
          <select style={{ ...INPUT, width: "auto", minWidth: 130 }} value={sortBy} onChange={e => setSortBy(e.target.value)}>
            <option value="nom">Tri par nom</option>
            <option value="prenom">Tri par prenom</option>
          </select>
        </div>

        {/* Tile grid */}
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#999", fontSize: 13 }}>Chargement...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#999", fontSize: 13 }}>Aucun collaborateur trouve</div>
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 12,
          }}>
            {filtered.map(emp => {
              const hasAccess = emp.email && authEmails.has(emp.email.toLowerCase());
              const initials = emp.initiales ?? `${emp.prenom[0] ?? ""}${emp.nom[0] ?? ""}`.toUpperCase();
              return (
                <div
                  key={emp.id}
                  onClick={() => router.push(`/rh/employe/${emp.id}`)}
                  style={{
                    background: "#fff",
                    border: "1px solid #e0d8ce",
                    borderRadius: 14,
                    padding: 16,
                    cursor: "pointer",
                    display: "flex", flexDirection: "column", gap: 12,
                    boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                    transition: "box-shadow 0.15s, border-color 0.15s",
                  }}
                  onMouseOver={e => { e.currentTarget.style.borderColor = "#D4775A"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)"; }}
                  onMouseOut={e => { e.currentTarget.style.borderColor = "#e0d8ce"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.04)"; }}
                >
                  {/* Top: avatar + name + role */}
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{
                      width: 44, height: 44, borderRadius: "50%",
                      background: "#D4775A",
                      color: "#fff",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 14, fontWeight: 700,
                      fontFamily: "var(--font-oswald), Oswald, sans-serif",
                      flexShrink: 0,
                      overflow: "hidden",
                    }}>
                      {initials}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 14, fontWeight: 700, color: "#1a1a1a",
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      }}>
                        {emp.prenom} {emp.nom.toUpperCase()}
                      </div>
                      <div style={{ marginTop: 4 }}>{getRoleBadge(emp.role)}</div>
                    </div>
                  </div>

                  {/* Middle: contact + rattachement */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#666", paddingTop: 10, borderTop: "1px solid #f0ebe3" }}>
                    {emp.email && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                          <rect x="2" y="4" width="20" height="16" rx="2" />
                          <path d="M22 7l-10 7L2 7" />
                        </svg>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{emp.email}</span>
                      </div>
                    )}
                    {emp.tel_mobile && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                        </svg>
                        <span>{emp.tel_mobile}</span>
                      </div>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#999", fontSize: 11 }}>
                      <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                        <path d="M3 21h18" /><path d="M5 21V7l7-4 7 4v14" /><path d="M9 21v-6h6v6" />
                      </svg>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{getRattachement(emp)}</span>
                    </div>
                  </div>

                  {/* Bottom: access badge / invite */}
                  <div style={{ paddingTop: 10, borderTop: "1px solid #f0ebe3", display: "flex", justifyContent: "flex-end" }}>
                    {hasAccess ? (
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 5,
                        padding: "5px 12px", borderRadius: 999,
                        background: "rgba(45,106,79,0.10)", fontSize: 11, fontWeight: 700,
                        color: "#2D6A4F",
                        textTransform: "uppercase", letterSpacing: ".05em",
                      }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#2D6A4F" }} />
                        Acces actif
                      </span>
                    ) : emp.email ? (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleInvite(emp); }}
                        disabled={invitingId === emp.id}
                        style={{
                          padding: "6px 16px", borderRadius: 999, border: "none",
                          background: "#D4775A", color: "#fff", fontSize: 11, fontWeight: 700,
                          textTransform: "uppercase", letterSpacing: ".05em",
                          cursor: "pointer", opacity: invitingId === emp.id ? 0.5 : 1,
                        }}
                      >
                        {invitingId === emp.id ? "Envoi..." : "Inviter"}
                      </button>
                    ) : (
                      <span style={{ fontSize: 11, color: "#bbb", fontStyle: "italic" }}>Pas d&apos;email</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showAddModal && (
        <AddCollaborateurModal
          etablissementId={currentEtab?.id ?? etabs[0]?.id ?? ""}
          onClose={() => setShowAddModal(false)}
          onCreated={() => window.location.reload()}
        />
      )}
    </RequireRole>
  );
}
