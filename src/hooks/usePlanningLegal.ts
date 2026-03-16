import { useMemo } from "react"
import type { Shift, Employe, Contrat } from "@/lib/supabase"

// ── Types ────────────────────────────────────────────────────
export type Alerte = {
  type: "amplitude_max"|"repos_insuffisant"|"duree_max_jour"|"duree_max_semaine"
  employe_id: string; date: string; message: string
  valeur_constatee: number; valeur_max: number
}

export type BilanSemaine = {
  heures_travaillees: number; heures_normales: number; delta_contrat: number
  heures_supp_25: number; heures_supp_50: number
  heures_supp_10: number; heures_supp_20: number
  heures_comp_10: number; heures_comp_25: number
  rc_acquis: number; nb_repas: number; alertes: Alerte[]
}

export type BilanEmployeSemaine = {
  employe_id: string; nom: string; bilan: BilanSemaine
  heures_travaillees: number; delta_contrat: number; nb_repas: number
  has_alerte: boolean; nb_alertes: number
}

export type BilanSemainePlanning = {
  bilans: BilanEmployeSemaine[]
  total_heures: number; total_repas: number; total_heures_supp: number
  cout_estime: number
  alertes_par_jour: Array<{ date: string; jour_idx: number; alertes: Alerte[]; employes_ids: string[] }>
  employes_en_alerte: string[]
}

// ── Constantes HCR 1979 ──────────────────────────────────────
const R = { seuil_bas:35*60, seuil_haut:43*60, amp_max:13*60, repos_min:11*60, duree_j:10*60, duree_sem:48*60 }

// ── Moteur légal (inliné pour éviter dépendance circulaire) ──
const toMin = (t: string) => { const [h,m]=(t||"00:00").split(":").map(Number); return h*60+(m||0) }
const r2 = (n: number) => Math.round(n*100)/100

function dureeNette(d: string, f: string, p: number) {
  let fin=toMin(f); if(fin<=toMin(d)) fin+=1440; return Math.max(0,fin-toMin(d)-p)
}

function calculerBilanHCR(parJour: Map<string, Shift[]>, contratH: number, empId: string, empNom: string): BilanSemaine {
  const alertes: Alerte[] = []
  let totalMin=0, nb_repas=0
  const dates = Array.from(parJour.keys()).sort()

  for (const date of dates) {
    const jour = parJour.get(date)!
    const debuts = jour.map(s => toMin(s.heure_debut))
    const fins   = jour.map(s => { let f=toMin(s.heure_fin); if(f<=toMin(s.heure_debut)) f+=1440; return f })
    const amp = Math.max(...fins)-Math.min(...debuts)
    if (amp > R.amp_max) alertes.push({ type:"amplitude_max", employe_id:empId, date,
      message:`${empNom} — amplitude ${Math.floor(amp/60)}h${String(amp%60).padStart(2,"0")} (max 13h HCR)`,
      valeur_constatee:amp, valeur_max:R.amp_max })
    const dureeJ = jour.reduce((a,s) => a+dureeNette(s.heure_debut,s.heure_fin,s.pause_minutes),0)
    if (dureeJ > R.duree_j) alertes.push({ type:"duree_max_jour", employe_id:empId, date,
      message:`${empNom} — ${Math.floor(dureeJ/60)}h${String(dureeJ%60).padStart(2,"0")} net (max 10h)`,
      valeur_constatee:dureeJ, valeur_max:R.duree_j })
    totalMin += dureeJ; nb_repas += jour.length
  }

  for (let i=0; i<dates.length-1; i++) {
    const [d1,d2] = [dates[i],dates[i+1]]
    if ((new Date(d2).getTime()-new Date(d1).getTime())/86400000 !== 1) continue
    const j1=parJour.get(d1)!, j2=parJour.get(d2)!
    if (!j1.length||!j2.length) continue
    const dernierFin  = Math.max(...j1.map(s=>{let f=toMin(s.heure_fin);if(f<=toMin(s.heure_debut))f+=1440;return f}))
    const premierDeb  = Math.min(...j2.map(s=>toMin(s.heure_debut)))+1440
    const repos = premierDeb-dernierFin
    if (repos < R.repos_min) alertes.push({ type:"repos_insuffisant", employe_id:empId, date:d2,
      message:`${empNom} — repos ${Math.floor(repos/60)}h${String(repos%60).padStart(2,"0")} (min 11h)`,
      valeur_constatee:repos, valeur_max:R.repos_min })
  }

  if (totalMin > R.duree_sem) alertes.push({ type:"duree_max_semaine", employe_id:empId, date:dates[0]||"",
    message:`${empNom} — ${Math.floor(totalMin/60)}h semaine (max 48h)`,
    valeur_constatee:totalMin, valeur_max:R.duree_sem })

  const contractMin = contratH*60
  const supp25 = totalMin>R.seuil_bas ? Math.min(totalMin,R.seuil_haut)-R.seuil_bas : 0
  const supp50 = totalMin>R.seuil_haut ? totalMin-R.seuil_haut : 0

  return {
    heures_travaillees: r2(totalMin/60), heures_normales: r2(Math.min(totalMin,contractMin)/60),
    delta_contrat: r2((totalMin-contractMin)/60),
    heures_supp_25: r2(supp25/60), heures_supp_50: r2(supp50/60),
    heures_supp_10:0, heures_supp_20:0, heures_comp_10:0, heures_comp_25:0,
    rc_acquis: supp50>0 ? r2(supp50/60*0.5) : 0, nb_repas, alertes,
  }
}

