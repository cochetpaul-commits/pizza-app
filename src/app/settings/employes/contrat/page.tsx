"use client";

import { useState, useEffect } from "react";
import { RequireRole } from "@/components/RequireRole";
import { useEtablissement } from "@/lib/EtablissementContext";
import { supabase } from "@/lib/supabaseClient";

type ContratType = {
  id: string;
  label: string;
  type: string;
  heures_semaine: number;
  convention: string;
  actif: boolean;
};

const CARD = { background: "#fff", borderRadius: 14, padding: 20, border: "1px solid #ddd6c8", marginBottom: 16 };
const LABEL = { fontSize: 11, fontWeight: 700 as const, color: "#999", textTransform: "uppercase" as const, letterSpacing: 0.5, marginBottom: 4 };

const CONVENTIONS: Record<string, string> = {
  HCR_1979: "HCR - IDCC 1979",
  RAPIDE_1501: "Restauration rapide - IDCC 1501",
};

const TYPES_CONTRAT = ["CDI", "CDD", "Apprentissage", "Stage", "TNS", "Extra"];

export default function SettingsContratPage() {
  const { current: etab } = useEtablissement();
  const [contrats, setContrats] = useState<ContratType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!etab) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("contrats")
        .select("id, label, type, heures_semaine, convention, actif")
        .eq("etablissement_id", etab.id)
        .order("type");
      if (!cancelled) {
        setContrats((data ?? []) as ContratType[]);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [etab]);

  const convention = (etab as { convention?: string })?.convention ?? "HCR_1979";

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <div style={{ maxWidth: 700, margin: "0 auto", padding: "24px 16px 60px" }}>
        <h1 style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 22, fontWeight: 700, letterSpacing: 1, marginBottom: 8, color: "#1a1a1a" }}>
          Contrats
        </h1>
        <p style={{ fontSize: 13, color: "#999", marginBottom: 20 }}>
          Convention applicable : <strong style={{ color: "#1a1a1a" }}>{CONVENTIONS[convention] ?? convention}</strong>
        </p>

        <div style={CARD}>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, color: "#1a1a1a" }}>Types de contrat</h2>

          {loading ? (
            <p style={{ color: "#999", fontSize: 13 }}>Chargement...</p>
          ) : contrats.length === 0 ? (
            <div>
              <p style={{ color: "#999", fontSize: 13, marginBottom: 16 }}>
                Les types de contrat sont definis automatiquement lors de la creation des employes.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {TYPES_CONTRAT.map(t => (
                  <span key={t} style={{
                    padding: "6px 14px", borderRadius: 20,
                    background: "rgba(45,106,79,0.08)", color: "#2D6A4F",
                    fontSize: 12, fontWeight: 600,
                  }}>
                    {t}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #ddd6c8" }}>
                  <th style={{ ...LABEL, textAlign: "left", padding: "8px 0" }}>Type</th>
                  <th style={{ ...LABEL, textAlign: "left", padding: "8px 0" }}>Heures/sem</th>
                  <th style={{ ...LABEL, textAlign: "left", padding: "8px 0" }}>Convention</th>
                  <th style={{ ...LABEL, textAlign: "center", padding: "8px 0" }}>Actif</th>
                </tr>
              </thead>
              <tbody>
                {contrats.map(c => (
                  <tr key={c.id} style={{ borderBottom: "1px solid #f0ebe3" }}>
                    <td style={{ padding: "10px 0", fontWeight: 600 }}>{c.type}{c.label ? ` — ${c.label}` : ""}</td>
                    <td style={{ padding: "10px 0" }}>{c.heures_semaine}h</td>
                    <td style={{ padding: "10px 0", color: "#999" }}>{CONVENTIONS[c.convention] ?? c.convention}</td>
                    <td style={{ padding: "10px 0", textAlign: "center" }}>
                      <span style={{
                        width: 8, height: 8, borderRadius: "50%", display: "inline-block",
                        background: c.actif ? "#22c55e" : "#ddd6c8",
                      }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={CARD}>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: "#1a1a1a" }}>Seuils horaires</h2>
          <p style={{ fontSize: 13, color: "#999", marginBottom: 12 }}>
            Definis par la convention collective. Non modifiables.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            {[
              { label: "Seuil HS 10%", value: "35h" },
              { label: "Seuil HS 20%", value: "39h" },
              { label: "Seuil HS 50%", value: "43h" },
            ].map(s => (
              <div key={s.label} style={{ padding: 12, borderRadius: 8, background: "#faf7f2", textAlign: "center" }}>
                <div style={{ fontSize: 11, color: "#999", fontWeight: 600, marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#1a1a1a" }}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </RequireRole>
  );
}
