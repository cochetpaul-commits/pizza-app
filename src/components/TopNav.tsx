import Link from "next/link";
import React from "react";

type TopNavProps = {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  right?: React.ReactNode;
  showHome?: boolean;
  backHref?: string;
  backLabel?: string;
};

export function TopNav({
  title,
  subtitle,
  actions,
  right,
  showHome = true,
  backHref,
  backLabel,
}: TopNavProps) {
  const rightNode = actions ?? right ?? null;

  return (
    <div style={wrap}>

      {/* ── Barre nav ── */}
      <div style={barRow}>
        <div style={barLeft}>
          {backHref && (
            <Link href={backHref} style={navBtn}>
              ← {backLabel ?? "Retour"}
            </Link>
          )}
          {showHome && (
            <Link href="/" style={navBtn}>
              Accueil
            </Link>
          )}
        </div>

        {/* Actions à droite (Nouvelle pizza, Rafraîchir…) */}
        {rightNode && (
          <div style={barRight}>{rightNode}</div>
        )}
      </div>

      {/* ── Titre ── */}
      <div style={headRow}>
        <div>
          <h1 style={h1}>{title}</h1>
          {subtitle && <div style={sub}>{subtitle}</div>}
        </div>
      </div>

    </div>
  );
}

/* ── Styles ── */

const wrap: React.CSSProperties = {
  marginBottom: 20,
};

const barRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  marginBottom: 14,
};

const barLeft: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};

const barRight: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
  justifyContent: "flex-end",
};

/* Boutons nav (Accueil, Retour, Index…) */
const navBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  height: 34,
  padding: "0 12px",
  borderRadius: 10,
  border: "1.5px solid rgba(217,199,182,0.95)",
  textDecoration: "none",
  color: "#6f6a61",
  fontSize: 13,
  fontWeight: 600,
  background: "rgba(255,255,255,0.50)",
  backdropFilter: "blur(6px)",
  transition: "border-color 0.12s, color 0.12s",
  whiteSpace: "nowrap" as const,
};

const headRow: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 16,
};

const h1: React.CSSProperties = {
  margin: 0,
  fontSize: 32,
  lineHeight: 1.1,
  fontWeight: 800,
  letterSpacing: -0.4,
};

const sub: React.CSSProperties = {
  marginTop: 4,
  fontSize: 13,
  color: "#6f6a61",
};