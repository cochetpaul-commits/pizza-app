"use client";

import { useState, useEffect } from "react";
import { RequireRole } from "@/components/RequireRole";
import { useEtablissement } from "@/lib/EtablissementContext";
import { supabase } from "@/lib/supabaseClient";

type FinanceSettings = {
  food_cost_target: number | null;
  beverage_cost_target: number | null;
  charges_rate: number | null;
  tva_rate: number | null;
};

const LABEL = { fontSize: 11, fontWeight: 700 as const, color: "#999", textTransform: "uppercase" as const, letterSpacing: 0.5, marginBottom: 4 };
const CARD = { background: "#fff", borderRadius: 14, padding: 20, border: "1px solid #ddd6c8", marginBottom: 16 };
const INPUT: React.CSSProperties = { width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid #ddd6c8", fontSize: 14, boxSizing: "border-box" };

export default function SettingsFinancePage() {
  const { current: etab } = useEtablissement();
  const [settings, setSettings] = useState<FinanceSettings>({ food_cost_target: null, beverage_cost_target: null, charges_rate: null, tva_rate: null });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!etab) return;
    supabase
      .from("etablissements")
      .select("food_cost_target, beverage_cost_target, charges_rate, tva_rate")
      .eq("id", etab.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setSettings(data as FinanceSettings);
      });
  }, [etab]);

  const save = async (patch: Partial<FinanceSettings>) => {
    if (!etab) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    setSaving(true);
    setSaved(false);
    await supabase.from("etablissements").update(patch).eq("id", etab.id);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <div style={{ maxWidth: 700, margin: "0 auto", padding: "24px 16px 60px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h1 style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 22, fontWeight: 700, letterSpacing: 1, color: "#1a1a1a" }}>
            Gestion de la finance
          </h1>
          <span style={{ fontSize: 12, color: saving ? "#D4775A" : saved ? "#22c55e" : "#999" }}>
            {saving ? "Enregistrement..." : saved ? "Enregistre" : etab?.nom ?? ""}
          </span>
        </div>

        <div style={CARD}>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, color: "#1a1a1a" }}>Objectifs de couts</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <div style={LABEL}>Food cost cible (%)</div>
              <input
                type="number"
                style={INPUT}
                value={settings.food_cost_target ?? ""}
                onChange={e => save({ food_cost_target: e.target.value ? Number(e.target.value) : null })}
                placeholder="Ex: 30"
                step={0.5}
              />
            </div>
            <div>
              <div style={LABEL}>Beverage cost cible (%)</div>
              <input
                type="number"
                style={INPUT}
                value={settings.beverage_cost_target ?? ""}
                onChange={e => save({ beverage_cost_target: e.target.value ? Number(e.target.value) : null })}
                placeholder="Ex: 20"
                step={0.5}
              />
            </div>
          </div>
        </div>

        <div style={CARD}>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, color: "#1a1a1a" }}>Taux</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <div style={LABEL}>Charges patronales (%)</div>
              <input
                type="number"
                style={INPUT}
                value={settings.charges_rate ?? ""}
                onChange={e => save({ charges_rate: e.target.value ? Number(e.target.value) : null })}
                placeholder="Ex: 45"
                step={0.5}
              />
            </div>
            <div>
              <div style={LABEL}>TVA par defaut (%)</div>
              <input
                type="number"
                style={INPUT}
                value={settings.tva_rate ?? ""}
                onChange={e => save({ tva_rate: e.target.value ? Number(e.target.value) : null })}
                placeholder="Ex: 10"
                step={0.5}
              />
            </div>
          </div>
        </div>
      </div>
    </RequireRole>
  );
}
