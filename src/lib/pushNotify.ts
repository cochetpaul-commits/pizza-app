import webpush from "web-push";
import { supabaseAdmin } from "./supabaseAdmin";

type PushPayload = { title: string; body: string; url?: string; badgeCount?: number };

let vapidReady = false;
function ensureVapid() {
  if (vapidReady) return;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return;
  webpush.setVapidDetails("mailto:contact@ifratelli.fr", pub, priv);
  vapidReady = true;
}

/**
 * Count pending items that deserve a badge (commandes en attente).
 */
async function getPendingBadgeCount(): Promise<number> {
  const { count } = await supabaseAdmin
    .from("commande_sessions")
    .select("id", { count: "exact", head: true })
    .eq("status", "en_attente");
  return count ?? 0;
}

/**
 * Send push notifications to all group_admin users.
 * Automatically cleans up expired/invalid subscriptions.
 * Adds badgeCount (pending commandes) if not provided.
 */
export async function notifyGroupAdmins(payload: PushPayload): Promise<void> {
  ensureVapid();
  if (!vapidReady) return;
  const { data: admins } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("role", "group_admin");

  if (!admins?.length) return;
  const adminIds = admins.map((a: { id: string }) => a.id);

  const { data: subs } = await supabaseAdmin
    .from("push_subscriptions")
    .select("*")
    .in("user_id", adminIds);

  if (!subs?.length) return;

  // Auto-compute badge count if not provided
  if (payload.badgeCount == null) {
    payload.badgeCount = await getPendingBadgeCount();
  }
  const jsonPayload = JSON.stringify(payload);
  const expired: string[] = [];

  await Promise.allSettled(
    subs.map(async (sub: { id: string; endpoint: string; keys_p256dh: string; keys_auth: string }) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth } },
          jsonPayload,
        );
      } catch (err: unknown) {
        if ((err as { statusCode?: number }).statusCode === 410) {
          expired.push(sub.id);
        }
      }
    }),
  );

  if (expired.length > 0) {
    await supabaseAdmin.from("push_subscriptions").delete().in("id", expired);
  }
}
