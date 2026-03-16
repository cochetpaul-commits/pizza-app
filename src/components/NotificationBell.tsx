"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useNotifications, type Notification } from "@/hooks/useNotifications"

const TYPE_ICONS: Record<string, string> = {
  info: "i",
  planning: "P",
  rh: "R",
  alerte: "!",
  message: "M",
}

const TYPE_COLORS: Record<string, string> = {
  info: "#3498DB",
  planning: "#D4775A",
  rh: "#4a6741",
  alerte: "#8B1A1A",
  message: "#9B8EC4",
}

export function NotificationBell() {
  const router = useRouter()
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  function handleClick(n: Notification) {
    markAsRead(n.id)
    if (n.lien) { router.push(n.lien); setOpen(false) }
  }

  const recent = notifications.slice(0, 8)

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: 32, height: 32, borderRadius: 8,
          border: "1px solid #ddd6c8", background: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", position: "relative", fontSize: 14,
        }}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} non lues)` : ""}`}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ display: "block" }}>
          <path d="M8 1.5C5.5 1.5 3.5 3.5 3.5 6v2.5L2 10.5v1h12v-1l-1.5-2V6c0-2.5-2-4.5-4.5-4.5z" fill="#666" />
          <path d="M6.5 12.5a1.5 1.5 0 003 0" fill="#666" />
        </svg>
        {unreadCount > 0 && (
          <span style={{
            position: "absolute", top: -4, right: -4,
            width: 16, height: 16, borderRadius: "50%",
            background: "#D4775A", color: "#fff",
            fontSize: 9, fontWeight: 700, lineHeight: "16px", textAlign: "center",
          }}>
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", right: 0,
          width: 320, maxHeight: 420, overflowY: "auto",
          background: "#fff", border: "1px solid #ddd6c8",
          borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
          zIndex: 200,
        }}>
          {/* Header */}
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "12px 14px", borderBottom: "1px solid #ece6db",
          }}>
            <span style={{
              fontSize: 11, fontWeight: 700, color: "#1a1a1a",
              fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
              letterSpacing: 1, textTransform: "uppercase",
            }}>
              Notifications
            </span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markAllAsRead()}
                style={{
                  fontSize: 10, color: "#D4775A", fontWeight: 700,
                  background: "none", border: "none", cursor: "pointer",
                }}
              >
                Tout marquer lu
              </button>
            )}
          </div>

          {/* List */}
          {recent.length === 0 ? (
            <div style={{ padding: "24px 14px", textAlign: "center", color: "#999", fontSize: 12 }}>
              Aucune notification.
            </div>
          ) : (
            recent.map(n => (
              <div
                key={n.id}
                onClick={() => handleClick(n)}
                style={{
                  display: "flex", gap: 10, padding: "10px 14px",
                  borderBottom: "1px solid #f5f0e8",
                  background: n.lu ? "transparent" : "rgba(212,119,90,0.03)",
                  cursor: n.lien ? "pointer" : "default",
                  transition: "background 0.1s",
                }}
              >
                <div style={{
                  width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                  background: `${TYPE_COLORS[n.type] ?? "#999"}14`,
                  border: `1px solid ${TYPE_COLORS[n.type] ?? "#999"}30`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10, fontWeight: 700, color: TYPE_COLORS[n.type] ?? "#999",
                  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
                }}>
                  {TYPE_ICONS[n.type] ?? "?"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 12, fontWeight: n.lu ? 400 : 700, color: "#1a1a1a",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    {n.titre}
                  </div>
                  {n.corps && (
                    <div style={{
                      fontSize: 11, color: "#666", marginTop: 1,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}>
                      {n.corps}
                    </div>
                  )}
                  <div style={{ fontSize: 9, color: "#b0a894", marginTop: 2 }}>
                    {formatTimeAgo(n.created_at)}
                  </div>
                </div>
                {!n.lu && (
                  <div style={{
                    width: 8, height: 8, borderRadius: "50%",
                    background: "#D4775A", flexShrink: 0, marginTop: 8,
                  }} />
                )}
              </div>
            ))
          )}

          {/* Footer */}
          {notifications.length > 8 && (
            <div
              onClick={() => { router.push("/notifications"); setOpen(false) }}
              style={{
                padding: "10px 14px", textAlign: "center", fontSize: 11,
                color: "#D4775A", fontWeight: 700, cursor: "pointer",
                borderTop: "1px solid #ece6db",
              }}
            >
              Voir toutes les notifications
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function formatTimeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = Math.floor((now - then) / 1000)
  if (diff < 60) return "À l'instant"
  if (diff < 3600) return `Il y a ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `Il y a ${Math.floor(diff / 3600)}h`
  if (diff < 604800) return `Il y a ${Math.floor(diff / 86400)}j`
  return new Date(dateStr).toLocaleDateString("fr-FR")
}
