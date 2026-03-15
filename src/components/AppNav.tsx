"use client";

import Link from "next/link";
import React, { useState } from "react";
import { usePathname } from "next/navigation";
import { useProfile } from "@/lib/ProfileContext";
import { TOKENS } from "@/lib/tokens";

type NavItem = {
  label: string;
  href: string;
  adminOnly?: boolean;
  indent?: boolean;
  group?: string;
};

const NAV_ITEMS: NavItem[] = [
  { label: "Groupe", href: "/groupe", adminOnly: true },
  { label: "Bello Mio", href: "/bello-mio", group: "bm" },
  { label: "Cuisine", href: "/bello-mio/cuisine", indent: true },
  { label: "Planning", href: "/bello-mio/planning", indent: true },
  { label: "Gestion", href: "/bello-mio/gestion", adminOnly: true, indent: true },
  { label: "Piccola Mia", href: "/piccola-mia", group: "pm" },
  { label: "Cuisine", href: "/piccola-mia/cuisine", indent: true },
  { label: "Planning", href: "/piccola-mia/planning", indent: true },
  { label: "Evenements", href: "/piccola-mia/evenements", indent: true },
  { label: "Gestion", href: "/piccola-mia/gestion", adminOnly: true, indent: true },
];

const PAGE_LABELS: Record<string, string> = {
  "/groupe": "Groupe",
  "/bello-mio": "Bello Mio",
  "/bello-mio/cuisine": "Cuisine",
  "/bello-mio/planning": "Planning",
  "/bello-mio/gestion": "Gestion",
  "/piccola-mia": "Piccola Mia",
  "/piccola-mia/cuisine": "Cuisine",
  "/piccola-mia/planning": "Planning",
  "/piccola-mia/evenements": "Evenements",
  "/piccola-mia/gestion": "Gestion",
};

function getPageTitle(pathname: string): string {
  // Exact match first
  if (PAGE_LABELS[pathname]) return PAGE_LABELS[pathname];
  // Prefix match for sub-pages
  const keys = Object.keys(PAGE_LABELS).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (pathname.startsWith(key + "/") || pathname === key) return PAGE_LABELS[key];
  }
  return "";
}

function getAccent(pathname: string): string {
  if (pathname.startsWith("/piccola-mia")) return TOKENS.color.jaune;
  return TOKENS.color.terracotta;
}

function getBackLink(pathname: string): { href: string; label: string } | null {
  if (pathname === "/groupe") return null;
  if (pathname === "/bello-mio" || pathname === "/piccola-mia") {
    return { href: "/groupe", label: "Groupe" };
  }
  if (pathname.startsWith("/bello-mio/")) return { href: "/bello-mio", label: "Bello Mio" };
  if (pathname.startsWith("/piccola-mia/")) return { href: "/piccola-mia", label: "Piccola Mia" };
  return { href: "/", label: "Accueil" };
}

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

export function AppNav() {
  const pathname = usePathname();
  const { isGroupAdmin, displayName } = useProfile();
  const [open, setOpen] = useState(false);

  const accent = getAccent(pathname);
  const title = getPageTitle(pathname);
  const back = getBackLink(pathname);

  const visibleItems = NAV_ITEMS.filter(item => !item.adminOnly || isGroupAdmin);

  return (
    <>
      {/* Top bar */}
      <nav style={{
        position: "sticky",
        top: 0,
        zIndex: 100,
        width: "100%",
        background: TOKENS.color.dark,
        borderBottom: `2px solid ${accent}`,
      }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          maxWidth: 900,
          margin: "0 auto",
          padding: "0 16px",
          height: 48,
        }}>
          {/* Left: burger */}
          <button
            onClick={() => setOpen(true)}
            style={{
              background: "none",
              border: "none",
              color: "#fff",
              fontSize: 22,
              cursor: "pointer",
              padding: "4px 8px",
              lineHeight: 1,
            }}
            aria-label="Menu"
          >
            &#9776;
          </button>

          {/* Center: title */}
          <span style={{
            fontFamily: TOKENS.font.oswald,
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: 1,
            textTransform: "uppercase",
            color: "#fff",
          }}>
            {title}
          </span>

          {/* Right: avatar */}
          <div style={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            background: accent,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            fontWeight: 700,
            color: accent === TOKENS.color.jaune ? TOKENS.color.dark : "#fff",
          }}>
            {getInitials(displayName)}
          </div>
        </div>
      </nav>

      {/* Back link (under nav bar) */}
      {back && (
        <div style={{
          maxWidth: 900,
          margin: "0 auto",
          padding: "10px 16px 0",
        }}>
          <Link href={back.href} style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 12,
            fontWeight: 600,
            color: TOKENS.color.muted,
            textDecoration: "none",
          }}>
            &larr; {back.label}
          </Link>
        </div>
      )}

      {/* Drawer overlay */}
      {open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 200,
            background: "rgba(0,0,0,0.5)",
            animation: "fadeIn 0.15s ease",
          }}
          onClick={() => setOpen(false)}
        >
          {/* Drawer panel */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              bottom: 0,
              width: 240,
              background: TOKENS.color.dark,
              padding: "20px 0",
              overflowY: "auto",
              boxShadow: "4px 0 20px rgba(0,0,0,0.3)",
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Close button */}
            <div style={{ padding: "0 16px 16px", borderBottom: "1px solid #333" }}>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#999",
                  fontSize: 18,
                  cursor: "pointer",
                  padding: "4px 8px",
                }}
              >
                &times;
              </button>
            </div>

            {/* Nav items */}
            <div style={{ padding: "12px 0" }}>
              {visibleItems.map(item => {
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                const isGroup = !!item.group;
                return (
                  <Link
                    key={item.href + item.label}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    style={{
                      display: "block",
                      padding: isGroup
                        ? "12px 20px 4px"
                        : item.indent
                          ? "8px 20px 8px 36px"
                          : "8px 20px",
                      textDecoration: "none",
                      fontFamily: TOKENS.font.oswald,
                      fontSize: isGroup ? 13 : 12,
                      fontWeight: isGroup ? 700 : 600,
                      letterSpacing: isGroup ? 1.5 : 0.5,
                      textTransform: "uppercase",
                      color: active
                        ? (item.href.startsWith("/piccola-mia") ? TOKENS.color.jaune : TOKENS.color.terracotta)
                        : isGroup ? "#fff" : "#999",
                      borderLeft: active ? `3px solid ${item.href.startsWith("/piccola-mia") ? TOKENS.color.jaune : TOKENS.color.terracotta}` : "3px solid transparent",
                      background: active ? "rgba(255,255,255,0.05)" : "transparent",
                      transition: "color 0.15s, background 0.15s",
                    }}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
