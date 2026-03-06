"use client";

import Link from "next/link";
import React from "react";

type NavBarProps = {
  backHref?: string;
  backLabel?: string;
  right?: React.ReactNode;
};

export function NavBar({ backHref, backLabel, right }: NavBarProps) {
  return (
    <nav style={navStyle}>
      <div style={inner}>
        <div style={leftStyle}>
          <Link href="/" style={navBtn}>← Accueil</Link>
          {backHref && (
            <Link href={backHref} style={navBtn}>← {backLabel ?? "Retour"}</Link>
          )}
        </div>
        {right && <div style={rightStyle}>{right}</div>}
      </div>
    </nav>
  );
}

const navStyle: React.CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 50,
  width: "100%",
  background: "#FAF7F2",
  borderBottom: "1px solid rgba(217,199,182,0.7)",
};

const inner: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  maxWidth: 980,
  margin: "0 auto",
  padding: "0 18px",
  height: 44,
};

const leftStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const rightStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const navBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  height: 32,
  padding: "0 12px",
  borderRadius: 8,
  border: "1px solid rgba(217,199,182,0.95)",
  textDecoration: "none",
  color: "#6f6a61",
  fontSize: 13,
  fontWeight: 600,
  background: "rgba(255,255,255,0.70)",
  whiteSpace: "nowrap" as const,
};
