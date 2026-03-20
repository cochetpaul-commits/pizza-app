"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { RequireRole } from "@/components/RequireRole";

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

const CARD: React.CSSProperties = { background: "#fff", borderRadius: 14, border: "1px solid #ddd6c8" };
const LABEL: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 0.5 };
const INPUT: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "1px solid #ddd6c8", fontSize: 14, boxSizing: "border-box" };

export default function SettingsEmployesPage() {
  const router = useRouter();
  const [employes, setEmployes] = useState<Employe[]>([]);
  const [etabs, setEtabs] = useState<Etab[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [etabFilter, setEtabFilter] = useState("all");
  const [contratFilter, setContratFilter] = useState("all");
  const [statutFilter, setStatutFilter] = useState("actif");
  const [sortBy, setSortBy] = useState("nom");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [empRes, etabRes] = await Promise.all([
        supabase.from("employes").select("id, prenom, nom, initiales, email, tel_mobile, role, equipes_access, etablissement_id, actif, avatar_url").order("nom"),
        supabase.from("etablissements").select("id, nom, slug").eq("actif", true).order("nom"),
      ]);
      if (!cancelled) {
        setEmployes((empRes.data ?? []) as Employe[]);
        setEtabs((etabRes.data ?? []) as Etab[]);
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

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px 60px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h1 style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 26, fontWeight: 700, letterSpacing: 1, color: "#1a1a1a" }}>
            Equipe
          </h1>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" style={{
              display: "flex", alignItems: "center", gap: 6, padding: "10px 18px", borderRadius: 8,
              border: "1px solid #ddd6c8", background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", color: "#1a1a1a",
            }}>
              Registre Unique du Personnel
            </button>
            <button type="button" onClick={() => router.push("/rh/equipe")} style={{
              display: "flex", alignItems: "center", gap: 6, padding: "10px 18px", borderRadius: 8,
              background: "#1a1a1a", color: "#fff", border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>
              + Ajouter un collaborateur
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

        {/* Table */}
        <div style={CARD}>
          {loading ? (
            <div style={{ padding: 20, color: "#999", fontSize: 13 }}>Chargement...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 20, color: "#999", fontSize: 13 }}>Aucun collaborateur trouve</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #ddd6c8" }}>
                  <th style={{ ...LABEL, textAlign: "left", padding: "12px 16px" }}>Collaborateur</th>
                  <th style={{ ...LABEL, textAlign: "left", padding: "12px 8px" }}>Role</th>
                  <th style={{ ...LABEL, textAlign: "left", padding: "12px 8px" }}>Email</th>
                  <th style={{ ...LABEL, textAlign: "left", padding: "12px 8px" }}>Mobile</th>
                  <th style={{ ...LABEL, textAlign: "left", padding: "12px 8px" }}>Rattachement</th>
                  <th style={{ ...LABEL, textAlign: "left", padding: "12px 8px" }}>Invitation</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(emp => (
                  <tr
                    key={emp.id}
                    onClick={() => router.push(`/rh/employe/${emp.id}`)}
                    style={{ borderBottom: "1px solid #f0ebe3", cursor: "pointer" }}
                    onMouseOver={e => (e.currentTarget.style.background = "#f5f0e8")}
                    onMouseOut={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <td style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{
                        width: 32, height: 32, borderRadius: "50%",
                        background: emp.avatar_url ? "transparent" : "#ddd6c8",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 11, fontWeight: 700, color: "#1a1a1a", flexShrink: 0,
                        overflow: "hidden",
                      }}>
                        {emp.initiales ?? `${emp.prenom[0]}${emp.nom[0]}`.toUpperCase()}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#2563eb" }}>
                        {emp.prenom} {emp.nom.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: "12px 8px" }}>{getRoleBadge(emp.role)}</td>
                    <td style={{ padding: "12px 8px", fontSize: 12, color: "#1a1a1a" }}>{emp.email ?? "—"}</td>
                    <td style={{ padding: "12px 8px", fontSize: 12, color: "#1a1a1a" }}>{emp.tel_mobile ?? "Non renseigne"}</td>
                    <td style={{ padding: "12px 8px", fontSize: 12, color: "#666" }}>{getRattachement(emp)}</td>
                    <td style={{ padding: "12px 8px" }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: "#2D6A4F" }}>Acceptee</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </RequireRole>
  );
}