// ── Hook principal ───────────────────────────────────────────
type Params = {
  employes: (Employe & { contrat_actif: Contrat|null })[]
  shifts: Shift[]; lundiISO: string
  convention: "HCR_1979"|"RAPIDE_1501"
  tauxHoraire: number; tauxCharges: number
}

export function usePlanningLegal({ employes, shifts, lundiISO, tauxHoraire, tauxCharges }: Params): BilanSemainePlanning {
  return useMemo(() => {
    const bilans: BilanEmployeSemaine[] = []
    const alertesMap = new Map<string, { alertes: Alerte[]; ids: Set<string> }>()

    // Init map 7 jours
    for (let i=0; i<7; i++) {
      const d = new Date(lundiISO); d.setDate(d.getDate()+i)
      alertesMap.set(d.toISOString().split("T")[0], { alertes:[], ids:new Set() })
    }

    const lundiMs = new Date(lundiISO).getTime()
    const dimancheStr = new Date(lundiMs+6*86400000).toISOString().split("T")[0]

    for (const emp of employes) {
      const contrat = emp.contrat_actif; if (!contrat) continue
      const mesShifts = shifts.filter(s => s.employe_id===emp.id && s.date>=lundiISO && s.date<=dimancheStr)
      if (!mesShifts.length) continue

      const parJour = new Map<string, Shift[]>()
      for (const s of mesShifts) {
        if (!parJour.has(s.date)) parJour.set(s.date,[])
        parJour.get(s.date)!.push(s)
      }

      const bilan = calculerBilanHCR(parJour, contrat.heures_semaine, emp.id, `${emp.prenom} ${emp.nom}`)

      for (const a of bilan.alertes) {
        const entry = alertesMap.get(a.date)
        if (entry) { entry.alertes.push(a); entry.ids.add(emp.id) }
      }

      bilans.push({ employe_id:emp.id, nom:`${emp.prenom} ${emp.nom}`, bilan,
        heures_travaillees:bilan.heures_travaillees, delta_contrat:bilan.delta_contrat,
        nb_repas:bilan.nb_repas, has_alerte:bilan.alertes.length>0, nb_alertes:bilan.alertes.length })
    }

    const alertes_par_jour = Array.from(alertesMap.entries())
      .filter(([,v]) => v.alertes.length>0)
      .map(([date,v]) => ({ date, jour_idx:Math.round((new Date(date).getTime()-lundiMs)/86400000), alertes:v.alertes, employes_ids:Array.from(v.ids) }))

    const total_heures      = bilans.reduce((a,b)=>a+b.heures_travaillees,0)
    const total_repas       = bilans.reduce((a,b)=>a+b.nb_repas,0)
    const total_heures_supp = bilans.reduce((a,b)=>a+b.bilan.heures_supp_25+b.bilan.heures_supp_50,0)
    const cout_estime       = Math.round(total_heures*tauxHoraire*(1+tauxCharges))

    return { bilans, total_heures, total_repas, total_heures_supp, cout_estime,
      alertes_par_jour, employes_en_alerte:bilans.filter(b=>b.has_alerte).map(b=>b.employe_id) }
  }, [employes, shifts, lundiISO, tauxHoraire, tauxCharges])
}

export function useBilanEmploye(bilans: BilanEmployeSemaine[], employeId: string) {
  return useMemo(() => bilans.find(b => b.employe_id===employeId), [bilans, employeId])
}
