"use client";

import { useEffect, useState, useCallback } from "react";

import { useNotifications, type Notification } from "@/hooks/useNotifications";
import { fetchApi } from "@/lib/fetchApi";
import {
  registerServiceWorker,
  subscribeToPush,
  getCurrentSubscription,
  getPushPermission,
  isPwaInstalled,
} from "@/lib/pushSubscription";

const TYPE_LABELS: Record<string, string> = {
  info: "Info",
  planning: "Planning",
  rh: "RH",
  alerte: "Alerte",
  message: "Message",
};

const TYPE_COLORS: Record<string, { bg: string; fg: string }> = {
  info: { bg: "#f3f4f6", fg: "#6b7280" },
  planning: { bg: "rgba(37,99,235,0.10)", fg: "#2563eb" },
  rh: { bg: "#F3E5F5", fg: "#7B1FA2" },
  alerte: { bg: "#fef2f2", fg: "#dc2626" },
  message: { bg: "rgba(212,119,90,0.10)", fg: "#D4775A" },
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function PushToggle() {
  const [swReg, setSwReg] = useState<ServiceWorkerRegistration | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [permission, setPermission] = useState<string>("default");
  const [busy, setBusy] = useState(false);
  const [pwa, setPwa] = useState(true);

  useEffect(() => {
    setPwa(isPwaInstalled());
    setPermission(getPushPermission());
    registerServiceWorker().then((reg) => {
      if (!reg) return;
      setSwReg(reg);
      getCurrentSubscription(reg).then((sub) => setSubscribed(!!sub));
    });
  }, []);

  const handleToggle = useCallback(async () => {
    if (!swReg || busy) return;
    setBusy(true);
    try {
      if (subscribed) {
        const sub = await getCurrentSubscription(swReg);
        if (sub) {
          await fetchApi("/api/push/subscribe", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          });
          await sub.unsubscribe();
        }
        setSubscribed(false);
      } else {
        const sub = await subscribeToPush(swReg);
        if (sub) {
          const json = sub.toJSON();
          await fetchApi("/api/push/subscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              endpoint: sub.endpoint,
              keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
            }),
          });
          setSubscribed(true);
          setPermission("granted");
        }
      }
    } catch (e) {
      console.error("Push toggle error:", e);
    } finally {
      setBusy(false);
    }
  }, [swReg, subscribed, busy]);

  const unsupported = getPushPermission() === "unsupported";
  const denied = permission === "denied";
  const isIos = typeof navigator !== "undefined" && /iP(hone|ad)/.test(navigator.userAgent);

  if (unsupported) return null;

  return (
    <div style={{
      background: "#fff", borderRadius: 12, border: "1px solid #ddd6c8",
      padding: "14px 16px", marginBottom: 20,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>
            Notifications push
          </div>
          <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>
            {subscribed
              ? "Actives — vous recevez les alertes sur cet appareil"
              : denied
                ? "Bloquees — reactivez dans les reglages du navigateur"
                : "Recevez une alerte quand une commande est envoyee"}
          </div>
        </div>
        <button
          type="button"
          onClick={handleToggle}
          disabled={busy || denied}
          style={{
            width: 50, height: 28, borderRadius: 14,
            background: subscribed ? "#4a6741" : "#ddd6c8",
            border: "none", cursor: denied ? "not-allowed" : "pointer",
            position: "relative", transition: "background 0.2s",
            opacity: busy ? 0.5 : 1, flexShrink: 0,
          }}
        >
          <span style={{
            position: "absolute", top: 3, left: subscribed ? 25 : 3,
            width: 22, height: 22, borderRadius: "50%",
            background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
            transition: "left 0.2s",
          }} />
        </button>
      </div>
      {isIos && !pwa && !subscribed && (
        <div style={{
          marginTop: 10, padding: "8px 10px", borderRadius: 8,
          background: "#fef2f2", fontSize: 12, color: "#b91c1c", lineHeight: 1.4,
        }}>
          Sur iPhone, ajoutez d&apos;abord l&apos;app a l&apos;ecran d&apos;accueil (bouton Partager &rarr; &quot;Sur l&apos;ecran d&apos;accueil&quot;) pour recevoir les notifications.
        </div>
      )}
    </div>
  );
}

export default function NotificationsPage() {
  const { notifications, unreadCount, loading, markAsRead, markAllAsRead, remove } = useNotifications();

  const handleClick = async (n: Notification) => {
    if (!n.lu) await markAsRead(n.id);
    if (n.lien) {
      const dest = n.lien;
      window.location.assign(dest);
    }
  };

  return (
    <>
      <main style={{ maxWidth: 600, margin: "0 auto", padding: "16px 16px 60px" }}>
        <PushToggle />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <h1 style={S.h1}>Notifications</h1>
            <p style={S.subtitle}>
              {unreadCount > 0 ? `${unreadCount} non lue${unreadCount > 1 ? "s" : ""}` : "Tout est lu"}
            </p>
          </div>
          {unreadCount > 0 && (
            <button type="button" onClick={() => markAllAsRead()} style={S.markAllBtn}>
              Tout marquer lu
            </button>
          )}
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#999" }}>Chargement...</div>
        ) : notifications.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, color: "#999" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>Aucune notification</div>
            <p style={{ fontSize: 14 }}>Les notifications apparaitront ici.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {notifications.map((n) => {
              const tc = TYPE_COLORS[n.type] ?? TYPE_COLORS.info;
              return (
                <div
                  key={n.id}
                  onClick={() => handleClick(n)}
                  style={{
                    ...S.card,
                    background: n.lu ? "#fff" : "#faf8f4",
                    cursor: n.lien ? "pointer" : "default",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ ...S.typeBadge, background: tc.bg, color: tc.fg }}>
                      {TYPE_LABELS[n.type] ?? n.type}
                    </span>
                    <span style={{ fontSize: 12, color: "#999" }}>{formatDate(n.created_at)}</span>
                    {!n.lu && <span style={S.unreadDot} />}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); remove(n.id); }}
                      style={S.removeBtn}
                      aria-label="Supprimer"
                    >
                      &times;
                    </button>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: n.lu ? 400 : 600, color: "#1a1a1a" }}>
                    {n.titre}
                  </div>
                  {n.corps && (
                    <div style={{ fontSize: 13, color: "#6f6a61", marginTop: 4 }}>{n.corps}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}

/* ── Styles ──────────────────────────────────────────────────────── */

const S = {
  h1: {
    margin: 0, fontSize: 24, fontWeight: 700,
    fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
    textTransform: "uppercase" as const, letterSpacing: 1, color: "#1a1a1a",
  },
  subtitle: {
    margin: "4px 0 0", fontSize: 14, color: "#6f6a61",
  },
  markAllBtn: {
    padding: "6px 14px", borderRadius: 20, border: "1px solid #D4775A",
    background: "#fff", color: "#D4775A", fontSize: 12, fontWeight: 600,
    cursor: "pointer",
  } as React.CSSProperties,
  card: {
    border: "1px solid #ddd6c8", borderRadius: 12, padding: "12px 14px",
  } as React.CSSProperties,
  typeBadge: {
    display: "inline-block", padding: "2px 8px", borderRadius: 6,
    fontSize: 11, fontWeight: 700,
  } as React.CSSProperties,
  unreadDot: {
    width: 8, height: 8, borderRadius: "50%", background: "#D4775A",
  } as React.CSSProperties,
  removeBtn: {
    marginLeft: "auto", background: "none", border: "none",
    color: "#bbb", fontSize: 18, cursor: "pointer", padding: "0 4px",
    lineHeight: 1,
  } as React.CSSProperties,
};
