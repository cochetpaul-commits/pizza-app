/* Service Worker — Web Push Notifications + App Badge */

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
      // Set app badge with unread count if supported
      if (navigator.setAppBadge) {
        const count = data.badgeCount ?? 1;
        navigator.setAppBadge(count).catch(() => {});
      }
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  // Clear badge when user interacts with notification
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
