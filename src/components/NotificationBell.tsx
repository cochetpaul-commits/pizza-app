"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useNotifications, type Notification } from "@/hooks/useNotifications";
import { fetchApi } from "@/lib/fetchApi";
import {
  registerServiceWorker,
  subscribeToPush,
  getCurrentSubscription,
  getPushPermission,
  isPwaInstalled,
} from "@/lib/pushSubscription";

const TYPE_COLORS: Record<string, string> = {
  info: "#6b7280",
  planning: "#2563eb",
  rh: "#7B1FA2",
  alerte: "#dc2626",
  message: "#D4775A",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "maintenant";
  if (mins < 60) return `${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}j`;
}

export function NotificationBell() {
  const router = useRouter();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Push state
  const [swReg, setSwReg] = useState<ServiceWorkerRegistration | null>(null);
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const pushSupported = typeof window !== "undefined" && "PushManager" in window && "Notification" in window;
  const pushDenied = getPushPermission() === "denied";
  const isIos = typeof navigator !== "undefined" && /iP(hone|ad)/.test(navigator.userAgent);
  const needsPwa = isIos && !isPwaInstalled();

  useEffect(() => {
    registerServiceWorker().then((reg) => {
      if (!reg) return;
      setSwReg(reg);
      getCurrentSubscription(reg).then((sub) => setPushOn(!!sub));
    });
  }, []);

  const togglePush = useCallback(async () => {
    if (!swReg || pushBusy) return;
    setPushBusy(true);
    try {
      if (pushOn) {
        const sub = await getCurrentSubscription(swReg);
        if (sub) {
          await fetchApi("/api/push/subscribe", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          });
          await sub.unsubscribe();
        }
        setPushOn(false);
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
          setPushOn(true);
        }
      }
    } catch (e) {
      console.error("Push toggle:", e);
    } finally {
      setPushBusy(false);
    }
  }, [swReg, pushOn, pushBusy]);

  // Click outside → close
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleClick = async (n: Notification) => {
    if (!n.lu) await markAsRead(n.id);
    if (n.lien) { setOpen(false); router.push(n.lien); }
  };

  const recent = notifications.slice(0, 8);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {/* Bell button */}
      <button
        type="button"
        className="notif-bell-btn"
        onClick={() => setOpen((v) => !v)}
        style={S.bellBtn}
        aria-label="Notifications"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span style={S.badge}>{unreadCount > 9 ? "9+" : unreadCount}</span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div style={S.dropdown}>
          <div style={S.dropHeader}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>Notifications</span>
            {unreadCount > 0 && (
              <button type="button" onClick={() => markAllAsRead()} style={S.markAll}>
                Tout marquer lu
              </button>
            )}
          </div>

          {/* Push toggle */}
          {pushSupported && (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "8px 14px", borderBottom: "1px solid #f0ebe3",
              background: "#faf8f4",
            }}>
              <div>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#1a1a1a" }}>
                  Notifications push
                </span>
                {needsPwa && (
                  <div style={{ fontSize: 10, color: "#b91c1c", marginTop: 1 }}>
                    Ajoutez l&apos;app a l&apos;ecran d&apos;accueil d&apos;abord
                  </div>
                )}
                {pushDenied && (
                  <div style={{ fontSize: 10, color: "#b91c1c", marginTop: 1 }}>
                    Bloquees — reactivez dans Reglages
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); togglePush(); }}
                disabled={pushBusy || pushDenied || needsPwa}
                style={{
                  width: 40, height: 22, borderRadius: 11,
                  background: pushOn ? "#4a6741" : "#ddd6c8",
                  border: "none", cursor: pushDenied || needsPwa ? "not-allowed" : "pointer",
                  position: "relative", transition: "background 0.2s",
                  opacity: pushBusy ? 0.5 : 1, flexShrink: 0,
                }}
              >
                <span style={{
                  position: "absolute", top: 2, left: pushOn ? 20 : 2,
                  width: 18, height: 18, borderRadius: "50%",
                  background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                  transition: "left 0.2s",
                }} />
              </button>
            </div>
          )}

          {recent.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: "#999", fontSize: 13 }}>
              Aucune notification
            </div>
          ) : (
            recent.map((n) => (
              <button key={n.id} type="button" onClick={() => handleClick(n)} style={S.item(n.lu)}>
                <div style={{ ...S.typeDot, background: TYPE_COLORS[n.type] ?? "#999" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: n.lu ? 400 : 600, color: "#1a1a1a" }}>
                    {n.titre}
                  </div>
                  {n.corps && (
                    <div style={{ fontSize: 12, color: "#6f6a61", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {n.corps}
                    </div>
                  )}
                </div>
                <span style={{ fontSize: 11, color: "#999", whiteSpace: "nowrap", marginLeft: 8 }}>
                  {timeAgo(n.created_at)}
                </span>
              </button>
            ))
          )}

          {notifications.length > 8 && (
            <button
              type="button"
              onClick={() => { setOpen(false); router.push("/notifications"); }}
              style={S.seeAll}
            >
              Voir tout
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Styles ──────────────────────────────────────────────────────── */

const S = {
  bellBtn: {
    position: "relative", background: "transparent", border: "none",
    cursor: "pointer", padding: 6, color: "#1a1a1a",
    display: "flex", alignItems: "center", justifyContent: "center",
    borderRadius: 0,
  } as React.CSSProperties,
  badge: {
    position: "absolute", top: 0, right: 0,
    background: "#dc2626", color: "#fff", fontSize: 10, fontWeight: 700,
    width: 16, height: 16, borderRadius: "50%",
    display: "flex", alignItems: "center", justifyContent: "center",
    lineHeight: 1,
  } as React.CSSProperties,
  dropdown: {
    position: "absolute", right: 0, top: "calc(100% + 8px)",
    width: 340, maxHeight: 420, overflowY: "auto",
    background: "#fff", borderRadius: 12,
    border: "1px solid #ddd6c8",
    boxShadow: "0 8px 30px rgba(0,0,0,0.12)",
    zIndex: 300,
  } as React.CSSProperties,
  dropHeader: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "12px 14px", borderBottom: "1px solid #f0ebe3",
  } as React.CSSProperties,
  markAll: {
    background: "none", border: "none", color: "#D4775A",
    fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0,
  } as React.CSSProperties,
  item: (lu: boolean): React.CSSProperties => ({
    display: "flex", alignItems: "flex-start", gap: 10,
    padding: "10px 14px", width: "100%", textAlign: "left",
    background: lu ? "transparent" : "#faf8f4",
    border: "none", borderBottom: "1px solid #f0ebe3",
    cursor: "pointer",
  }),
  typeDot: {
    width: 8, height: 8, borderRadius: "50%", marginTop: 5, flexShrink: 0,
  } as React.CSSProperties,
  seeAll: {
    display: "block", width: "100%", padding: "10px 14px",
    background: "none", border: "none", color: "#D4775A",
    fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "center",
  } as React.CSSProperties,
};
