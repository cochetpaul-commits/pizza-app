import webpush from "web-push";
import { supabaseAdmin } from "./supabaseAdmin";

type PushPayload = { title: string; body: string; url?: string };

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
 * Send push notifications to all group_admin users.
 * Automatically cleans up expired/invalid subscriptions.
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
