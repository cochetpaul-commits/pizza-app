import { useCallback } from "react"
import type { Shift } from "@/lib/supabase"

export type OutilsEmploye = { id: string; prenom: string; nom: string; matricule: string; etablissement: string; equipe: string; heures_semaine: number }
export type PosteInfo = { nom: string; couleur: string; emoji?: string; equipe: string }

export type DuplicationOptions = {
  sourceWeekMonday: string; targetWeekMonday: string
  employes_ids?: string[]; statut_cible: "brouillon"|"publié"; ecraser_existants: boolean
}

export type FeuillePdfOptions = {
  type: "hebdo"|"mensuel"; dateDebut: string; dateFin: string
  employes: OutilsEmploye[]; shifts: Shift[]; postes: Record<string,PosteInfo>
  etablissementNom: string; modeHeures: "planifiees"|"reelles"
}

export type LignePresence = {
  date: string; jour: string; prevu: string; emarge: string; reel: string
  etablissement: string; equipe: string; ecart: string
  temps_travail_h: string; temps_travail_dec: string; repas: string; estFerie: boolean
}

export type TotauxPresence = {
  heures_planifiees_h: string; heures_planifiees_dec: string
  heures_travaillees_h: string; heures_travaillees_dec: string
  total_repas: number; nb_jours_travailles: number; heures_contractuelles: string
}

// ── Utilitaires ──────────────────────────────────────────────
const toMin = (t: string) => { const [h,m]=(t||"00:00").split(":").map(Number); return h*60+(m||0) }
const fmtHH = (m: number) => `${Math.floor(m/60)}h${String(m%60).padStart(2,"0")}`

function addDays(d: string, n: number) {
  const dt = new Date(d); dt.setDate(dt.getDate()+n); return dt.toISOString().split("T")[0]
}
function fmtDate(s: string) { const [y,m,d]=s.split("-"); return `${d}/${m}/${y}` }

const JOURS_FERIES_2026 = new Set(["2026-01-01","2026-04-06","2026-05-01","2026-05-08","2026-05-14","2026-05-25","2026-07-14","2026-08-15","2026-11-01","2026-11-11","2026-12-25"])
const JOURS_FR = ["Dim.","Lun.","Mar.","Mer.","Jeu.","Ven.","Sam."]

function dureeNette(d: string, f: string, p: number) {
  let fin=toMin(f); if(fin<=toMin(d)) fin+=1440; return Math.max(0,fin-toMin(d)-p)
}

// ── Duplication ──────────────────────────────────────────────
export function dupliquerSemaine(shifts: Shift[], opts: DuplicationOptions): Shift[] {
  const { sourceWeekMonday, targetWeekMonday, employes_ids, statut_cible, ecraser_existants } = opts
  const srcEnd = addDays(sourceWeekMonday, 6), tgtEnd = addDays(targetWeekMonday, 6)
  const src = shifts.filter(s => s.date>=sourceWeekMonday && s.date<=srcEnd && (!employes_ids?.length || employes_ids.includes(s.employe_id)))
  const existingKeys = ecraser_existants ? new Set<string>()
    : new Set(shifts.filter(s => s.date>=targetWeekMonday && s.date<=tgtEnd).map(s => `${s.employe_id}:${s.date}`))

  const lundi = new Date(sourceWeekMonday)
  return src.map(s => {
    const offset = Math.round((new Date(s.date).getTime()-lundi.getTime())/86400000)
    const newDate = addDays(targetWeekMonday, offset)
    if (!ecraser_existants && existingKeys.has(`${s.employe_id}:${newDate}`)) return null
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, created_at, heures_reelles_debut, heures_reelles_fin, pause_reelle_minutes, ...rest } = s
    return { ...rest, date:newDate, statut:statut_cible as Shift["statut"], heures_reelles_debut:null, heures_reelles_fin:null, pause_reelle_minutes:null } as unknown as Shift
  }).filter((s): s is Shift => s !== null)
}

