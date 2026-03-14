"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { NavBar } from "@/components/NavBar";
import { TopNav } from "@/components/TopNav";
import { useProfile } from "@/lib/ProfileContext";
import { supabase } from "@/lib/supabaseClient";

type Employe = {
  id: string;
  prenom: string;
  nom: string;
  initiales: string | null;
  matricule: string | null;
  equipe_access: string[];
  role: string;
  poste_rh: string | null;
  contrat_type: string | null;
  heures_semaine: number | null;
  actif: boolean;
  email: string | null;
  tel_mobile: string | null;
};

type FilterEquipe = "Tous" | "Cuisine" | "Salle";

const EQUIPE_COLORS: Record<string, string> = {
  Cuisine: "#E74C3C",
  Salle: "#A9CCE3",
};

const CONTRAT_LABELS: Record<string, { label: string; color: string }> = {
  CDI: { label: "CDI", color: "#4a6741" },
  CDD: { label: "CDD", color: "#D4775A" },
  extra: { label: "Extra", color: "#A0845C" },
  TNS: { label: "TNS", color: "#9B8EC4" },
  interim: { label: "Intérim", color: "#95A5A6" },
  apprenti: { label: "Apprenti", color: "#F4D03F" },
  stagiaire: { label: "Stagiaire", color: "#B8D4E8" },
};

export default function EquipePage() {
  const { canWrite } = useProfile();
  const [employes, setEmployes] = useState<Employe[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterEquipe>("Tous");
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function fetchEmployes() {
      const { data, error } = await supabase
        .from("employes")
        .select("id, prenom, nom, initiales, matricule, equipe_access, role, poste_rh, contrat_type, heures_semaine, actif, email, tel_mobile")
        .eq("actif", true)
        .order("nom", { ascending: true });

      if (error) {
        console.error("[EquipePage] fetch error:", error.message);
      }
      setEmployes(data ?? []);
      setLoading(false);
    }
    fetchEmployes();
  }, []);

  const filtered = employes.filter((e) => {
    if (filter !== "Tous" && !e.equipe_access?.includes(filter)) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        e.prenom.toLowerCase().includes(q) ||
        e.nom.toLowerCase().includes(q) ||
        (e.matricule ?? "").includes(q) ||
        (e.poste_rh ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const countCuisine = employes.filter(e => e.equipe_access?.includes("Cuisine")).length;
  const countSalle = employes.filter(e => e.equipe_access?.includes("Salle")).length;

  return (
    <>
      <NavBar backHref="/" backLabel="Accueil" />
      <main style={{ maxWidth: 700, margin: "0 auto", padding: "0 16px 40px" }}>
        <TopNav
          title="ÉQUIPE"
          subtitle={`${employes.length} collaborateurs actifs`}
          eyebrow="Ressources humaines"
        />

        {/* Filtres + recherche */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          {(["Tous", "Cuisine", "Salle"] as FilterEquipe[]).map((f) => {
            const count = f === "Tous" ? employes.length : f === "Cuisine" ? countCuisine : countSalle;
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                style={{
                  padding: "6px 14px",
                  borderRadius: 20,
                  border: filter === f ? "2px solid #D4775A" : "1px solid #ddd6c8",
                  background: filter === f ? "rgba(212,119,90,0.08)" : "#fff",
                  fontSize: 12,
                  fontWeight: 700,
                  color: filter === f ? "#D4775A" : "#666",
                  cursor: "pointer",
                  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
                  letterSpacing: 1,
                  textTransform: "uppercase",
                }}
              >
                {f} <span style={{ fontWeight: 400, opacity: 0.7 }}>({count})</span>
              </button>
            );
          })}

          <input
            type="text"
            placeholder="Rechercher..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: 1,
              minWidth: 120,
              padding: "6px 12px",
              borderRadius: 20,
              border: "1px solid #ddd6c8",
              fontSize: 12,
              background: "#fff",
              outline: "none",
            }}
          />
        </div>

        {/* Bouton ajouter */}
        {canWrite && (
          <div style={{ marginBottom: 16 }}>
            <button
              type="button"
              style={{
                width: "100%",
                padding: "12px 16px",
                borderRadius: 12,
                border: "2px dashed #ddd6c8",
                background: "transparent",
                fontSize: 13,
                fontWeight: 700,
                color: "#D4775A",
                cursor: "pointer",
                letterSpacing: 0.5,
              }}
            >
              + Ajouter un collaborateur
            </button>
          </div>
        )}

        {/* Liste */}
        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#999", fontSize: 13 }}>
            Chargement...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "#999", fontSize: 13 }}>
            Aucun collaborateur trouvé.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {filtered.map((emp) => (
              <EmployeRow key={emp.id} employe={emp} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}

function EmployeRow({ employe }: { employe: Employe }) {
  const e = employe;
  const contrat = CONTRAT_LABELS[e.contrat_type ?? ""] ?? { label: e.contrat_type, color: "#999" };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 14px",
        background: "#fff",
        borderRadius: 12,
        border: "1px solid #ece6db",
        transition: "box-shadow 0.15s",
        cursor: "pointer",
      }}
    >
      {/* Avatar / Initiales */}
      <div style={{
        width: 40,
        height: 40,
        borderRadius: "50%",
        background: e.role === "proprietaire" ? "linear-gradient(135deg, #9B8EC4, #7B6FA4)" : "linear-gradient(135deg, #D4775A, #C4674A)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 14,
        fontWeight: 700,
        color: "#fff",
        flexShrink: 0,
        fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
      }}>
        {e.initiales ?? (e.prenom[0] + e.nom[0]).toUpperCase()}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{
            fontSize: 14,
            fontWeight: 700,
            color: "#1a1a1a",
          }}>
            {e.prenom} {e.nom}
          </span>

          {/* Badge contrat */}
          <span style={{
            fontSize: 9,
            fontWeight: 700,
            padding: "2px 7px",
            borderRadius: 6,
            background: `${contrat.color}14`,
            color: contrat.color,
            border: `1px solid ${contrat.color}30`,
          }}>
            {contrat.label}
          </span>

          {/* Badge équipe */}
          {e.equipe_access?.map((eq) => (
            <span key={eq} style={{
              fontSize: 9,
              fontWeight: 600,
              padding: "2px 7px",
              borderRadius: 6,
              background: `${EQUIPE_COLORS[eq] ?? "#999"}14`,
              color: EQUIPE_COLORS[eq] ?? "#999",
              border: `1px solid ${EQUIPE_COLORS[eq] ?? "#999"}30`,
            }}>
              {eq}
            </span>
          ))}
        </div>

        <div style={{
          fontSize: 11,
          color: "#999",
          marginTop: 2,
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
        }}>
          {e.poste_rh && <span>{e.poste_rh}</span>}
          {e.matricule && <span style={{ color: "#ccc" }}>#{e.matricule}</span>}
          {e.heures_semaine && <span>{e.heures_semaine}h/sem</span>}
        </div>
      </div>

      {/* Flèche */}
      <span style={{ color: "#ccc", fontSize: 16, flexShrink: 0 }}>›</span>
    </div>
  );
}
