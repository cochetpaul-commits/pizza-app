"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useProfile } from "@/lib/ProfileContext";
import { useEtablissement } from "@/lib/EtablissementContext";
import { NotificationBell } from "@/components/NotificationBell";
import { GlobalSearch } from "./GlobalSearch";

/**
 * Barre du haut, bureau uniquement (classe .topbar-desktop, masquée sur mobile où
 * MobileHeader fait ce travail). Fixe au-dessus de toutes les pages : recherche
 * globale, établissement courant, cloche, profil. Le choix d'établissement se fait
 * dans la barre latérale.
 */

function initiales(nom: string | null | undefined): string {
  if (!nom) return "?";
  const parts = nom.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function Profil() {
  const router = useRouter();
  const { displayName, role } = useProfile();
  const { current, isGroupView } = useEtablissement();
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

  const couleur = isGroupView ? "#b45f57" : (current?.couleur ?? "#D4775A");
  const go = (path: string) => { setOpen(false); router.push(path); };
  const logout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };
  const roleLabel = role === "group_admin" ? "Direction" : role === "manager" ? "Manager" : "Équipier";

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Mon profil"
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          width: 34, height: 34, borderRadius: "50%",
          background: couleur, color: couleur === "#e6c428" ? "#5a4a1a" : "#fff",
          border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, fontWeight: 700, letterSpacing: ".02em", fontFamily: "inherit",
          boxShadow: "0 2px 6px rgba(0,0,0,0.12)",
        }}
      >
        {initiales(displayName)}
      </button>
      {open && (
        <div role="menu" style={{
          position: "absolute", right: 0, top: "calc(100% + 8px)", minWidth: 210, zIndex: 130,
          background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 14, overflow: "hidden",
          boxShadow: "0 12px 36px rgba(0,0,0,0.14)",
        }}>
          <div style={{ padding: "12px 14px 10px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a" }}>{displayName ?? "Mon profil"}</div>
            <div style={{ fontSize: 11, color: "#8d8577", marginTop: 2 }}>{roleLabel}</div>
          </div>
          {[
            { label: "Mon compte", path: "/settings/account" },
            { label: "Mes congés", path: "/mes-conges" },
            { label: "Changer de session", path: "/session" },
          ].map((it) => (
            <button key={it.path} type="button" role="menuitem" onClick={() => go(it.path)}
              style={{ display: "block", width: "100%", padding: "10px 14px", border: "none", cursor: "pointer", background: "transparent", textAlign: "left", fontSize: 13, fontWeight: 500, color: "#1a1a1a", fontFamily: "inherit" }}
              onMouseOver={(e) => { e.currentTarget.style.background = "rgba(0,0,0,0.04)"; }}
              onMouseOut={(e) => { e.currentTarget.style.background = "transparent"; }}>
              {it.label}
            </button>
          ))}
          <div style={{ height: 1, background: "rgba(0,0,0,0.06)" }} />
          <button type="button" role="menuitem" onClick={logout}
            style={{ display: "block", width: "100%", padding: "10px 14px", border: "none", cursor: "pointer", background: "transparent", textAlign: "left", fontSize: 13, fontWeight: 600, color: "#dc2626", fontFamily: "inherit" }}
            onMouseOver={(e) => { e.currentTarget.style.background = "rgba(220,38,38,0.06)"; }}
            onMouseOut={(e) => { e.currentTarget.style.background = "transparent"; }}>
            Se déconnecter
          </button>
        </div>
      )}
    </div>
  );
}

export function TopBarDesktop() {
  const { current, isGroupView, loading } = useEtablissement();
  const couleur = isGroupView ? "#b45f57" : (current?.couleur ?? "#b45f57");
  const nom = isGroupView ? "iFratelli Group" : (current?.nom ?? "");

  return (
    <header className="topbar-desktop" style={{
      display: "flex", alignItems: "center", gap: 14,
      height: "var(--topbar-desktop-height, 56px)", padding: "0 20px 0 16px",
      // Fond opaque, sans flou : un flou d'arrière-plan sur toute la largeur fait ramer le défilement sur grand écran
      background: "#f2ede4",
      borderBottom: "1px solid rgba(0,0,0,0.06)",
      fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
    }}>
      <GlobalSearch />
      <div style={{ flex: 1 }} />
      {!loading && nom && (
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 600, color: "#1a1a1a",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 260,
        }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: couleur, flexShrink: 0 }} />
          {nom}
        </span>
      )}
      <NotificationBell />
      <Profil />
    </header>
  );
}
