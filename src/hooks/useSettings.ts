import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { supabase, supabaseError } from "@/lib/supabase"
import { useAuth } from "./useAuth"

export type Settings = {
  id: string; etablissement_id: string
  convention: "HCR_1979"|"RAPIDE_1501"
  code_ape: string|null; siret: string|null; medecin_travail: string|null; adresse: string|null
  pause_defaut_minutes: number; duree_min_pause_auto_h: number
  objectif_ratio_ms: number; objectif_productivite: number
  cp_base: "ouvrables"|"ouvres"; cp_acquisition_mensuelle: number
  cp_periode_debut: string; cp_periode_fin: string
  repas_type: "AN"|"IR"|"TR"|"PP"; repas_valeur_an: number
  charges_patronales: number; taux_accident_travail: number
  taux_horaire_moyen: number; cp_dans_taux: boolean
  popina_location_id: string|null; updated_at: string; updated_by: string|null; created_at: string
}

export const SETTINGS_DEFAULTS: Omit<Settings,"id"|"etablissement_id"|"updated_at"|"updated_by"|"created_at"> = {
  convention:"HCR_1979", code_ape:null, siret:null, medecin_travail:null, adresse:null,
  pause_defaut_minutes:30, duree_min_pause_auto_h:3,
  objectif_ratio_ms:37, objectif_productivite:50,
  cp_base:"ouvrables", cp_acquisition_mensuelle:2.5, cp_periode_debut:"06-01", cp_periode_fin:"05-31",
  repas_type:"AN", repas_valeur_an:3.57,
  charges_patronales:35, taux_accident_travail:2.50, taux_horaire_moyen:18.5, cp_dans_taux:true,
  popina_location_id:null,
}

type UseSettingsResult = {
  settings: Settings|null; draft: Partial<Settings>; loading: boolean; saving: boolean
  error: string|null; isDirty: boolean; values: Settings
  update: (patch: Partial<Settings>) => void
  save: () => Promise<boolean>
  reset: () => void
}

export function useSettings(etablissementId: string|null): UseSettingsResult {
  const { user } = useAuth()
  const [settings, setSettings] = useState<Settings|null>(null)
  const [draft,    setDraft]    = useState<Partial<Settings>>({})
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState<string|null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>|null>(null)

  const createDefaults = useCallback(async (etabId: string) => {
    const { data, error } = await supabase.from("settings_etablissement")
      .insert({ etablissement_id:etabId, ...SETTINGS_DEFAULTS }).select().single()
    if (error) { setError(supabaseError(error)); return }
    setSettings(data as Settings); setDraft({})
  }, [])

  const fetchSettings = useCallback(async () => {
    if (!etablissementId) { setLoading(false); return }
    setLoading(true); setError(null)
    const { data, error } = await supabase.from("settings_etablissement").select("*")
      .eq("etablissement_id", etablissementId).single()
    setLoading(false)
    if (error) { if (error.code==="PGRST116") { await createDefaults(etablissementId); return } setError(supabaseError(error)); return }
    setSettings(data as Settings); setDraft({})
  }, [etablissementId, createDefaults])

  useEffect(() => { fetchSettings() }, [fetchSettings])

  const values = useMemo((): Settings => {
    const base: Settings = settings ?? { id:"local", etablissement_id:etablissementId??"",
      updated_at:new Date().toISOString(), updated_by:null, created_at:new Date().toISOString(), ...SETTINGS_DEFAULTS }
    return { ...base, ...draft }
  }, [settings, draft, etablissementId])

  const update = useCallback((patch: Partial<Settings>) => {
    setDraft(prev => ({ ...prev, ...patch }))
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      if (!settings?.id || !user?.id) return
      await supabase.from("settings_etablissement").update({ ...patch, updated_by:user.id }).eq("id", settings.id)
    }, 800)
  }, [settings, user])

  const save = useCallback(async (): Promise<boolean> => {
    if (!etablissementId || !user?.id) return false
    if (!Object.keys(draft).length && settings) return true
    setSaving(true); setError(null)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const payload = { ...draft, updated_by:user.id }
    let data: Settings|null = null, saveErr: string|null = null
    if (settings?.id) {
      const res = await supabase.from("settings_etablissement").update(payload).eq("id", settings.id).select().single()
      data=res.data as Settings; if (res.error) saveErr = supabaseError(res.error)
    } else {
      const res = await supabase.from("settings_etablissement").insert({ etablissement_id:etablissementId, ...SETTINGS_DEFAULTS, ...draft }).select().single()
      data=res.data as Settings; if (res.error) saveErr = supabaseError(res.error)
    }
    setSaving(false)
    if (saveErr) { setError(saveErr); return false }
    setSettings(data); setDraft({}); return true
  }, [etablissementId, draft, settings, user])

  const reset = useCallback(() => { if (debounceRef.current) clearTimeout(debounceRef.current); setDraft({}) }, [])

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current) }, [])

  return { settings, draft, loading, saving, error, isDirty:Object.keys(draft).length>0, values, update, save, reset }
}

// ── Hooks dérivés ────────────────────────────────────────────
export function useConvention(etablissementId: string|null) {
  const { values } = useSettings(etablissementId); return values.convention
}

export function useObjectifs(etablissementId: string|null) {
  const { values } = useSettings(etablissementId)
  return {
    ratio_ms:     values.objectif_ratio_ms,
    productivite: values.objectif_productivite,
    charges:      values.charges_patronales/100,
    taux_at:      values.taux_accident_travail/100,
    taux_horaire: values.taux_horaire_moyen,
    cp_dans_taux: values.cp_dans_taux,
    repas_an:     values.repas_valeur_an,
    taux_cout:    (values.charges_patronales+values.taux_accident_travail)/100+(values.cp_dans_taux?0.10:0),
  }
}

export function useParamsCP(etablissementId: string|null) {
  const { values } = useSettings(etablissementId)
  return {
    base:          values.cp_base,
    mensuel:       values.cp_acquisition_mensuelle,
    annuel:        values.cp_acquisition_mensuelle*12,
    periode_debut: values.cp_periode_debut,
    periode_fin:   values.cp_periode_fin,
  }
}
