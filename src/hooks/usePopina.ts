import { useState, useEffect, useCallback } from "react"

export type PopinaDataRange = {
  locationId: string; date_debut: string; date_fin: string
  total_ca_ht: number; total_ca_ttc: number; total_couverts: number; ticket_moyen: number
  par_jour: Array<{ locationId:string; date:string; ca_ht:number; ca_ttc:number; nb_couverts:number; ticket_moyen:number }>
}

export type ObjectifsEtab = {
  productivite_cible: number; ratio_ms_cible: number
  taux_charges_patronales: number; valeur_repas_an: number; taux_horaire_moyen: number
}

export const OBJECTIFS_BELLO_MIO: ObjectifsEtab = {
  productivite_cible:50, ratio_ms_cible:37, taux_charges_patronales:0.35, valeur_repas_an:3.57, taux_horaire_moyen:18.5
}

export type RatiosSemaine = {
  ca_ht: number|null; ca_ttc: number|null; nb_couverts: number|null; ticket_moyen: number|null
  heures_travaillees: number; cout_shifts_brut: number; cout_shifts_charges: number
  nb_repas: number; cout_repas_an: number
  productivite: number|null; ratio_masse_salariale: number|null; heures_supp: number
  alerte_productivite: boolean; alerte_masse_salariale: boolean
}

// Cache mémoire simple
const cache = new Map<string, PopinaDataRange>()

type UsePoinaParams = { locationId: string|null; dateDebut: string; dateFin: string; enabled?: boolean }
type UsePoinaResult = { data: PopinaDataRange|null; loading: boolean; error: string|null; refetch: () => void; isConfigured: boolean }

export function usePopina({ locationId, dateDebut, dateFin, enabled=true }: UsePoinaParams): UsePoinaResult {
  const [data,    setData]    = useState<PopinaDataRange|null>(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string|null>(null)
  const isConfigured = !!(locationId)

  const fetchData = useCallback(async () => {
    if (!isConfigured || !enabled) return
    const key = `${locationId}:${dateDebut}:${dateFin}`
    if (cache.has(key)) { setData(cache.get(key)!); return }
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/popina/ca?locationId=${locationId}&dateDebut=${dateDebut}&dateFin=${dateFin}`)
      if (!res.ok) throw new Error(`Erreur Popina : ${res.status}`)
      const json: PopinaDataRange = await res.json()
      cache.set(key, json); setData(json)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur inconnue"
      setError(msg); console.error("[usePopina]", msg)
    } finally { setLoading(false) }
  }, [locationId, dateDebut, dateFin, enabled, isConfigured])

  useEffect(() => { fetchData() }, [fetchData])

  return { data, loading, error, refetch: fetchData, isConfigured }
}

export function useRatiosSemaine({ popinaData, heures_travaillees, nb_repas, heures_supp, objectifs }: {
  popinaData: PopinaDataRange|null; heures_travaillees: number
  nb_repas: number; heures_supp: number; objectifs: ObjectifsEtab
}): RatiosSemaine {
  const { taux_horaire_moyen, taux_charges_patronales, valeur_repas_an, productivite_cible, ratio_ms_cible } = objectifs
  const cout_brut    = heures_travaillees * taux_horaire_moyen
  const cout_charges = Math.round(cout_brut * (1+taux_charges_patronales))
  const cout_repas   = Math.round(nb_repas * valeur_repas_an * 100)/100
  const ca_ht = popinaData?.total_ca_ht ?? null
  const productivite = ca_ht !== null && heures_travaillees > 0 ? Math.round(ca_ht/heures_travaillees*100)/100 : null
  const ratio_ms = ca_ht !== null && ca_ht > 0 ? Math.round(cout_charges/ca_ht*10000)/100 : null
  return {
    ca_ht, ca_ttc: popinaData?.total_ca_ttc??null, nb_couverts: popinaData?.total_couverts??null,
    ticket_moyen: popinaData?.ticket_moyen??null,
    heures_travaillees, cout_shifts_brut: Math.round(cout_brut), cout_shifts_charges: cout_charges,
    nb_repas, cout_repas_an: cout_repas, productivite, ratio_masse_salariale: ratio_ms, heures_supp,
    alerte_productivite:  productivite !== null && productivite < productivite_cible,
    alerte_masse_salariale: ratio_ms !== null && ratio_ms > ratio_ms_cible,
  }
}

export function invalidatePopinaCache(locationId?: string) {
  if (locationId) { for (const k of cache.keys()) if (k.startsWith(locationId)) cache.delete(k) }
  else cache.clear()
}

export function mockPopinaData(locationId: string, dateDebut: string, dateFin: string, caHtTotal=28500): PopinaDataRange {
  const days = ["2026-03-09","2026-03-10","2026-03-11","2026-03-12","2026-03-13","2026-03-14"]
  const w = [0.12,0.18,0.17,0.19,0.20,0.14]
  return {
    locationId, date_debut:dateDebut, date_fin:dateFin,
    total_ca_ht:caHtTotal, total_ca_ttc:Math.round(caHtTotal*1.1), total_couverts:Math.round(caHtTotal/32), ticket_moyen:32,
    par_jour: days.map((date,i) => ({ locationId, date, ca_ht:Math.round(caHtTotal*w[i]), ca_ttc:Math.round(caHtTotal*w[i]*1.1), nb_couverts:Math.round(caHtTotal*w[i]/32), ticket_moyen:32 }))
  }
}
