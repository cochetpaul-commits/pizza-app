/* Service Worker — Cache + Push Notifications + App Badge */

const CACHE_NAME = "ifratelli-v3";

// Page hors-ligne minimale, embarquée : on ne sert JAMAIS une vieille
// page en cache (elle référence des chunks Next d'un ancien déploiement
// qui n'existent plus → « client-side exception » au chargement).
const OFFLINE_HTML = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hors ligne</title></head><body style="font-family:-apple-system,'DM Sans',sans-serif;background:#f2ede4;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center"><div style="text-align:center;padding:24px"><div style="font-size:34px;margin-bottom:10px">📡</div><h1 style="font-size:17px;color:#1a1a1a;margin:0 0 6px">Pas de connexion</h1><p style="color:#8a8378;font-size:13px;margin:0 0 16px">L'application a besoin d'internet.</p><a href="" style="display:inline-block;padding:10px 22px;border-radius:10px;background:#D4775A;color:#fff;text-decoration:none;font-size:14px;font-weight:700">Réessayer</a></div></body></html>`;

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

// Clean old caches on activate
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET, API calls, and Supabase
  if (event.request.method !== "GET") return;
  if (url.pathname.startsWith("/api/")) return;
  if (url.hostname.includes("supabase")) return;
  // JAMAIS intercepter le code Next (/_next/) : le cache-first servait
  // d'anciens chunks JS a l'infini → l'app restait figee sur une vieille
  // version malgre les deploiements. Next gere son propre cache (hashes).
  if (url.pathname.startsWith("/_next/")) return;

  // Static assets (images, fonts, icones) → cache-first
  if (url.pathname.match(/\.(png|jpg|jpeg|svg|woff2?|ico)$/)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Navigations → réseau uniquement. Hors ligne : page d'attente neutre,
  // jamais une vieille page mise en cache.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(
        () => new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } })
      )
    );
    return;
  }
});

// Push notifications
self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  const title = data.title || "iFratelli";
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: data.url || "/" },
  };

  event.waitUntil(
    self.registration.showNotification(title, options).then(() => {
      if (navigator.setAppBadge) {
        const count = data.badgeCount ?? 1;
        navigator.setAppBadge(count).catch(() => {});
      }
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (navigator.clearAppBadge) {
    navigator.clearAppBadge().catch(() => {});
  }
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window" }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      return clients.openWindow(url);
    })
  );
});
