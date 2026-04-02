import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";

export type Settings = {
  id: string;
  convention: string;
  code_ape: string | null;
  siret: string | null;
  medecin_travail: string | null;
  adresse: string | null;
  pause_defaut_minutes: number;
  objectif_cout_ventes: number;
  objectif_productivite: number;
  cotisations_patronales: number;
  ajouter_cp_taux_horaire: boolean;
  base_calcul_cp: number;
  acquisition_mensuelle_cp: number;
  type_indemnisation_repas: string;
  valeur_avantage_nature: number;
  taux_accident_travail: number;
  taux_horaire_moyen: number;
};

const DEFAULTS: Omit<Settings, "id"> = {
  convention: "HCR_1979",
  code_ape: null,
  siret: null,
  medecin_travail: null,
  adresse: null,
  pause_defaut_minutes: 30,
  objectif_cout_ventes: 37,
  objectif_productivite: 50,
  cotisations_patronales: 35,
  ajouter_cp_taux_horaire: false,
  base_calcul_cp: 6,
  acquisition_mensuelle_cp: 2.5,
  type_indemnisation_repas: "AN",
  valeur_avantage_nature: 3.57,
  taux_accident_travail: 2.5,
  taux_horaire_moyen: 12.5,
};

// ── useSettings ──────────────────────────────────────────────────────────

export function useSettings(etablissementId: string | null) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [draft, setDraft] = useState<Partial<Settings>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialRef = useRef<Settings | null>(null);

  useEffect(() => {
    if (!etablissementId) { setSettings(null); setLoading(false); return; } // eslint-disable-line react-hooks/set-state-in-effect
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error: err } = await supabase
        .from("etablissements")
        .select("id, convention, code_ape, siret, medecin_travail, adresse, pause_defaut_minutes, objectif_cout_ventes, objectif_productivite, cotisations_patronales, ajouter_cp_taux_horaire, base_calcul_cp, acquisition_mensuelle_cp, type_indemnisation_repas, valeur_avantage_nature, taux_accident_travail, taux_horaire_moyen")
        .eq("id", etablissementId)
        .single();
      if (cancelled) return;
      if (err) { setError(err.message); setLoading(false); return; }
      const s = { ...DEFAULTS, ...(data as Settings) };
      setSettings(s);
      initialRef.current = s;
      setDraft({});
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [etablissementId]);

  const values = { ...settings, ...draft } as Settings;
  const isDirty = Object.keys(draft).length > 0;

  const update = useCallback((patch: Partial<Settings>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  }, []);

  const save = useCallback(async () => {
    if (!etablissementId || !isDirty) return;
    setSaving(true);
    setError(null);
    const { error: err } = await supabase
      .from("etablissements")
      .update(draft)
      .eq("id", etablissementId);
    if (err) { setError(err.message); setSaving(false); return; }
    const merged = { ...settings, ...draft } as Settings;
    setSettings(merged);
    initialRef.current = merged;
    setDraft({});
    setSaving(false);
  }, [etablissementId, isDirty, draft, settings]);

  const reset = useCallback(() => {
    setDraft({});
  }, []);

  return { settings, draft, loading, saving, error, isDirty, values, update, save, reset };
}

// ── useConvention ────────────────────────────────────────────────────────

export function useConvention(etablissementId: string | null): "HCR_1979" | "RAPIDE_1501" {
  const { settings } = useSettings(etablissementId);
  return (settings?.convention === "RAPIDE_1501" ? "RAPIDE_1501" : "HCR_1979");
}

// ── useObjectifs ─────────────────────────────────────────────────────────

export function useObjectifs(etablissementId: string | null) {
  const { values, loading } = useSettings(etablissementId);
  return {
    loading,
    ratio_ms: values?.objectif_cout_ventes ?? 37,
    productivite: values?.objectif_productivite ?? 50,
    charges: values?.cotisations_patronales ?? 35,
    taux_at: values?.taux_accident_travail ?? 2.5,
    taux_horaire: values?.taux_horaire_moyen ?? 12.5,
    cp_dans_taux: values?.ajouter_cp_taux_horaire ?? false,
    repas_an: values?.valeur_avantage_nature ?? 3.57,
    taux_cout: 1 + (values?.cotisations_patronales ?? 35) / 100,
  };
}

// ── useParamsCP ──────────────────────────────────────────────────────────

export function useParamsCP(etablissementId: string | null) {
  const { values, loading } = useSettings(etablissementId);
  return {
    loading,
    base: values?.base_calcul_cp ?? 6,
    mensuel: values?.acquisition_mensuelle_cp ?? 2.5,
    annuel: (values?.acquisition_mensuelle_cp ?? 2.5) * 12,
  };
}
