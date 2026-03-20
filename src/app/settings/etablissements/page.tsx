"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { RequireRole } from "@/components/RequireRole";
import { supabase } from "@/lib/supabaseClient";

type Etab = {
  id: string;
  nom: string;
  slug: string;
  adresse: string | null;
  actif: boolean;
  couleur: string | null;
};

type Poste = { etablissement_id: string; equipe: string };

const CARD: React.CSSProperties = { background: "#fff", borderRadius: 14, border: "1px solid #ddd6c8" };
const LABEL: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 0.5 };
const INPUT: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "1px solid #ddd6c8", fontSize: 14, width: 260, boxSizing: "border-box" };

export default function EtablissementsListPage() {
  const router = useRouter();
  const [etabs, setEtabs] = useState<Etab[]>([]);
  const [postes, setPostes] = useState<Poste[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"actifs" | "inactifs" | "tous">("actifs");
  const [showCreate, setShowCreate] = useState(false);
  const [newNom, setNewNom] = useState("");
  const [newAdresse, setNewAdresse] = useState("");
  const [newConvention, setNewConvention] = useState("HCR_1979");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [etabRes, postesRes] = await Promise.all([
        supabase.from("etablissements").select("id, nom, slug, adresse, actif, couleur").order("nom"),
        supabase.from("postes").select("etablissement_id, equipe").eq("actif", true),
      ]);
      if (!cancelled) {
        setEtabs((etabRes.data ?? []) as Etab[]);
        setPostes((postesRes.data ?? []) as Poste[]);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    let list = etabs;
    if (filter === "actifs") list = list.filter(e => e.actif);
    else if (filter === "inactifs") list = list.filter(e => !e.actif);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(e => e.nom.toLowerCase().includes(s) || (e.adresse ?? "").toLowerCase().includes(s));
    }
    return list;
  }, [etabs, filter, search]);

  const equipesFor = (etabId: string): string[] => {
    const set = new Set<string>();
    postes.filter(p => p.etablissement_id === etabId).forEach(p => set.add(p.equipe));
    return Array.from(set).sort();
  };

  const handleCreate = async () => {
    if (!newNom.trim()) return;
    setCreating(true);
    const slug = newNom.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const { data, error } = await supabase.from("etablissements").insert({
      nom: newNom.trim(),
      slug,
      adresse: newAdresse.trim() || null,
      convention: newConvention,
      actif: true,
    }).select().single();
    if (data && !error) {
      router.push(`/settings/etablissements/${data.id}`);
    } else {
      alert(error?.message ?? "Erreur lors de la creation");
      setCreating(false);
    }
  };

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px 60px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
          <div>
            <h1 style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 26, fontWeight: 700, letterSpacing: 1, color: "#1a1a1a", marginBottom: 6 }}>
              Etablissements
            </h1>
            <p style={{ fontSize: 13, color: "#999", maxWidth: 600, lineHeight: 1.5 }}>
              Parametrez chacun de vos etablissements : convention collective, regles d&apos;attribution des repas, objectifs de productivite, etc.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "10px 18px", borderRadius: 8,
              background: "#1a1a1a", color: "#fff", border: "none",
              fontSize: 13, fontWeight: 600, cursor: "pointer",
              whiteSpace: "nowrap", flexShrink: 0,
            }}
          >
            + Ajouter un etablissement
          </button>
        </div>

        {/* Search + filter */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, margin: "20px 0 16px" }}>
          <input
            type="text"
            placeholder="Rechercher un etablissement"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ ...INPUT, color: "#D4775A" }}
          />
          <select
            value={filter}
            onChange={e => setFilter(e.target.value as typeof filter)}
            style={{ ...INPUT, width: 200 }}
          >
            <option value="actifs">Etablissements actifs</option>
            <option value="inactifs">Etablissements inactifs</option>
            <option value="tous">Tous</option>
          </select>
        </div>

        {/* Table */}
        <div style={CARD}>
          {loading ? (
            <div style={{ padding: 20, color: "#999", fontSize: 13 }}>Chargement...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 20, color: "#999", fontSize: 13 }}>Aucun etablissement trouve</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #ddd6c8" }}>
                  <th style={{ ...LABEL, textAlign: "left", padding: "12px 16px" }}>Etablissement</th>
                  <th style={{ ...LABEL, textAlign: "left", padding: "12px 16px" }}>Adresse</th>
                  <th style={{ ...LABEL, textAlign: "left", padding: "12px 16px" }}>Equipes</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(etab => (
                  <tr
                    key={etab.id}
                    onClick={() => router.push(`/settings/etablissements/${etab.id}`)}
                    style={{ borderBottom: "1px solid #f0ebe3", cursor: "pointer" }}
                    onMouseOver={e => (e.currentTarget.style.background = "#f5f0e8")}
                    onMouseOut={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <td style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{
                        width: 32, height: 32, borderRadius: 8,
                        background: etab.couleur ?? "#ddd6c8",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 14, color: "#fff", fontWeight: 700,
                        flexShrink: 0,
                      }}>
                        {etab.nom.charAt(0)}
                      </span>
                      <span style={{ fontSize: 14, fontWeight: 600, color: "#2563eb", cursor: "pointer" }}>
                        {etab.nom}
                      </span>
                    </td>
                    <td style={{ padding: "14px 16px", fontSize: 13, color: "#1a1a1a", lineHeight: 1.4 }}>
                      {etab.adresse ?? "—"}
                    </td>
                    <td style={{ padding: "14px 16px" }}>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {equipesFor(etab.id).map(eq => (
                          <span key={eq} style={{
                            padding: "3px 10px", borderRadius: 4,
                            background: "#f0ebe3", fontSize: 12, fontWeight: 500, color: "#1a1a1a",
                          }}>
                            {eq}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal: Creer un etablissement */}
      {showCreate && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 16 }}
          onClick={() => setShowCreate(false)}
        >
          <div style={{ background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 480, boxShadow: "0 12px 40px rgba(0,0,0,0.15)" }}
            onClick={e => e.stopPropagation()}
          >
            <h2 style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 18, fontWeight: 700, marginBottom: 16, color: "#1a1a1a" }}>
              Nouvel etablissement
            </h2>
            <div style={{ marginBottom: 12 }}>
              <div style={{ ...LABEL, marginBottom: 4 }}>Nom</div>
              <input style={{ ...INPUT, width: "100%" }} value={newNom} onChange={e => setNewNom(e.target.value)} placeholder="Ex: Trattoria Da Luigi" />
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ ...LABEL, marginBottom: 4 }}>Adresse</div>
              <input style={{ ...INPUT, width: "100%" }} value={newAdresse} onChange={e => setNewAdresse(e.target.value)} placeholder="Adresse complete" />
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ ...LABEL, marginBottom: 4 }}>Convention collective</div>
              <select style={{ ...INPUT, width: "100%" }} value={newConvention} onChange={e => setNewConvention(e.target.value)}>
                <option value="HCR_1979">HCR - IDCC 1979</option>
                <option value="RAPIDE_1501">Restauration rapide - IDCC 1501</option>
              </select>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setShowCreate(false)} style={{ padding: "8px 18px", borderRadius: 8, border: "1px solid #ddd6c8", background: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", color: "#1a1a1a" }}>
                Annuler
              </button>
              <button type="button" onClick={handleCreate} disabled={creating || !newNom.trim()} style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: "#1a1a1a", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: creating ? 0.5 : 1 }}>
                {creating ? "Creation..." : "Creer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </RequireRole>
  );
}
