import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";

export type ChatChannel = {
  id: string;
  nom: string;
  etablissement_id: string | null;
  description: string | null;
  created_by: string | null;
  created_at: string;
};

export type ChatMessage = {
  id: string;
  channel_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  /** Joined from profiles */
  sender_name?: string;
};

export function useChannels(etablissementId: string | null) {
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchChannels = useCallback(async () => {
    const query = supabase
      .from("chat_channels")
      .select("*")
      .order("created_at");

    if (etablissementId) {
      query.or(`etablissement_id.eq.${etablissementId},etablissement_id.is.null`);
    }

    const { data } = await query;
    setChannels((data ?? []) as ChatChannel[]);
    setLoading(false);
  }, [etablissementId]);

  useEffect(() => { void fetchChannels(); }, [fetchChannels]); // eslint-disable-line react-hooks/set-state-in-effect

  const createChannel = useCallback(async (nom: string, description?: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from("chat_channels")
      .insert({ nom, description, etablissement_id: etablissementId, created_by: user.id })
      .select()
      .single();

    if (error) return null;
    const ch = data as ChatChannel;
    setChannels((prev) => [...prev, ch]);
    return ch;
  }, [etablissementId]);

  return { channels, loading, createChannel, refetch: fetchChannels };
}

export function useMessages(channelId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMessages = useCallback(async () => {
    if (!channelId) { setLoading(false); return; }

    const { data } = await supabase
      .from("chat_messages")
      .select("*, profiles:sender_id(display_name)")
      .eq("channel_id", channelId)
      .order("created_at", { ascending: true })
      .limit(200);

    const mapped = (data ?? []).map((m: Record<string, unknown>) => {
      const profiles = m.profiles as { display_name: string | null } | null;
      return {
        ...m,
        sender_name: profiles?.display_name ?? "Inconnu",
      } as ChatMessage;
    });
    setMessages(mapped);
    setLoading(false);
  }, [channelId]);

  useEffect(() => { void fetchMessages(); }, [fetchMessages]); // eslint-disable-line react-hooks/set-state-in-effect

  // Realtime subscription
  useEffect(() => {
    if (!channelId) return;

    const channel = supabase
      .channel(`chat:${channelId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `channel_id=eq.${channelId}` },
        async (payload) => {
          const msg = payload.new as ChatMessage;
          // Fetch sender name
          const { data: profile } = await supabase
            .from("profiles")
            .select("display_name")
            .eq("id", msg.sender_id)
            .maybeSingle();
          msg.sender_name = profile?.display_name ?? "Inconnu";
          setMessages((prev) => [...prev, msg]);
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "chat_messages", filter: `channel_id=eq.${channelId}` },
        (payload) => {
          const old = payload.old as { id: string };
          setMessages((prev) => prev.filter((m) => m.id !== old.id));
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [channelId]);

  const send = useCallback(async (content: string) => {
    if (!channelId) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from("chat_messages").insert({
      channel_id: channelId,
      sender_id: user.id,
      content: content.trim(),
    });
  }, [channelId]);

  const remove = useCallback(async (messageId: string) => {
    await supabase.from("chat_messages").delete().eq("id", messageId);
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
  }, []);

  return { messages, loading, send, remove, refetch: fetchMessages };
}
