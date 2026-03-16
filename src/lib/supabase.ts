import { createClient, type AuthError } from "@supabase/supabase-js"

// ── Client Supabase (browser) ───────────────────────────────────────────────

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage:
        typeof window !== "undefined" && window?.localStorage
          ? window.localStorage
          : undefined,
    },
  }
)

// ── Types ────────────────────────────────────────────────────────────────────

export type Role = "admin" | "direction" | "cuisine"

export type Profile = {
  id: string
  role: Role
  display_name: string | null
  is_group_admin: boolean
  etablissements_access: string[]
  created_at: string
  updated_at: string
}

export type Shift = {
  id: string
  employe_id: string
  etablissement_id: string
  poste_id: string | null
  date: string
  heure_debut: string
  heure_fin: string
  pause_minutes: number
  note: string | null
  statut: "brouillon" | "publié" | "validé"
  heures_reelles_debut: string | null
  heures_reelles_fin: string | null
  pause_reelle_minutes: number | null
  created_at: string
}

export type Employe = {
  id: string
  etablissement_id: string
  prenom: string
  nom: string
  initiales: string | null
  email: string | null
  tel_mobile: string | null
  tel_fixe: string | null
  adresse: string | null
  code_postal: string | null
  ville: string | null
  genre: string | null
  date_naissance: string | null
  lieu_naissance: string | null
  departement_naissance: string | null
  nationalite: string
  situation_familiale: string | null
  nb_personnes_charge: number
  contact_urgence_prenom: string | null
  contact_urgence_nom: string | null
  contact_urgence_lien: string | null
  contact_urgence_tel: string | null
  numero_secu: string | null
  handicap: boolean
  type_handicap: string | null
  date_visite_medicale: string | null
  visite_renforcee: boolean
  prochaine_visite_medicale: string | null
  iban: string | null
  bic: string | null
  titulaire_compte: string | null
  matricule: string | null
  date_anciennete: string | null
  travailleur_etranger: boolean
  avatar_url: string | null
  actif: boolean
  equipe_access: string[]
  role: "employe" | "manager" | "proprietaire"
  poste_rh: string | null
  contrat_type: "CDI" | "CDD" | "extra" | "interim" | "apprenti" | "stagiaire" | "TNS" | null
  heures_semaine: number | null
  nom_usage: string | null
  civilite: "M" | "Mme" | null
  created_at: string
}

export type Contrat = {
  id: string
  employe_id: string
  type: "CDI" | "CDD" | "extra" | "interim" | "apprenti" | "stagiaire"
  date_debut: string
  date_fin: string | null
  remuneration: number
  emploi: string | null
  qualification: string | null
  heures_semaine: number
  jours_semaine: number
  actif: boolean
  created_at: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const ERROR_MESSAGES: Record<string, string> = {
  "Invalid login credentials": "Email ou mot de passe incorrect",
  "Email not confirmed": "Adresse email non confirmée",
  "User not found": "Utilisateur introuvable",
  "Email rate limit exceeded": "Trop de tentatives — réessayez plus tard",
}

export function supabaseError(err: AuthError | { message: string }): string {
  return ERROR_MESSAGES[err.message] ?? err.message
}
