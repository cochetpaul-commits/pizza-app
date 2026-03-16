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
