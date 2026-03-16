import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";

export type Notification = {
  id: string;
  user_id: string;
  type: "info" | "planning" | "rh" | "alerte" | "message";
  titre: string;
  corps: string | null;
  lien: string | null;
  lu: boolean;
  created_at: string;
};

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data, error: err } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (err) { setError(err.message); setLoading(false); return; }
    setNotifications((data ?? []) as Notification[]);
    setLoading(false);
  }, []);

  useEffect(() => { void fetch(); }, [fetch]); // eslint-disable-line react-hooks/set-state-in-effect

  // Realtime subscription
  useEffect(() => {
    let userId: string | null = null;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      userId = user.id;

      channel = supabase
        .channel(`notifications:${userId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
          (payload) => {
            const notif = payload.new as Notification;
            setNotifications((prev) => [notif, ...prev]);
          },
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
          (payload) => {
            const updated = payload.new as Notification;
            setNotifications((prev) => prev.map((n) => n.id === updated.id ? updated : n));
          },
        )
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
          (payload) => {
            const old = payload.old as { id: string };
            setNotifications((prev) => prev.filter((n) => n.id !== old.id));
          },
        )
        .subscribe();
    })();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  const unreadCount = notifications.filter((n) => !n.lu).length;

  const markAsRead = useCallback(async (id: string) => {
    await supabase.from("notifications").update({ lu: true }).eq("id", id);
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, lu: true } : n));
  }, []);

  const markAllAsRead = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("notifications").update({ lu: true }).eq("user_id", user.id).eq("lu", false);
    setNotifications((prev) => prev.map((n) => ({ ...n, lu: true })));
  }, []);

  const remove = useCallback(async (id: string) => {
    await supabase.from("notifications").delete().eq("id", id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  return { notifications, unreadCount, loading, error, markAsRead, markAllAsRead, remove, refetch: fetch };
}
