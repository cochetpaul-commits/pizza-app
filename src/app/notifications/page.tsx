"use client"

import { NavBar } from "@/components/NavBar"
import { TopNav } from "@/components/TopNav"
import { useNotifications, type Notification } from "@/hooks/useNotifications"
import { useRouter } from "next/navigation"

const TYPE_LABELS: Record<string, string> = {
  info: "Info",
  planning: "Planning",
  rh: "RH",
  alerte: "Alerte",
  message: "Message",
}

const TYPE_COLORS: Record<string, string> = {
  info: "#3498DB",
  planning: "#D4775A",
  rh: "#4a6741",
  alerte: "#8B1A1A",
  message: "#9B8EC4",
}

export default function NotificationsPage() {
  const router = useRouter()
  const { notifications, unreadCount, loading, markAsRead, markAllAsRead, remove } = useNotifications()

  function handleClick(n: Notification) {
    if (!n.lu) markAsRead(n.id)
    if (n.lien) router.push(n.lien)
  }

  return (
    <>
      <NavBar backHref="/" backLabel="Accueil" />
      <main style={{ maxWidth: 700, margin: "0 auto", padding: "0 16px 40px" }}>
        <TopNav
          title="NOTIFICATIONS"
          subtitle={unreadCount > 0 ? `${unreadCount} non lue${unreadCount > 1 ? "s" : ""}` : "Tout est lu"}
          eyebrow="Centre de notifications"
        />

        {unreadCount > 0 && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <button
              type="button" className="btn" onClick={() => markAllAsRead()}
              style={{ fontSize: 11, padding: "6px 14px" }}
            >
              Tout marquer comme lu
            </button>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#999", fontSize: 13 }}>Chargement...</div>
        ) : notifications.length === 0 ? (
          <div style={{
            textAlign: "center", padding: "48px 20px", background: "#fff",
            borderRadius: 12, border: "1px solid #ece6db",
          }}>
            <div style={{ fontSize: 32, opacity: 0.3, marginBottom: 12 }}>🔔</div>
            <p style={{ fontSize: 13, color: "#999", margin: 0 }}>Aucune notification pour le moment.</p>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 0 }}>
            {notifications.map(n => {
              const color = TYPE_COLORS[n.type] ?? "#999"
              return (
                <div
                  key={n.id}
                  style={{
                    display: "flex", gap: 12, padding: "14px 16px",
                    background: n.lu ? "#fff" : "rgba(212,119,90,0.03)",
                    borderBottom: "1px solid #ece6db",
                    cursor: n.lien ? "pointer" : "default",
                    transition: "background 0.1s",
                  }}
                  onClick={() => handleClick(n)}
                >
                  {/* Type badge */}
                  <div style={{
                    width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                    background: `${color}14`, border: `1px solid ${color}30`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 9, fontWeight: 700, color,
                    fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
                    letterSpacing: 0.5, textTransform: "uppercase",
                  }}>
                    {TYPE_LABELS[n.type]?.slice(0, 2) ?? "?"}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <div style={{
                        fontSize: 13, fontWeight: n.lu ? 400 : 700, color: "#1a1a1a",
                      }}>
                        {n.titre}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                        {!n.lu && (
                          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#D4775A" }} />
                        )}
                        <span style={{ fontSize: 10, color: "#b0a894", whiteSpace: "nowrap" }}>
                          {formatDate(n.created_at)}
                        </span>
                      </div>
                    </div>
                    {n.corps && (
                      <div style={{ fontSize: 12, color: "#666", marginTop: 3, lineHeight: 1.4 }}>
                        {n.corps}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                      <span style={{
                        fontSize: 8, fontWeight: 700, padding: "1px 6px", borderRadius: 4,
                        background: `${color}14`, color, border: `1px solid ${color}30`,
                        textTransform: "uppercase", letterSpacing: 0.5,
                      }}>
                        {TYPE_LABELS[n.type] ?? n.type}
                      </span>
                      {n.lien && (
                        <span style={{ fontSize: 10, color: "#D4775A", fontWeight: 600 }}>
                          Ouvrir →
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Delete */}
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); remove(n.id) }}
                    style={{
                      width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
                      border: "1px solid #ece6db", background: "transparent",
                      fontSize: 10, color: "#ccc", cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                    aria-label="Supprimer"
                  >
                    ✕
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </>
  )
}

function formatDate(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = Math.floor((now - then) / 1000)
  if (diff < 60) return "À l'instant"
  if (diff < 3600) return `Il y a ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `Il y a ${Math.floor(diff / 3600)}h`
  if (diff < 604800) return `Il y a ${Math.floor(diff / 86400)}j`
  return new Date(dateStr).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })
}
