/**
 * Client-side helpers for Web Push subscription management.
 */

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from(rawData, (char) => char.charCodeAt(0));
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  return navigator.serviceWorker.register("/sw.js");
}

export async function subscribeToPush(reg: ServiceWorkerRegistration): Promise<PushSubscription | null> {
  if (!("PushManager" in window)) return null;

  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidKey) return null;
  const keyBytes = urlBase64ToUint8Array(vapidKey);

  const existing = await reg.pushManager.getSubscription();
  if (existing) {
    // Abonnement créé avec une ANCIENNE clé serveur (clé VAPID régénérée le
    // 03/09/2026) : il faut le refaire, sinon les envois échouent en silence.
    const current = existing.options?.applicationServerKey
      ? new Uint8Array(existing.options.applicationServerKey as ArrayBuffer)
      : null;
    const sameKey = !!current && current.length === keyBytes.length && current.every((b, i) => b === keyBytes[i]);
    if (sameKey) return existing;
    try { await existing.unsubscribe(); } catch { /* on retente l'abonnement quand même */ }
  }

  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: keyBytes.buffer as ArrayBuffer,
  });
}

export async function getCurrentSubscription(reg: ServiceWorkerRegistration): Promise<PushSubscription | null> {
  if (!("PushManager" in window)) return null;
  return reg.pushManager.getSubscription();
}

export function getPushPermission(): "granted" | "denied" | "default" | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission as "granted" | "denied" | "default";
}

export function isPwaInstalled(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches
    || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

/**
 * Clear the app badge (pastille rouge on PWA icon).
 * Called when user opens/returns to the app.
 */
export function clearAppBadge(): void {
  if (typeof navigator !== "undefined" && "clearAppBadge" in navigator) {
    (navigator as unknown as { clearAppBadge: () => Promise<void> }).clearAppBadge().catch(() => {});
  }
}
