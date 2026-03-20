"use client";

import { useState, useEffect } from "react";
import { RequireRole } from "@/components/RequireRole";
import { useEtablissement } from "@/lib/EtablissementContext";
import { supabase } from "@/lib/supabaseClient";

type PointeuseSettings = {
  pointeuse_enabled: boolean;
  pointeuse_tolerance_minutes: number;
  pointeuse_auto_pause: boolean;
  pointeuse_geoloc: boolean;
};

const LABEL = { fontSize: 11, fontWeight: 700 as const, color: "#999", textTransform: "uppercase" as const, letterSpacing: 0.5, marginBottom: 4 };
const CARD = { background: "#fff", borderRadius: 14, padding: 20, border: "1px solid #ddd6c8", marginBottom: 16 };
const INPUT: React.CSSProperties = { width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid #ddd6c8", fontSize: 14, boxSizing: "border-box" };

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      style={{
        width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer",
        background: value ? "#2D6A4F" : "#ddd6c8",
        position: "relative", transition: "background 0.2s",
      }}
    >
      <span style={{
        position: "absolute", top: 2, left: value ? 22 : 2,
        width: 20, height: 20, borderRadius: "50%", background: "#fff",
        transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
      }} />
    </button>
  );
}

export default function SettingsPointeusePage() {
  const { current: etab } = useEtablissement();
  const [settings, setSettings] = useState<PointeuseSettings>({
    pointeuse_enabled: false,
    pointeuse_tolerance_minutes: 5,
    pointeuse_auto_pause: true,
    pointeuse_geoloc: false,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!etab) return;
    supabase
      .from("etablissements")
      .select("pointeuse_enabled, pointeuse_tolerance_minutes, pointeuse_auto_pause, pointeuse_geoloc")
      .eq("id", etab.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setSettings(prev => ({ ...prev, ...data }));
      });
  }, [etab]);

  const save = async (patch: Partial<PointeuseSettings>) => {
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

  const row: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid #f0ebe3" };

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <div style={{ maxWidth: 700, margin: "0 auto", padding: "24px 16px 60px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h1 style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 22, fontWeight: 700, letterSpacing: 1, color: "#1a1a1a" }}>
            Pointeuse
          </h1>
          <span style={{ fontSize: 12, color: saving ? "#D4775A" : saved ? "#22c55e" : "#999" }}>
            {saving ? "Enregistrement..." : saved ? "Enregistre" : etab?.nom ?? ""}
          </span>
        </div>

        <div style={CARD}>
          <div style={row}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>Activer la pointeuse</div>
              <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>Les employes peuvent pointer leurs heures</div>
            </div>
            <Toggle value={settings.pointeuse_enabled} onChange={v => save({ pointeuse_enabled: v })} />
          </div>

          <div style={row}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>Pause automatique</div>
              <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>Deduire la pause du shift automatiquement</div>
            </div>
            <Toggle value={settings.pointeuse_auto_pause} onChange={v => save({ pointeuse_auto_pause: v })} />
          </div>

          <div style={row}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>Geolocalisation</div>
              <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>Verifier la position au pointage</div>
            </div>
            <Toggle value={settings.pointeuse_geoloc} onChange={v => save({ pointeuse_geoloc: v })} />
          </div>

          <div style={{ ...row, borderBottom: "none" }}>
            <div>
              <div style={LABEL}>Tolerance (minutes)</div>
              <div style={{ fontSize: 12, color: "#999" }}>Ecart accepte avant/apres l&apos;heure prevue</div>
            </div>
            <input
              type="number"
              style={{ ...INPUT, width: 80, textAlign: "center" }}
              value={settings.pointeuse_tolerance_minutes}
              onChange={e => save({ pointeuse_tolerance_minutes: Number(e.target.value) || 0 })}
              min={0}
              max={60}
            />
          </div>
        </div>
      </div>
    </RequireRole>
  );
}
