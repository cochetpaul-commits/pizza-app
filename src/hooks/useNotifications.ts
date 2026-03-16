import { useState, useEffect, useCallback } from "react"
import { supabase, supabaseError } from "@/lib/supabase"
import { useAuth } from "./useAuth"

export type Notification = {
  id: string
  user_id: string
  type: "info" | "planning" | "rh" | "alerte" | "message"
  titre: string
  corps: string | null
  lien: string | null
  lu: boolean
  created_at: string
}

type UseNotificationsResult = {
  notifications: Notification[]
  unreadCount: number
  loading: boolean
  error: string | null
  markAsRead: (id: string) => Promise<void>
  markAllAsRead: () => Promise<void>
  remove: (id: string) => Promise<void>
  refetch: () => Promise<void>
}

export function useNotifications(): UseNotificationsResult {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchNotifications = useCallback(async () => {
    if (!user?.id) { setLoading(false); return }
    setLoading(true); setError(null)
    const { data, error: err } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50)
    setLoading(false)
    if (err) { setError(supabaseError(err)); return }
    setNotifications((data ?? []) as Notification[])
  }, [user?.id])

  useEffect(() => { fetchNotifications() }, [fetchNotifications])

  // Realtime
  useEffect(() => {
    if (!user?.id) return
    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "notifications",
        filter: `user_id=eq.${user.id}`,
      }, () => fetchNotifications())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user?.id, fetchNotifications])

  const markAsRead = useCallback(async (id: string) => {
    await supabase.from("notifications").update({ lu: true }).eq("id", id)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, lu: true } : n))
  }, [])

  const markAllAsRead = useCallback(async () => {
    if (!user?.id) return
    await supabase.from("notifications").update({ lu: true }).eq("user_id", user.id).eq("lu", false)
    setNotifications(prev => prev.map(n => ({ ...n, lu: true })))
  }, [user?.id])

  const remove = useCallback(async (id: string) => {
    await supabase.from("notifications").delete().eq("id", id)
    setNotifications(prev => prev.filter(n => n.id !== id))
  }, [])

  const unreadCount = notifications.filter(n => !n.lu).length

  return { notifications, unreadCount, loading, error, markAsRead, markAllAsRead, remove, refetch: fetchNotifications }
}
