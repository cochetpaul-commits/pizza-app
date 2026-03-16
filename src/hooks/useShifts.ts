import { useState, useEffect, useCallback, useMemo } from "react"
import { supabase, type Shift, supabaseError } from "@/lib/supabase"

type CreateShiftInput = {
  employe_id: string; etablissement_id: string; poste_id?: string|null
  date: string; heure_debut: string; heure_fin: string; pause_minutes: number
  note?: string|null; statut?: Shift["statut"]
}

type DuplicationOpts = {
  etablissement_id: string; sourceLundi: string; targetLundi: string
  employes_ids?: string[]; statut_cible: Shift["statut"]; ecraser_existants: boolean
}

type UseShiftsResult = {
  shifts: Shift[]
  byEmployeDay: Record<string, Record<string, Shift[]>>
  loading: boolean; error: string|null
  refetch: () => Promise<void>
  createShift:  (data: CreateShiftInput) => Promise<Shift|null>
  updateShift:  (id: string, data: Partial<Shift>) => Promise<boolean>
  deleteShift:  (id: string) => Promise<boolean>
  publishWeek:  (dateDebut: string, dateFin: string) => Promise<number>
  dupliquerSemaine: (opts: DuplicationOpts) => Promise<number>
}

export function useShifts(etablissementId: string|null, dateDebut: string, dateFin: string): UseShiftsResult {
  const [shifts,  setShifts]  = useState<Shift[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string|null>(null)

  const fetchShifts = useCallback(async () => {
    if (!etablissementId) { setLoading(false); return }
    setLoading(true); setError(null)
    const { data, error } = await supabase.from("shifts").select("*")
      .eq("etablissement_id", etablissementId).gte("date", dateDebut).lte("date", dateFin)
      .order("date").order("heure_debut")
    setLoading(false)
    if (error) { setError(supabaseError(error)); return }
    setShifts((data||[]) as Shift[])
  }, [etablissementId, dateDebut, dateFin])

  useEffect(() => { fetchShifts() }, [fetchShifts])

  useEffect(() => {
    if (!etablissementId) return
    const channel = supabase.channel(`shifts:${etablissementId}:${dateDebut}:${dateFin}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "shifts", filter: `etablissement_id=eq.${etablissementId}` },
        payload => {
          if (payload.eventType === "INSERT") {
            const s = payload.new as Shift
            if (s.date >= dateDebut && s.date <= dateFin)
              setShifts(prev => [...prev, s].sort((a,b) => a.date.localeCompare(b.date)||a.heure_debut.localeCompare(b.heure_debut)))
          } else if (payload.eventType === "UPDATE") {
            setShifts(prev => prev.map(s => s.id === payload.new.id ? payload.new as Shift : s))
          } else if (payload.eventType === "DELETE") {
            setShifts(prev => prev.filter(s => s.id !== payload.old.id))
          }
        })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [etablissementId, dateDebut, dateFin])

  const byEmployeDay = useMemo(() => {
    const idx: Record<string, Record<string, Shift[]>> = {}
    for (const s of shifts) {
      if (!idx[s.employe_id]) idx[s.employe_id] = {}
      if (!idx[s.employe_id][s.date]) idx[s.employe_id][s.date] = []
      idx[s.employe_id][s.date].push(s)
    }
    return idx
  }, [shifts])

  const createShift = useCallback(async (data: CreateShiftInput): Promise<Shift|null> => {
    const { data: shift, error } = await supabase.from("shifts")
      .insert({ ...data, statut: data.statut ?? "brouillon" }).select().single()
    if (error) { setError(supabaseError(error)); return null }
    return shift as Shift
  }, [])

  const updateShift = useCallback(async (id: string, data: Partial<Shift>): Promise<boolean> => {
    const { error } = await supabase.from("shifts").update(data).eq("id", id)
    if (error) { setError(supabaseError(error)); return false }
    return true
  }, [])

  const deleteShift = useCallback(async (id: string): Promise<boolean> => {
    const { error } = await supabase.from("shifts").delete().eq("id", id)
    if (error) { setError(supabaseError(error)); return false }
    return true
  }, [])

  const publishWeek = useCallback(async (debut: string, fin: string): Promise<number> => {
    const { data, error } = await supabase.from("shifts")
      .update({ statut: "publié" as const })
      .eq("etablissement_id", etablissementId!).eq("statut", "brouillon")
      .gte("date", debut).lte("date", fin)
      .select("id")
    const count = data?.length ?? 0
    if (error) { setError(supabaseError(error)); return 0 }
    return count ?? 0
  }, [etablissementId])

  const dupliquerSemaine = useCallback(async (opts: DuplicationOpts): Promise<number> => {
    const { sourceLundi, targetLundi, employes_ids, statut_cible, ecraser_existants, etablissement_id } = opts
    const addDays = (d: string, n: number) => { const dt = new Date(d); dt.setDate(dt.getDate()+n); return dt.toISOString().split("T")[0] }
    const sourceDim = addDays(sourceLundi, 6), targetDim = addDays(targetLundi, 6)

    let q = supabase.from("shifts").select("*").eq("etablissement_id", etablissement_id).gte("date", sourceLundi).lte("date", sourceDim)
    if (employes_ids?.length) q = q.in("employe_id", employes_ids)
    const { data: src } = await q
    if (!src?.length) return 0

    let existingKeys = new Set<string>()
    if (!ecraser_existants) {
      const { data: ex } = await supabase.from("shifts").select("employe_id,date")
        .eq("etablissement_id", etablissement_id).gte("date", targetLundi).lte("date", targetDim)
      existingKeys = new Set((ex||[]).map((s: { employe_id: string; date: string }) => `${s.employe_id}:${s.date}`))
    }

    const lundi = new Date(sourceLundi)
    const nouveaux = (src as Shift[]).map(s => {
      const offset = Math.round((new Date(s.date).getTime() - lundi.getTime()) / 86400000)
      const newDate = addDays(targetLundi, offset)
      if (!ecraser_existants && existingKeys.has(`${s.employe_id}:${newDate}`)) return null
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, created_at, heures_reelles_debut, heures_reelles_fin, pause_reelle_minutes, ...rest } = s
      return { ...rest, date: newDate, statut: statut_cible, heures_reelles_debut: null, heures_reelles_fin: null, pause_reelle_minutes: null }
    }).filter(Boolean)

    if (!nouveaux.length) return 0
    let inserted = 0
    for (let i = 0; i < nouveaux.length; i += 100) {
      const { data: ins } = await supabase.from("shifts").insert(nouveaux.slice(i, i+100) as Shift[]).select("id")
      const count = ins?.length ?? 0
      inserted += count ?? 0
    }
    return inserted
  }, [])

  return { shifts, byEmployeDay, loading, error, refetch: fetchShifts, createShift, updateShift, deleteShift, publishWeek, dupliquerSemaine }
}
