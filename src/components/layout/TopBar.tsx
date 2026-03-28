"use client";

import React, { useState, useRef, useEffect } from "react";
import { useNotifications } from "@/hooks/useNotifications";

export function TopBar() {
  const { notifications, unreadCount, markAsRead, markAllAsRead, remove } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const deleteAll = async () => {
    for (const n of notifications) await remove(n.id);
  };

  return (
    <div ref={ref} className="topbar-mobile" style={{
      display: "none",
      position: "fixed",
      top: "env(safe-area-inset-top, 8px)",
      right: 12,
      zIndex: 120,
    }}>
      {/* Bell icon — no background */}
      <button
        type="button"
        className="notif-bell-btn"
        onClick={() => setOpen(v => !v)}
        style={{
          position: "relative",
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 32, height: 32,
          background: "none", border: "none", cursor: "pointer",
          color: "#2c2c2c", padding: 0,
        }}
      >
        <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span style={{
            position: "absolute", top: 0, right: 0,
            background: "#dc2626", color: "#fff",
            fontSize: 8, fontWeight: 700,
            width: 14, height: 14, borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center",
            lineHeight: 1,
          }}>
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: "absolute", right: 0, top: "calc(100% + 6px)",
          width: 300, maxHeight: 380, overflowY: "auto",
          background: "rgba(255,255,255,0.97)",
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
          border: "1px solid rgba(0,0,0,0.08)",
          borderRadius: 14, boxShadow: "0 8px 32px rgba(0,0,0,0.14)",
          zIndex: 300,
        }}>
          {/* Header */}
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "12px 14px 8px", borderBottom: "1px solid rgba(0,0,0,0.06)",
          }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a" }}>Notifications</span>
            <div style={{ display: "flex", gap: 8 }}>
              {unreadCount > 0 && (
                <button type="button" onClick={() => markAllAsRead()} style={{
                  background: "none", border: "none", cursor: "pointer",
                  fontSize: 11, color: "#D4775A", fontWeight: 600, padding: 0,
                }}>Tout lu</button>
              )}
              <button type="button" onClick={deleteAll} style={{
                background: "none", border: "none", cursor: "pointer",
                fontSize: 11, color: "#999", fontWeight: 500, padding: 0,
              }}>Tout effacer</button>
            </div>
          </div>

          {/* List */}
          {notifications.length === 0 ? (
            <div style={{ padding: "24px 14px", textAlign: "center", color: "#999", fontSize: 12 }}>
              Aucune notification
            </div>
          ) : (
            notifications.slice(0, 20).map(n => {
              const isRead = n.lu;
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => { markAsRead(n.id); }}
                  style={{
                    display: "flex", gap: 10, alignItems: "flex-start",
                    width: "100%", padding: "10px 14px", border: "none", cursor: "pointer",
                    background: isRead ? "transparent" : "rgba(212,119,90,0.04)",
                    borderBottom: "1px solid rgba(0,0,0,0.04)",
                    textAlign: "left",
                  }}
                >
                  {!isRead && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#D4775A", marginTop: 5, flexShrink: 0 }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: isRead ? 400 : 600, color: "#1a1a1a", lineHeight: 1.4 }}>
                      {n.titre}
                    </div>
                    <div style={{ fontSize: 10, color: "#bbb", marginTop: 3 }}>
                      {timeAgo(n.created_at)}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

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
