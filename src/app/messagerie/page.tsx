"use client"

import { useState, useRef, useEffect } from "react"
import { NavBar } from "@/components/NavBar"
import { TopNav } from "@/components/TopNav"
import { useAuth } from "@/hooks/useAuth"
import { useProfile } from "@/lib/ProfileContext"
import { useEtablissement } from "@/lib/EtablissementContext"
import {
  useConversations, useMessages,
  type ConversationWithLastMessage,
} from "@/hooks/useMessagerie"

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MessageriePage() {
  const { user } = useAuth()
  const { canWrite } = useProfile()
  const { current: etablissement } = useEtablissement()
  const { conversations, loading, create } = useConversations()

  const [activeConvId, setActiveConvId] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [newTitle, setNewTitle] = useState("")

  const activeConv = conversations.find(c => c.id === activeConvId) ?? null

  async function handleCreate() {
    if (!etablissement?.id || !newTitle.trim()) return
    const id = await create(etablissement.id, newTitle.trim(), [])
    if (id) { setActiveConvId(id); setShowNew(false); setNewTitle("") }
  }

  return (
    <>
      <NavBar backHref="/" backLabel="Accueil" />
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "0 16px 40px" }}>
        <TopNav title="MESSAGERIE" subtitle="Communication interne" eyebrow="Équipe" />

        <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 16, minHeight: 500 }}>
          {/* ── Sidebar ───────────────────────────────────────────── */}
          <div style={{
            background: "#fff", borderRadius: 12, border: "1px solid #ece6db",
            display: "flex", flexDirection: "column", overflow: "hidden",
          }}>
            {/* New conversation */}
            {canWrite && (
              <div style={{ padding: 10, borderBottom: "1px solid #ece6db" }}>
                {showNew ? (
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      className="input"
                      value={newTitle}
                      onChange={e => setNewTitle(e.target.value)}
                      placeholder="Nom du canal..."
                      style={{ flex: 1, fontSize: 11, padding: "6px 10px" }}
                      onKeyDown={e => e.key === "Enter" && handleCreate()}
                    />
                    <button type="button" className="btn btnPrimary" onClick={handleCreate}
                      style={{ fontSize: 10, padding: "6px 10px" }} disabled={!newTitle.trim()}>
                      Créer
                    </button>
                    <button type="button" className="btn" onClick={() => setShowNew(false)}
                      style={{ fontSize: 10, padding: "6px 10px" }}>
                      ✕
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setShowNew(true)}
                    style={{
                      width: "100%", padding: "8px 12px", borderRadius: 8,
                      border: "1px dashed #ddd6c8", background: "transparent",
                      fontSize: 11, fontWeight: 700, color: "#D4775A", cursor: "pointer",
                    }}>
                    + Nouveau canal
                  </button>
                )}
              </div>
            )}

            {/* Conversations list */}
            <div style={{ flex: 1, overflowY: "auto" }}>
              {loading ? (
                <div style={{ padding: 20, textAlign: "center", color: "#999", fontSize: 12 }}>Chargement...</div>
              ) : conversations.length === 0 ? (
                <div style={{ padding: 20, textAlign: "center", color: "#999", fontSize: 12 }}>
                  Aucune conversation.
                </div>
              ) : (
                conversations.map(conv => (
                  <ConversationItem
                    key={conv.id}
                    conversation={conv}
                    active={conv.id === activeConvId}
                    onClick={() => setActiveConvId(conv.id)}
                  />
                ))
              )}
            </div>
          </div>

          {/* ── Chat Panel ────────────────────────────────────────── */}
          {activeConv ? (
            <ChatPanel conversation={activeConv} userId={user?.id ?? ""} />
          ) : (
            <div style={{
              background: "#fff", borderRadius: 12, border: "1px solid #ece6db",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#999", fontSize: 13,
            }}>
              Sélectionnez une conversation.
            </div>
          )}
        </div>
      </main>
    </>
  )
}

// ── Conversation Item ─────────────────────────────────────────────────────────

