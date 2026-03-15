"use client";

import Link from "next/link";
import React from "react";
import { usePathname } from "next/navigation";
import { useProfile } from "@/lib/ProfileContext";

type NavLink = { label: string; href: string; adminOnly?: boolean };

const BM_LINKS: NavLink[] = [
  { label: "Cuisine", href: "/bello-mio/cuisine" },
  { label: "Planning", href: "/bello-mio/planning" },
  { label: "Gestion", href: "/bello-mio/gestion", adminOnly: true },
];

const PM_LINKS: NavLink[] = [
  { label: "Cuisine", href: "/piccola-mia/cuisine" },
  { label: "Planning", href: "/piccola-mia/planning" },
  { label: "Evenements", href: "/piccola-mia/evenements", adminOnly: true },
  { label: "Gestion", href: "/piccola-mia/gestion", adminOnly: true },
];

const GROUP_LINKS: NavLink[] = [
  { label: "Groupe", href: "/groupe" },
  { label: "Bello Mio", href: "/bello-mio" },
  { label: "Piccola Mia", href: "/piccola-mia" },
];

function resolveContext(pathname: string): {
  accent: string;
  links: NavLink[];
  backHref: string;
  backLabel: string;
} {
  if (pathname.startsWith("/bello-mio")) {
    const isHub = pathname === "/bello-mio";
    return {
      accent: "#D4775A",
      links: isHub ? [] : BM_LINKS,
      backHref: isHub ? "/groupe" : "/bello-mio",
      backLabel: isHub ? "Groupe" : "Bello Mio",
    };
  }
  if (pathname.startsWith("/piccola-mia")) {
    const isHub = pathname === "/piccola-mia";
    return {
      accent: "#F5E642",
      links: isHub ? [] : PM_LINKS,
      backHref: isHub ? "/groupe" : "/piccola-mia",
      backLabel: isHub ? "Groupe" : "Piccola Mia",
    };
  }
  // /groupe or fallback
  return {
    accent: "#D4775A",
    links: GROUP_LINKS,
    backHref: "/",
    backLabel: "Accueil",
  };
}

export function AppNav() {
  const pathname = usePathname();
  const { isGroupAdmin } = useProfile();
  const ctx = resolveContext(pathname);

  const visibleLinks = ctx.links.filter(l => !l.adminOnly || isGroupAdmin);

  return (
    <nav style={navStyle}>
      <div style={inner}>
        <Link href={ctx.backHref} style={backBtn}>
          <span style={{ marginRight: 4 }}>&larr;</span>
          {ctx.backLabel}
        </Link>

        {visibleLinks.length > 0 && (
          <div style={linksRow}>
            {visibleLinks.map(link => {
              const active = pathname === link.href || pathname.startsWith(link.href + "/");
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  style={{
                    ...linkStyle,
                    color: active ? ctx.accent : "#999",
                    borderBottom: active ? `2px solid ${ctx.accent}` : "2px solid transparent",
                  }}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </nav>
  );
}

const navStyle: React.CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 50,
  width: "100%",
  background: "#f2ede4",
  borderBottom: "1px solid #ddd6c8",
};

const inner: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  maxWidth: 900,
  margin: "0 auto",
  padding: "0 16px",
  height: 48,
};

const backBtn: React.CSSProperties = {
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
  whiteSpace: "nowrap",
  flexShrink: 0,
};

const linksRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  flex: 1,
  overflow: "auto",
};

const linkStyle: React.CSSProperties = {
  textDecoration: "none",
  fontSize: 12,
  fontWeight: 700,
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
  letterSpacing: 0.5,
  textTransform: "uppercase",
  padding: "12px 10px",
  whiteSpace: "nowrap",
  transition: "color 0.15s",
};
