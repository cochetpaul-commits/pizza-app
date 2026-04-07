"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useProfile } from "@/lib/ProfileContext";
import { useEtablissement } from "@/lib/EtablissementContext";
import { useNotifications } from "@/hooks/useNotifications";
import { supabase } from "@/lib/supabaseClient";

/* ── Helpers ────────────────────────────────────── */

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
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

/* ── Sub: Establishment dropdown ─────────────────── */

function EtabDropdown() {
  const router = useRouter();
  const { current, setCurrent, etablissements, isGroupView, setGroupView, isGroupAdmin } = useEtablissement();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Only group admins (or users with multiple etabs) can switch
  const canSwitch = isGroupAdmin || etablissements.length > 1;

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const label = isGroupView ? "iFratelli Group" : (current?.nom ?? "Choisir...");
  const color = isGroupView ? "#b45f57" : (current?.couleur ?? "#b45f57");

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => { if (canSwitch) setOpen(v => !v); }}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "7px 14px", borderRadius: 999,
          background: "#fff",
          border: "1px solid rgba(0,0,0,0.06)",
          boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
          cursor: canSwitch ? "pointer" : "default",
          fontFamily: "var(--font-oswald), Oswald, sans-serif",
          fontSize: 12, fontWeight: 700,
          color: "#1a1a1a", textTransform: "uppercase", letterSpacing: ".05em",
          maxWidth: 220,
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        {canSwitch && (
          <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "rotate(0)", transition: "transform .2s" }}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        )}
      </button>

      {open && canSwitch && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)",
          minWidth: 220,
          background: "rgba(255,255,255,0.97)",
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
          border: "1px solid rgba(0,0,0,0.08)",
          borderRadius: 14, overflow: "hidden",
          boxShadow: "0 12px 36px rgba(0,0,0,0.16)",
          zIndex: 320,
        }}>
          {isGroupAdmin && (
            <button type="button" onClick={() => {
              setGroupView(true); setCurrent(null); setOpen(false);
              router.push("/groupe");
            }} style={{
              display: "flex", alignItems: "center", gap: 10,
              width: "100%", padding: "12px 14px", border: "none", cursor: "pointer",
              background: isGroupView ? "rgba(180,95,87,0.10)" : "transparent",
              color: "#1a1a1a", fontSize: 13, fontWeight: isGroupView ? 700 : 500,
              textAlign: "left",
              borderBottom: "1px solid rgba(0,0,0,0.06)",
            }}>
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#b45f57" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="2" width="16" height="20" rx="2" /><path d="M9 22V12h6v10" /><path d="M8 6h.01" /><path d="M16 6h.01" /><path d="M8 10h.01" /><path d="M16 10h.01" />
              </svg>
              iFratelli Group
            </button>
          )}
          {etablissements.map(e => {
            const isSelected = !isGroupView && current?.id === e.id;
            const clr = e.couleur ?? "#b45f57";
            return (
              <button key={e.id} type="button" onClick={() => {
                setGroupView(false); setCurrent(e); setOpen(false);
                const slug = e.slug?.includes("piccola") ? "/piccola-mia" : "/bello-mio";
                router.push(slug);
              }} style={{
                display: "flex", alignItems: "center", gap: 10,
                width: "100%", padding: "12px 14px", border: "none", cursor: "pointer",
                background: isSelected ? `${clr}15` : "transparent",
                color: "#1a1a1a", fontSize: 13, fontWeight: isSelected ? 700 : 500,
                textAlign: "left",
              }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: clr, flexShrink: 0 }} />
                {e.nom}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Sub: Notification bell ──────────────────────── */

function NotifBell() {
  const { notifications, unreadCount, markAsRead, markAllAsRead, remove } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const deleteAll = async () => {
    for (const n of notifications) await remove(n.id);
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          position: "relative",
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 36, height: 36,
          background: "none", border: "none", cursor: "pointer",
          color: "#2c2c2c", padding: 0,
        }}
        aria-label="Notifications"
      >
        <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span style={{
            position: "absolute", top: 2, right: 2,
            background: "#dc2626", color: "#fff",
            fontSize: 8, fontWeight: 700,
            minWidth: 14, height: 14, borderRadius: 7, padding: "0 3px",
            display: "flex", alignItems: "center", justifyContent: "center",
            lineHeight: 1,
          }}>
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "absolute", right: 0, top: "calc(100% + 6px)",
          width: 300, maxHeight: 380, overflowY: "auto",
          background: "rgba(255,255,255,0.97)",
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
          border: "1px solid rgba(0,0,0,0.08)",
          borderRadius: 14, boxShadow: "0 8px 32px rgba(0,0,0,0.14)",
          zIndex: 320,
        }}>
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

/* ── Sub: User avatar dropdown ───────────────────── */

function UserAvatar() {
  const router = useRouter();
  const { displayName, isGroupAdmin } = useProfile();
  const { current } = useEtablissement();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const initials = getInitials(displayName);
  const color = current?.couleur ?? "#D4775A";

  const go = (path: string) => { setOpen(false); router.push(path); };

  const logout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  type Item = { label: string; onClick: () => void; danger?: boolean; show: boolean };
  const items: Item[] = [
    { label: "Mon compte", onClick: () => go("/settings/account"), show: true },
    { label: "Etablissements", onClick: () => go("/settings/etablissements"), show: isGroupAdmin },
    { label: "Employes", onClick: () => go("/settings/employes"), show: isGroupAdmin },
    { label: "Planning", onClick: () => go("/settings/planning"), show: isGroupAdmin },
    { label: "Finance", onClick: () => go("/settings/finance"), show: isGroupAdmin },
  ].filter(i => i.show);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          width: 36, height: 36, borderRadius: "50%",
          background: color, color: "#fff",
          border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, fontWeight: 700,
          fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
          letterSpacing: ".02em",
          boxShadow: "0 2px 6px rgba(0,0,0,0.12)",
        }}
        aria-label="Mon profil"
      >
        {initials}
      </button>

      {open && (
        <div style={{
          position: "absolute", right: 0, top: "calc(100% + 6px)",
          minWidth: 200,
          background: "rgba(255,255,255,0.97)",
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
          border: "1px solid rgba(0,0,0,0.08)",
          borderRadius: 14, overflow: "hidden",
          boxShadow: "0 12px 36px rgba(0,0,0,0.16)",
          zIndex: 320,
        }}>
          {displayName && (
            <div style={{
              padding: "12px 14px 10px",
              borderBottom: "1px solid rgba(0,0,0,0.06)",
              fontSize: 12, fontWeight: 700, color: "#1a1a1a",
            }}>
              {displayName}
            </div>
          )}
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              onClick={it.onClick}
              style={{
                display: "block", width: "100%",
                padding: "11px 14px", border: "none", cursor: "pointer",
                background: "transparent", textAlign: "left",
                fontSize: 13, fontWeight: 500,
                color: "#1a1a1a",
              }}
              onMouseOver={(e) => { e.currentTarget.style.background = "rgba(0,0,0,0.04)"; }}
              onMouseOut={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              {it.label}
            </button>
          ))}
          <div style={{ height: 1, background: "rgba(0,0,0,0.06)" }} />
          <button
            type="button"
            onClick={logout}
            style={{
              display: "block", width: "100%",
              padding: "11px 14px", border: "none", cursor: "pointer",
              background: "transparent", textAlign: "left",
              fontSize: 13, fontWeight: 600,
              color: "#dc2626",
            }}
            onMouseOver={(e) => { e.currentTarget.style.background = "rgba(220,38,38,0.06)"; }}
            onMouseOut={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            Se deconnecter
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Main component ──────────────────────────────── */

export function MobileHeader() {
  return (
    <header className="mobile-header" style={{
      display: "none",
      position: "fixed",
      top: 0, left: 0, right: 0,
      zIndex: 110,
      paddingTop: "env(safe-area-inset-top, 0px)",
      background: "rgba(245,240,232,0.85)",
      backdropFilter: "blur(20px) saturate(180%)",
      WebkitBackdropFilter: "blur(20px) saturate(180%)",
      borderBottom: "1px solid rgba(0,0,0,0.06)",
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        height: 52, padding: "0 12px", gap: 10,
      }}>
        {/* Left spacer (keeps the dropdown centered) */}
        <div style={{ width: 36 }} />

        {/* Center: establishment dropdown */}
        <div style={{ flex: 1, display: "flex", justifyContent: "center", minWidth: 0 }}>
          <EtabDropdown />
        </div>

        {/* Right: bell + avatar */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <NotifBell />
          <UserAvatar />
        </div>
      </div>
    </header>
  );
}