function ConversationItem({ conversation: c, active, onClick }: {
  conversation: ConversationWithLastMessage; active: boolean; onClick: () => void
}) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: "10px 14px", cursor: "pointer",
        background: active ? "rgba(212,119,90,0.06)" : "transparent",
        borderLeft: active ? "3px solid #D4775A" : "3px solid transparent",
        borderBottom: "1px solid #f5f0e8",
        transition: "background 0.1s",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{
          fontSize: 12, fontWeight: c.unread ? 700 : 500, color: "#1a1a1a",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {c.titre ?? "Sans titre"}
        </span>
        {c.unread && (
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#D4775A", flexShrink: 0 }} />
        )}
      </div>
      {c.last_message && (
        <div style={{
          fontSize: 10, color: "#999", marginTop: 2,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {c.last_message}
        </div>
      )}
      {c.last_message_at && (
        <div style={{ fontSize: 9, color: "#ccc", marginTop: 2 }}>
          {formatTimeAgo(c.last_message_at)}
        </div>
      )}
    </div>
  )
}

// ── Chat Panel ────────────────────────────────────────────────────────────────

function ChatPanel({ conversation, userId }: { conversation: ConversationWithLastMessage; userId: string }) {
  const { messages, loading, send } = useMessages(conversation.id)
  const [draft, setDraft] = useState("")
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages.length])

  async function handleSend() {
    if (!draft.trim() || sending) return
    setSending(true)
    await send(draft)
    setDraft("")
    setSending(false)
  }

  return (
    <div style={{
      background: "#fff", borderRadius: 12, border: "1px solid #ece6db",
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        padding: "12px 16px", borderBottom: "1px solid #ece6db",
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <h3 style={{
          margin: 0, fontSize: 13, fontWeight: 700,
          fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
          letterSpacing: 1, textTransform: "uppercase",
        }}>
          {conversation.titre ?? "Conversation"}
        </h3>
        <span style={{
          fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 6,
          background: "rgba(212,119,90,0.08)", color: "#D4775A",
        }}>
          {conversation.type === "group" ? "GROUPE" : "DM"}
        </span>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px", minHeight: 300 }}>
        {loading ? (
          <div style={{ textAlign: "center", color: "#999", fontSize: 12, padding: 20 }}>Chargement...</div>
        ) : messages.length === 0 ? (
          <div style={{ textAlign: "center", color: "#999", fontSize: 12, padding: 20 }}>
            Aucun message. Commencez la conversation !
          </div>
        ) : (
          messages.map(msg => {
            const isMe = msg.user_id === userId
            return (
              <div key={msg.id} style={{
                display: "flex", justifyContent: isMe ? "flex-end" : "flex-start",
                marginBottom: 8,
              }}>
                <div style={{
                  maxWidth: "70%", padding: "8px 12px", borderRadius: 12,
                  background: isMe ? "#D4775A" : "#f5f0e8",
                  color: isMe ? "#fff" : "#1a1a1a",
                  borderBottomRightRadius: isMe ? 4 : 12,
                  borderBottomLeftRadius: isMe ? 12 : 4,
                }}>
                  <div style={{ fontSize: 12, lineHeight: 1.4 }}>{msg.contenu}</div>
                  <div style={{
                    fontSize: 9, marginTop: 4, textAlign: "right",
                    color: isMe ? "rgba(255,255,255,0.7)" : "#b0a894",
                  }}>
                    {new Date(msg.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{
        padding: "10px 16px", borderTop: "1px solid #ece6db",
        display: "flex", gap: 8, alignItems: "center",
      }}>
        <input
          className="input"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="Écrire un message..."
          style={{ flex: 1, fontSize: 12, padding: "8px 12px", borderRadius: 20 }}
          onKeyDown={e => e.key === "Enter" && handleSend()}
        />
        <button
          type="button"
          className="btn btnPrimary"
          onClick={handleSend}
          disabled={sending || !draft.trim()}
          style={{ fontSize: 11, padding: "8px 16px", borderRadius: 20 }}
        >
          Envoyer
        </button>
      </div>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatTimeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return "À l'instant"
  if (diff < 3600) return `${Math.floor(diff / 60)} min`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return new Date(dateStr).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })
}
