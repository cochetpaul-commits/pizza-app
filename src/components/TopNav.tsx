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
      <div style={headRow}>
        <div>
          <h1 style={h1}>{title}</h1>
          {subtitle ? <div style={sub}>{subtitle}</div> : null}
        </div>
      </div>

      <div style={barRow}>
        <div style={barLeft}>
          {backHref ? (
            <Link href={backHref} style={homeBtn}>
              {backLabel ? backLabel : "Retour"}
            </Link>
          ) : null}

          {showHome ? (
            <Link href="/" style={homeBtn}>
              Accueil
            </Link>
          ) : null}
        </div>

        <div style={barRight}>{rightNode}</div>
      </div>
    </div>
  );
}

const wrap: React.CSSProperties = {
  marginBottom: 18,
};

const headRow: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 16,
};

const h1: React.CSSProperties = {
  margin: 0,
  fontSize: 44,
  lineHeight: 1.05,
  fontWeight: 800,
  letterSpacing: -0.5,
};

const sub: React.CSSProperties = {
  marginTop: 6,
  fontSize: 14,
  opacity: 0.7,
};

const barRow: React.CSSProperties = {
  marginTop: 14,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
};

const barLeft: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
};

const barRight: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: 10,
};

const homeBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  height: 34,
  padding: "0 14px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.18)",
  textDecoration: "none",
  color: "inherit",
  fontSize: 14,
  fontWeight: 600,
  background: "rgba(255,255,255,0.55)",
  backdropFilter: "blur(6px)",
};