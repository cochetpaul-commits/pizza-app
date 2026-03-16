import { useState, useEffect, useCallback } from "react"
import { supabase, supabaseError } from "@/lib/supabase"
import { useAuth } from "./useAuth"

export type Conversation = {
  id: string
  etablissement_id: string
  titre: string | null
  type: "group" | "direct"
  created_by: string | null
  created_at: string
}

export type Message = {
  id: string
  conversation_id: string
  user_id: string
  contenu: string
  created_at: string
}

export type ConversationWithLastMessage = Conversation & {
  last_message: string | null
  last_message_at: string | null
  unread: boolean
}

// ── Conversations list ───────────────────────────────────────

type UseConversationsResult = {
  conversations: ConversationWithLastMessage[]
  loading: boolean
  error: string | null
  create: (etabId: string, titre: string, memberIds: string[]) => Promise<string | null>
  refetch: () => Promise<void>
}

export function useConversations(): UseConversationsResult {
  const { user } = useAuth()
  const [conversations, setConversations] = useState<ConversationWithLastMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchConversations = useCallback(async () => {
    if (!user?.id) { setLoading(false); return }
    setLoading(true); setError(null)

    // Get conversation IDs user is member of
    const { data: memberships } = await supabase
      .from("conversation_members")
      .select("conversation_id, last_read_at")
      .eq("user_id", user.id)

    if (!memberships?.length) { setConversations([]); setLoading(false); return }

    const convIds = memberships.map(m => m.conversation_id)
    const readMap = new Map(memberships.map(m => [m.conversation_id, m.last_read_at]))

    const { data: convs, error: err } = await supabase
      .from("conversations")
      .select("*")
      .in("id", convIds)
      .order("created_at", { ascending: false })

    if (err) { setError(supabaseError(err)); setLoading(false); return }

    // Get last message per conversation
    const result: ConversationWithLastMessage[] = []
    for (const conv of (convs ?? []) as Conversation[]) {
      const { data: msgs } = await supabase
        .from("messages")
        .select("contenu, created_at")
        .eq("conversation_id", conv.id)
        .order("created_at", { ascending: false })
        .limit(1)

      const lastMsg = msgs?.[0] ?? null
      const lastReadAt = readMap.get(conv.id) ?? "1970-01-01"
      const unread = lastMsg ? new Date(lastMsg.created_at) > new Date(lastReadAt) : false

      result.push({
        ...conv,
        last_message: lastMsg?.contenu ?? null,
        last_message_at: lastMsg?.created_at ?? null,
        unread,
      })
    }

    // Sort by last message
    result.sort((a, b) => {
      const ta = a.last_message_at ?? a.created_at
      const tb = b.last_message_at ?? b.created_at
      return tb.localeCompare(ta)
    })

    setConversations(result)
    setLoading(false)
  }, [user?.id])

  useEffect(() => { fetchConversations() }, [fetchConversations])

  const create = useCallback(async (etabId: string, titre: string, memberIds: string[]): Promise<string | null> => {
    if (!user?.id) return null
    const { data: conv, error: err } = await supabase
      .from("conversations")
      .insert({ etablissement_id: etabId, titre, type: "group" as const, created_by: user.id })
      .select("id")
      .single()
    if (err || !conv) { setError(supabaseError(err!)); return null }

    const allMembers = [...new Set([user.id, ...memberIds])]
    await supabase.from("conversation_members").insert(
      allMembers.map(uid => ({ conversation_id: conv.id, user_id: uid }))
    )
    await fetchConversations()
    return conv.id
  }, [user?.id, fetchConversations])

  return { conversations, loading, error, create, refetch: fetchConversations }
}

// ── Messages for a conversation ──────────────────────────────

type UseMessagesResult = {
  messages: Message[]
  loading: boolean
  error: string | null
  send: (contenu: string) => Promise<boolean>
  refetch: () => Promise<void>
}

export function useMessages(conversationId: string | null): UseMessagesResult {
  const { user } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchMessages = useCallback(async () => {
    if (!conversationId) { setLoading(false); return }
    setLoading(true); setError(null)
    const { data, error: err } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(200)
    setLoading(false)
    if (err) { setError(supabaseError(err)); return }
    setMessages((data ?? []) as Message[])

    // Mark as read
    if (user?.id) {
      await supabase.from("conversation_members")
        .update({ last_read_at: new Date().toISOString() })
        .eq("conversation_id", conversationId)
        .eq("user_id", user.id)
    }
  }, [conversationId, user?.id])

  useEffect(() => { fetchMessages() }, [fetchMessages])

  // Realtime
  useEffect(() => {
    if (!conversationId) return
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "messages",
        filter: `conversation_id=eq.${conversationId}`,
      }, (payload) => {
        setMessages(prev => [...prev, payload.new as Message])
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [conversationId])

  const send = useCallback(async (contenu: string): Promise<boolean> => {
    if (!conversationId || !user?.id || !contenu.trim()) return false
    const { error: err } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      user_id: user.id,
      contenu: contenu.trim(),
    })
    if (err) { setError(supabaseError(err)); return false }
    return true
  }, [conversationId, user?.id])

  return { messages, loading, error, send, refetch: fetchMessages }
}