// ── Feuilles de présence ─────────────────────────────────────
export function genererLignesPresence(employe: OutilsEmploye, opts: FeuillePdfOptions): LignePresence[] {
  const { dateDebut, dateFin, shifts, modeHeures } = opts
  const mesShifts = shifts.filter(s => s.employe_id===employe.id && s.date>=dateDebut && s.date<=dateFin).sort((a,b) => a.date.localeCompare(b.date))
  const parDate = new Map<string, Shift[]>()
  for (const s of mesShifts) { if (!parDate.has(s.date)) parDate.set(s.date,[]); parDate.get(s.date)!.push(s) }

  const lignes: LignePresence[] = []
  let cursor = dateDebut
  while (cursor <= dateFin) {
    const dayShifts = parDate.get(cursor)||[]
    const estFerie = JOURS_FERIES_2026.has(cursor)
    const jourLabel = JOURS_FR[new Date(cursor).getDay()]
    if (!dayShifts.length) {
      lignes.push({ date:fmtDate(cursor), jour:jourLabel, prevu:estFerie?"Jour férié":"Repos",
        emarge:"—", reel:"—", etablissement:employe.etablissement, equipe:employe.equipe,
        ecart:"—", temps_travail_h:"0h00", temps_travail_dec:"0.00", repas:"—", estFerie })
    } else {
      dayShifts.forEach((s,si) => {
        const hasReel = !!(s.heures_reelles_debut && s.heures_reelles_fin)
        const durMin = modeHeures==="reelles" && hasReel
          ? dureeNette(s.heures_reelles_debut!, s.heures_reelles_fin!, s.pause_reelle_minutes??s.pause_minutes)
          : dureeNette(s.heure_debut, s.heure_fin, s.pause_minutes)
        const ecart = hasReel
          ? dureeNette(s.heures_reelles_debut!,s.heures_reelles_fin!,s.pause_reelle_minutes??s.pause_minutes) - dureeNette(s.heure_debut,s.heure_fin,s.pause_minutes)
          : 0
        lignes.push({
          date: si===0 ? fmtDate(cursor) : "",
          jour: si===0 ? jourLabel : "",
          prevu: `${s.heure_debut.replace(":","h")}–${s.heure_fin.replace(":","h")} (${s.pause_minutes}mn)`,
          emarge: "—",
          reel: hasReel ? `${s.heures_reelles_debut!.replace(":","h")}–${s.heures_reelles_fin!.replace(":","h")}` : "—",
          etablissement: employe.etablissement, equipe: employe.equipe,
          ecart: ecart===0 ? "0mn" : `${ecart>0?"+":""}${ecart}mn`,
          temps_travail_h: fmtHH(durMin), temps_travail_dec: (durMin/60).toFixed(2),
          repas: "1 AN", estFerie,
        })
      })
    }
    cursor = addDays(cursor, 1)
  }
  return lignes
}

export function calculerTotaux(lignes: LignePresence[], heuresSemaine: number): TotauxPresence {
  const travMin = lignes.reduce((a,l) => a+parseFloat(l.temps_travail_dec)*60, 0)
  const repas = lignes.filter(l => l.repas==="1 AN").length
  const jours = lignes.filter(l => l.prevu!=="Repos" && l.prevu!=="Jour férié" && l.date!=="").length
  const contrat = heuresSemaine*52/12
  return {
    heures_planifiees_h: fmtHH(travMin), heures_planifiees_dec: (travMin/60).toFixed(2),
    heures_travaillees_h: fmtHH(travMin), heures_travaillees_dec: (travMin/60).toFixed(2),
    total_repas: repas, nb_jours_travailles: jours,
    heures_contractuelles: `${fmtHH(Math.round(contrat*60))} / ${contrat.toFixed(2)}`,
  }
}

// ── Hook ─────────────────────────────────────────────────────
export function useOutils() {
  const dupliquer = useCallback((shifts: Shift[], opts: DuplicationOptions) => dupliquerSemaine(shifts, opts), [])
  const genererFeuille = useCallback((employe: OutilsEmploye, opts: FeuillePdfOptions) => {
    const lignes = genererLignesPresence(employe, opts)
    return { lignes, totaux: calculerTotaux(lignes, employe.heures_semaine) }
  }, [])
  const genererFeuillesGroupe = useCallback((opts: FeuillePdfOptions) =>
    opts.employes.map(emp => ({ employe: emp, ...genererLignesPresence(emp, opts) })), [])
  return { dupliquer, genererFeuille, genererFeuillesGroupe }
}
