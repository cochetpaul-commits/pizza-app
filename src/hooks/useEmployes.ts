import { useState, useEffect, useCallback } from "react"
import { supabase, type Employe, type Contrat, supabaseError } from "@/lib/supabase"

export type EmployeAvecContrat = Employe & { contrat_actif: Contrat|null }

type CreateEmployeInput = {
  etablissement_id: string; prenom: string; nom: string
  email?: string; tel_mobile?: string; matricule?: string
  contrat?: { type: Contrat["type"]; date_debut: string; heures_semaine: number; remuneration: number; emploi?: string }
}

type UseEmployesResult = {
  employes: EmployeAvecContrat[]; loading: boolean; error: string|null
  refetch: () => Promise<void>
  create: (data: CreateEmployeInput) => Promise<Employe|null>
  update: (id: string, data: Partial<Employe>) => Promise<boolean>
  archive: (id: string) => Promise<boolean>
}

export function useEmployes(etablissementId: string|null): UseEmployesResult {
  const [employes, setEmployes] = useState<EmployeAvecContrat[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string|null>(null)

  const fetchEmployes = useCallback(async () => {
    if (!etablissementId) { setLoading(false); return }
    setLoading(true); setError(null)
    const { data, error } = await supabase
      .from("employes").select(`*, contrats(id,type,date_debut,date_fin,remuneration,emploi,qualification,heures_semaine,jours_semaine,actif)`)
      .eq("etablissement_id", etablissementId).eq("actif", true).order("nom")
    setLoading(false)
    if (error) { setError(supabaseError(error)); return }
    setEmployes((data||[]).map((emp: Record<string, unknown>) => {
      const contrats = (emp.contrats as Contrat[])||[]
      const contrat_actif = contrats.find(c => c.actif) ?? null
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { contrats: _, ...rest } = emp
      return { ...rest, contrat_actif } as EmployeAvecContrat
    }))
  }, [etablissementId])

  useEffect(() => { fetchEmployes() }, [fetchEmployes])

  useEffect(() => {
    if (!etablissementId) return
    const channel = supabase.channel(`employes:${etablissementId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "employes", filter: `etablissement_id=eq.${etablissementId}` }, () => fetchEmployes())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [etablissementId, fetchEmployes])

  const create = useCallback(async (input: CreateEmployeInput): Promise<Employe|null> => {
    const { contrat, ...empData } = input
    const { data: emp, error: empErr } = await supabase.from("employes").insert(empData).select().single()
    if (empErr || !emp) { if (empErr) setError(supabaseError(empErr)); return null }
    if (contrat) await supabase.from("contrats").insert({ ...contrat, employe_id: (emp as Employe).id, actif: true })
    await fetchEmployes()
    return emp as Employe
  }, [fetchEmployes])

  const update = useCallback(async (id: string, data: Partial<Employe>): Promise<boolean> => {
    const { error } = await supabase.from("employes").update(data).eq("id", id)
    if (error) { setError(supabaseError(error)); return false }
    await fetchEmployes(); return true
  }, [fetchEmployes])

  const archive = useCallback(async (id: string) => update(id, { actif: false }), [update])

  return { employes, loading, error, refetch: fetchEmployes, create, update, archive }
}

// ── Contrats ─────────────────────────────────────────────────
type UseContratsResult = {
  contrats: Contrat[]; loading: boolean; error: string|null
  create: (data: Omit<Contrat, "id"|"created_at">) => Promise<boolean>
  update: (id: string, data: Partial<Contrat>) => Promise<boolean>
  clore:  (id: string, dateFin: string) => Promise<boolean>
}

export function useContrats(employeId: string|null): UseContratsResult {
  const [contrats, setContrats] = useState<Contrat[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string|null>(null)

  const fetchContrats = useCallback(async () => {
    if (!employeId) { setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase.from("contrats").select("*").eq("employe_id", employeId).order("date_debut", { ascending: false })
    setLoading(false)
    if (error) { setError(supabaseError(error)); return }
    setContrats((data||[]) as Contrat[])
  }, [employeId])

  useEffect(() => { fetchContrats() }, [fetchContrats])

  const create = useCallback(async (data: Omit<Contrat, "id"|"created_at">): Promise<boolean> => {
    if (data.actif) await supabase.from("contrats").update({ actif: false }).eq("employe_id", data.employe_id).eq("actif", true)
    const { error } = await supabase.from("contrats").insert(data)
    if (error) { setError(supabaseError(error)); return false }
    await fetchContrats(); return true
  }, [fetchContrats])

  const update = useCallback(async (id: string, data: Partial<Contrat>): Promise<boolean> => {
    const { error } = await supabase.from("contrats").update(data).eq("id", id)
    if (error) { setError(supabaseError(error)); return false }
    await fetchContrats(); return true
  }, [fetchContrats])

  const clore = useCallback(async (id: string, dateFin: string) => update(id, { date_fin: dateFin, actif: false }), [update])

  return { contrats, loading, error, create, update, clore }
}
