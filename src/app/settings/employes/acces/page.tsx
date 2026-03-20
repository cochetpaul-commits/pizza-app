"use client";

import { useState, useEffect } from "react";
import { RequireRole } from "@/components/RequireRole";
import { useEtablissement } from "@/lib/EtablissementContext";
import { supabase } from "@/lib/supabaseClient";

type Employe = {
  id: string;
  prenom: string;
  nom: string;
  actif: boolean;
};

const MODULES = [
  { key: "planning", label: "Planning", icon: "calendar" },
  { key: "pilotage", label: "Pilotage", icon: "chart" },
  { key: "finance", label: "Finance", icon: "wallet" },
  { key: "stock", label: "Stock", icon: "box" },
  { key: "commandes", label: "Commandes", icon: "cart" },
  { key: "recettes", label: "Recettes", icon: "book" },
];

const CARD = { background: "#fff", borderRadius: 14, padding: 20, border: "1px solid #ddd6c8", marginBottom: 16 };
const LABEL = { fontSize: 11, fontWeight: 700 as const, color: "#999", textTransform: "uppercase" as const, letterSpacing: 0.5 };

function CheckIcon({ checked }: { checked: boolean }) {
  return (
    <div style={{
      width: 22, height: 22, borderRadius: 6,
      background: checked ? "#2D6A4F" : "#f0ebe3",
      display: "flex", alignItems: "center", justifyContent: "center",
      cursor: "pointer", transition: "background 0.15s",
    }}>
      {checked && (
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </div>
  );
}

export default function SettingsAccesPage() {
  const { current: etab } = useEtablissement();
  const [employes, setEmployes] = useState<Employe[]>([]);
  const [accesMap, setAccesMap] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!etab) return;
    let cancelled = false;
    Promise.all([
      supabase
        .from("employes")
        .select("id, prenom, nom, actif")
        .eq("etablissement_id", etab.id)
        .eq("actif", true)
        .order("nom"),
      supabase
        .from("employes")
        .select("id, modules_access")
        .eq("etablissement_id", etab.id)
        .eq("actif", true),
    ]).then(([empRes, accRes]) => {
      setEmployes((empRes.data ?? []) as Employe[]);
      const map: Record<string, string[]> = {};
      for (const row of (accRes.data ?? []) as { id: string; modules_access: string[] | null }[]) {
        map[row.id] = row.modules_access ?? [];
      }
      if (!cancelled) {
        setAccesMap(map);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [etab]);

  const toggleModule = async (empId: string, moduleKey: string) => {
    const current = accesMap[empId] ?? [];
    const next = current.includes(moduleKey)
      ? current.filter(m => m !== moduleKey)
      : [...current, moduleKey];
    setAccesMap(prev => ({ ...prev, [empId]: next }));
    await supabase.from("employes").update({ modules_access: next }).eq("id", empId);
  };

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px 60px" }}>
        <h1 style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 22, fontWeight: 700, letterSpacing: 1, marginBottom: 8, color: "#1a1a1a" }}>
          Acces application
        </h1>
        <p style={{ fontSize: 13, color: "#999", marginBottom: 20 }}>
          Definir les modules accessibles par employe pour <strong style={{ color: "#1a1a1a" }}>{etab?.nom ?? ""}</strong>
        </p>

        <div style={CARD}>
          {loading ? (
            <p style={{ color: "#999", fontSize: 13 }}>Chargement...</p>
          ) : employes.length === 0 ? (
            <p style={{ color: "#999", fontSize: 13 }}>Aucun employe actif</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #ddd6c8" }}>
                    <th style={{ ...LABEL, textAlign: "left", padding: "8px 8px 8px 0", minWidth: 140 }}>Employe</th>
                    {MODULES.map(m => (
                      <th key={m.key} style={{ ...LABEL, textAlign: "center", padding: "8px 4px", minWidth: 70 }}>{m.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {employes.map(emp => (
                    <tr key={emp.id} style={{ borderBottom: "1px solid #f0ebe3" }}>
                      <td style={{ padding: "10px 8px 10px 0", fontWeight: 600 }}>
                        {emp.prenom} {emp.nom}
                      </td>
                      {MODULES.map(m => {
                        const has = (accesMap[emp.id] ?? []).includes(m.key);
                        return (
                          <td key={m.key} style={{ textAlign: "center", padding: "10px 4px" }}>
                            <div style={{ display: "inline-block" }} onClick={() => toggleModule(emp.id, m.key)}>
                              <CheckIcon checked={has} />
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </RequireRole>
  );
}
