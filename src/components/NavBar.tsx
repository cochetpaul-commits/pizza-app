"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useRef, useState } from "react";

import { EtablissementSelector } from "@/components/EtablissementSelector";
import { NotificationBell } from "@/components/NotificationBell";
import { useEtablissement } from "@/lib/EtablissementContext";

export type MenuItem = {
  label: string;
  onClick: () => void;
  style?: React.CSSProperties;
  disabled?: boolean;
};

type NavBarProps = {
  backHref?: string;
  backLabel?: string;
  right?: React.ReactNode;
  /** Primary action button — always visible (e.g. Sauvegarder) */
  primaryAction?: React.ReactNode;
  /** Secondary actions — visible on desktop, collapsed into ⋯ menu on mobile */
  menuItems?: MenuItem[];
};

function getHubHref(slug: string | undefined): string {
  if (slug === "piccola-mia" || slug === "piccola_mia") return "/piccola-mia";
  if (slug === "bello-mio" || slug === "bello_mia") return "/bello-mio";
  return "/groupe";
}

export function NavBar({ backHref, backLabel, right, primaryAction, menuItems }: NavBarProps) {
  const { current } = useEtablissement();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) closeMenu();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen, closeMenu]);

  const hasStructuredRight = !!(primaryAction || (menuItems && menuItems.length > 0));

  return (
    <nav className="navbar-desktop" style={navStyle}>
      <div style={inner}>
        {/* ── Left: back button ── */}
        <div style={leftStyle}>
          {backHref ? (
            <>
              {/* Desktop: "← Recettes" */}
              <Link href={backHref} style={navBtn} className="nav-back-full">&larr; {backLabel ?? "Retour"}</Link>
              {/* Mobile: just "←" */}
              <Link href={backHref} style={navBtn} className="nav-back-icon" aria-label={backLabel ?? "Retour"}>&larr;</Link>
            </>
          ) : (
            <Link href={getHubHref(current?.slug)} style={navBtn}>&larr; Retour</Link>
          )}
        </div>

        {/* ── Center: establishment selector ── */}
        <div style={{ flex: "0 0 auto" }}>
          <EtablissementSelector />
        </div>

        {/* ── Notification bell ── */}
        <NotificationBell />

        {/* ── Right: structured or legacy ── */}
        {hasStructuredRight ? (
          <div style={rightStyle}>
            {/* Desktop: all buttons inline */}
            {menuItems && menuItems.length > 0 && (
              <div className="nav-desktop-actions">
                {menuItems.map((item, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={item.onClick}
                    disabled={item.disabled}
                    className="btn"
                    style={item.style}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}

            {/* Mobile: ⋯ menu trigger */}
            {menuItems && menuItems.length > 0 && (
              <div className="nav-mobile-menu" ref={menuRef} style={{ position: "relative" }}>
                <button
                  type="button"
                  onClick={() => setMenuOpen(o => !o)}
                  style={dotsBtn}
                  aria-label="Plus d'actions"
                >⋯</button>
                {menuOpen && (
                  <div style={dropdownStyle}>
                    {menuItems.map((item, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => { item.onClick(); closeMenu(); }}
                        disabled={item.disabled}
                        style={{ ...dropdownItemStyle, ...item.style }}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {primaryAction}
          </div>
        ) : right ? (
          <div style={rightStyle}>{right}</div>
        ) : null}
      </div>
    </nav>
  );
}

const navStyle: React.CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 50,
  width: "100%",
  maxWidth: "100vw",
  overflow: "visible",
  background: "#f2ede4",
  borderBottom: "1px solid #ddd6c8",
};

const inner: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  maxWidth: 980,
  margin: "0 auto",
  padding: "0 12px",
  height: 44,
  minWidth: 0,
};

const leftStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  flex: "0 1 auto",
  minWidth: 0,
  overflow: "hidden",
};

const rightStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  flexShrink: 0,
};

const navBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  height: 32,
  padding: "0 12px",
  borderRadius: 20,
  border: "1px solid #ddd6c8",
  textDecoration: "none",
  color: "#1a1a1a",
  fontSize: 11,
  fontWeight: 600,
  background: "#fff",
  whiteSpace: "nowrap" as const,
};

const dotsBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 32,
  height: 30,
  borderRadius: 8,
  border: "1px solid #ddd6c8",
  background: "#fff",
  color: "#1a1a1a",
  fontSize: 16,
  fontWeight: 700,
  cursor: "pointer",
  letterSpacing: 2,
};

const dropdownStyle: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + 6px)",
  right: 0,
  minWidth: 180,
  background: "#fff",
  border: "1px solid #ddd6c8",
  borderRadius: 12,
  boxShadow: "0 8px 24px rgba(0,0,0,0.10)",
  padding: "6px 0",
  zIndex: 100,
  animation: "slideDown 0.15s ease",
};

const dropdownItemStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "10px 16px",
  background: "none",
  border: "none",
  textAlign: "left",
  fontSize: 14,
  fontWeight: 600,
  color: "#1a1a1a",
  cursor: "pointer",
};
