"use client"

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react"
import { supabase, supabaseError, type Profile } from "@/lib/supabase"
import type { Session, User } from "@supabase/supabase-js"

type AuthState = { session: Session|null; user: User|null; profile: Profile|null; loading: boolean; error: string|null }
type AuthActions = { signInWithEmail: (email: string, password: string) => Promise<string|null>; signOut: () => Promise<void>; refreshProfile: () => Promise<void> }
type AuthCtxValue = AuthState & AuthActions

const AuthCtx = createContext<AuthCtxValue|null>(null)

export function useAuth(): AuthCtxValue {
  const ctx = useContext(AuthCtx)
  if (!ctx) throw new Error("useAuth doit être utilisé dans <AuthProvider>")
  return ctx
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session,  setSession]  = useState<Session|null>(null)
  const [user,     setUser]     = useState<User|null>(null)
  const [profile,  setProfile]  = useState<Profile|null>(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string|null>(null)

  const loadProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single()
    if (error) { setError(error.message); return }
    setProfile(data as Profile)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session); setUser(session?.user ?? null)
      if (session?.user) loadProfile(session.user.id).finally(() => setLoading(false))
      else setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session); setUser(session?.user ?? null)
      if (session?.user) await loadProfile(session.user.id)
      else setProfile(null)
    })
    return () => subscription.unsubscribe()
  }, [loadProfile])

  const signInWithEmail = useCallback(async (email: string, password: string): Promise<string|null> => {
    setLoading(true); setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) { const msg = error.message === "Invalid login credentials" ? "Email ou mot de passe incorrect" : supabaseError(error); setError(msg); return msg }
    return null
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setSession(null); setUser(null); setProfile(null)
  }, [])

  const refreshProfile = useCallback(async () => {
    if (user?.id) await loadProfile(user.id)
  }, [user, loadProfile])

  return (
    <AuthCtx.Provider value={{ session, user, profile, loading, error, signInWithEmail, signOut, refreshProfile }}>
      {children}
    </AuthCtx.Provider>
  )
}

export function useHasAccess(etablissementId: string|null): boolean {
  const { profile } = useAuth()
  if (!profile || !etablissementId) return false
  if (profile.is_group_admin) return true
  return profile.etablissements_access.includes(etablissementId)
}

export function useIsGroupAdmin(): boolean {
  const { profile } = useAuth()
  return profile?.is_group_admin ?? false
}
