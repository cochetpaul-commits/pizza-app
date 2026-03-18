"use client";

import { useState, useRef, useEffect, useCallback } from "react";

import { useEtablissement } from "@/lib/EtablissementContext";
import { useProfile } from "@/lib/ProfileContext";
import { useChannels, useMessages, type ChatChannel } from "@/hooks/useMessages";
import { supabase } from "@/lib/supabaseClient";

/* ── Helpers ─────────────────────────────────────────────────────── */

function timeLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

const AVATAR_COLORS = ["#D4775A", "#2563eb", "#7B1FA2", "#059669", "#d97706", "#dc2626", "#6366f1"];

function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

/* ── Component ───────────────────────────────────────────────────── */

export default function MessageriePage() {
  const { current: etab } = useEtablissement();
  const { isGroupAdmin } = useProfile();
  const { channels, loading: chLoading, error: chError, createChannel } = useChannels(etab?.id ?? null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Resolve current user
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setCurrentUserId(user.id);
    })();
  }, []);

  // Auto-select first channel
  useEffect(() => {
    if (!activeId && channels.length > 0) setActiveId(channels[0].id); // eslint-disable-line react-hooks/set-state-in-effect
  }, [channels, activeId]);

  const activeChannel = channels.find((c) => c.id === activeId) ?? null;
  const canCreate = isGroupAdmin;

  // New channel
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const ch = await createChannel(newName.trim());
    if (ch) {
      setActiveId(ch.id);
      setNewName("");
      setShowNew(false);
    }
  };

  // Mobile: show channel list or chat
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");

  const selectChannel = (ch: ChatChannel) => {
    setActiveId(ch.id);
    setMobileView("chat");
  };

  return (
    <>
      <main style={S.main}>
        <div style={S.container}>
          {/* ── Sidebar (channels) ── */}
          <div style={{ ...S.sidebar, ...(mobileView === "chat" ? S.hideMobile : {}) }}>
            <div style={S.sideHeader}>
              <h2 style={S.sideTitle}>Canaux</h2>
              {canCreate && (
                <button type="button" onClick={() => setShowNew(true)} style={S.newBtn}>+</button>
              )}
            </div>

            {showNew && (
              <div style={S.newRow}>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Nom du canal"
                  style={S.newInput}
                  onKeyDown={(e) => { if (e.key === "Enter") void handleCreate(); }}
                  autoFocus
                />
                <button type="button" onClick={() => void handleCreate()} style={S.newConfirm}>OK</button>
                <button type="button" onClick={() => { setShowNew(false); setNewName(""); }} style={S.newCancel}>
                  &times;
                </button>
              </div>
            )}

            {chError ? (
              <div style={{ padding: 16, color: "#E65100", fontSize: 12, textAlign: "center", background: "#FFF3E0", borderRadius: 8, margin: "10px 10px 0" }}>
                Messagerie non disponible — table manquante
              </div>
            ) : chLoading ? (
              <div style={{ padding: 20, color: "#999", fontSize: 13, textAlign: "center" }}>Chargement...</div>
            ) : channels.length === 0 ? (
              <div style={{ padding: 20, color: "#999", fontSize: 13, textAlign: "center" }}>Aucun canal</div>
            ) : (
              channels.map((ch) => (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => selectChannel(ch)}
                  style={{
                    ...S.channelBtn,
                    background: ch.id === activeId ? "#f5f0e8" : "transparent",
                    fontWeight: ch.id === activeId ? 700 : 400,
                  }}
                >
                  <span style={S.hash}>#</span>
                  {ch.nom}
                </button>
              ))
            )}
          </div>

          {/* ── Chat area ── */}
          <div style={{ ...S.chatArea, ...(mobileView === "list" ? S.hideMobile : {}) }}>
            {activeChannel ? (
              <ChatPanel
                channel={activeChannel}
                currentUserId={currentUserId}
                onBack={() => setMobileView("list")}
              />
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#999", fontSize: 14 }}>
                Selectionnez un canal
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}

/* ── Chat Panel ──────────────────────────────────────────────────── */

function ChatPanel({
  channel,
  currentUserId,
  onBack,
}: {
  channel: ChatChannel;
  currentUserId: string | null;
  onBack: () => void;
}) {
  const { messages, loading, send } = useMessages(channel.id);
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleSend = useCallback(async () => {
    if (!draft.trim()) return;
    const text = draft;
    setDraft("");
    await send(text);
  }, [draft, send]);

  return (
    <div style={S.chatPanel}>
      {/* Header */}
      <div style={S.chatHeader}>
        <button type="button" onClick={onBack} className="nav-mobile-menu" style={S.backBtn}>&larr;</button>
        <span style={S.hash}>#</span>
        <span style={{ fontWeight: 700, fontSize: 15 }}>{channel.nom}</span>
        {channel.description && (
          <span style={{ fontSize: 12, color: "#999", marginLeft: 8 }}>{channel.description}</span>
        )}
      </div>

      {/* Messages */}
      <div style={S.messagesList}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#999" }}>Chargement...</div>
        ) : messages.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#999", fontSize: 13 }}>
            Aucun message. Lancez la conversation !
          </div>
        ) : (
          messages.map((m) => {
            const isMine = m.sender_id === currentUserId;
            const name = m.sender_name ?? "Inconnu";
            const color = avatarColor(name);
            return (
              <div key={m.id} style={{ ...S.msgRow, flexDirection: isMine ? "row-reverse" : "row" }}>
                <div style={{ ...S.avatar, background: color }}>{initials(name)}</div>
                <div style={{ maxWidth: "75%", minWidth: 0 }}>
                  <div style={{
                    display: "flex", alignItems: "baseline", gap: 6,
                    flexDirection: isMine ? "row-reverse" : "row",
                  }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#1a1a1a" }}>{name}</span>
                    <span style={{ fontSize: 11, color: "#999" }}>{timeLabel(m.created_at)}</span>
                  </div>
                  <div style={{
                    ...S.bubble,
                    background: isMine ? "#D4775A" : "#f5f0e8",
                    color: isMine ? "#fff" : "#1a1a1a",
                    borderTopRightRadius: isMine ? 4 : 16,
                    borderTopLeftRadius: isMine ? 16 : 4,
                  }}>
                    {m.content}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={S.inputBar}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSend(); } }}
          placeholder="Ecrire un message..."
          style={S.input}
        />
        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={!draft.trim()}
          style={{
            ...S.sendBtn,
            opacity: draft.trim() ? 1 : 0.4,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/* ── Styles ───────────────────────────────────────────────────────── */

const S = {
  main: {
    maxWidth: 900, margin: "0 auto", padding: "0 0 0",
    height: "calc(100dvh - 45px)",
  } as React.CSSProperties,
  container: {
    display: "flex", height: "100%", border: "1px solid #ddd6c8",
    borderTop: "none", overflow: "hidden",
  } as React.CSSProperties,
  sidebar: {
    width: 220, minWidth: 220, borderRight: "1px solid #ddd6c8",
    background: "#faf8f4", display: "flex", flexDirection: "column" as const,
    overflow: "hidden",
  } as React.CSSProperties,
  hideMobile: {} as React.CSSProperties, // overridden by CSS media query below
  sideHeader: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "14px 14px 10px", borderBottom: "1px solid #f0ebe3",
  } as React.CSSProperties,
  sideTitle: {
    margin: 0, fontSize: 14, fontWeight: 700, color: "#1a1a1a",
    fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
    textTransform: "uppercase" as const, letterSpacing: 1,
  },
  newBtn: {
    width: 28, height: 28, borderRadius: "50%", border: "1px solid #ddd6c8",
    background: "#fff", color: "#D4775A", fontSize: 18, fontWeight: 700,
    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
    lineHeight: 1, padding: 0,
  } as React.CSSProperties,
  newRow: {
    display: "flex", gap: 4, padding: "8px 10px",
    borderBottom: "1px solid #f0ebe3",
  } as React.CSSProperties,
  newInput: {
    flex: 1, padding: "4px 8px", borderRadius: 6, border: "1px solid #ddd6c8",
    fontSize: 13, outline: "none",
  } as React.CSSProperties,
  newConfirm: {
    padding: "4px 10px", borderRadius: 6, border: "none",
    background: "#D4775A", color: "#fff", fontSize: 12, fontWeight: 700,
    cursor: "pointer",
  } as React.CSSProperties,
  newCancel: {
    padding: "4px 8px", borderRadius: 6, border: "none",
    background: "none", color: "#999", fontSize: 16, cursor: "pointer",
  } as React.CSSProperties,
  channelBtn: {
    display: "flex", alignItems: "center", gap: 6,
    width: "100%", padding: "10px 14px", border: "none",
    fontSize: 14, color: "#1a1a1a", cursor: "pointer",
    textAlign: "left" as const,
  } as React.CSSProperties,
  hash: {
    color: "#999", fontWeight: 400, fontSize: 14,
  },
  chatArea: {
    flex: 1, display: "flex", flexDirection: "column" as const,
    minWidth: 0, background: "#fff",
  } as React.CSSProperties,
  chatPanel: {
    display: "flex", flexDirection: "column" as const, height: "100%",
  } as React.CSSProperties,
  chatHeader: {
    display: "flex", alignItems: "center", gap: 6,
    padding: "10px 14px", borderBottom: "1px solid #f0ebe3",
    minHeight: 44,
  } as React.CSSProperties,
  backBtn: {
    padding: "4px 8px", borderRadius: 6, border: "1px solid #ddd6c8",
    background: "#fff", color: "#1a1a1a", fontSize: 14, cursor: "pointer",
    marginRight: 4,
  } as React.CSSProperties,
  messagesList: {
    flex: 1, overflowY: "auto" as const, padding: "12px 14px",
    display: "flex", flexDirection: "column" as const, gap: 12,
  } as React.CSSProperties,
  msgRow: {
    display: "flex", gap: 8, alignItems: "flex-start",
  } as React.CSSProperties,
  avatar: {
    width: 32, height: 32, borderRadius: "50%",
    display: "flex", alignItems: "center", justifyContent: "center",
    color: "#fff", fontSize: 11, fontWeight: 700, flexShrink: 0,
  } as React.CSSProperties,
  bubble: {
    padding: "8px 12px", borderRadius: 16,
    fontSize: 14, lineHeight: 1.4, marginTop: 2,
    wordBreak: "break-word" as const,
  } as React.CSSProperties,
  inputBar: {
    display: "flex", gap: 8, padding: "10px 14px",
    borderTop: "1px solid #f0ebe3", background: "#faf8f4",
  } as React.CSSProperties,
  input: {
    flex: 1, padding: "10px 14px", borderRadius: 20,
    border: "1px solid #ddd6c8", fontSize: 14, outline: "none",
    background: "#fff",
  } as React.CSSProperties,
  sendBtn: {
    width: 40, height: 40, borderRadius: "50%",
    border: "none", background: "#D4775A", color: "#fff",
    display: "flex", alignItems: "center", justifyContent: "center",
    cursor: "pointer", flexShrink: 0,
  } as React.CSSProperties,
};
