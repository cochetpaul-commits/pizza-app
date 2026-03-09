"use client";

import Link from "next/link";
import { NavBar } from "@/components/NavBar";

const SECTIONS = [
  { href: "/mercuriale",      label: "MERCURIALE",            sub: "Prix fournisseurs · Export PDF", color: "#92400e" },
  { href: "/epicerie",        label: "ÉPICERIE",              sub: "Prix de vente · Export CSV",     color: "#1e40af" },
  { href: "/variations-prix", label: "VARIATIONS & ALERTES",  sub: "Historique · Hausses & baisses · Veille 30 j", color: "#8B1A1A" },
];

export default function PilotagePage() {
  return (
    <>
      <NavBar />
      <main style={{ maxWidth: 600, margin: "0 auto", padding: "24px 16px 40px", boxSizing: "border-box" }}>
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: 2, color: "#1e3a5f", textTransform: "uppercase", margin: "0 0 6px" }}>
            PILOTAGE
          </p>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: "#1a1a1a", margin: 0, fontFamily: "var(--font-dm-serif-display), Georgia, serif" }}>
            Outils de pilotage
          </h1>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "#7a6f63" }}>
            Mercuriale, épicerie et suivi des variations de prix.
          </p>
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          {SECTIONS.map((s) => (
            <Link key={s.href} href={s.href} style={{ textDecoration: "none", color: "inherit" }}>
              <div style={{
                background: "#fff",
                borderRadius: 14,
                borderLeft: `4px solid ${s.color}`,
                padding: "18px 20px",
                cursor: "pointer",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase", color: s.color }}>
                      {s.label}
                    </p>
                    <p style={{ margin: "3px 0 0", fontSize: 12, color: "#999" }}>{s.sub}</p>
                  </div>
                  <span style={{
                    display: "inline-block",
                    padding: "7px 16px",
                    borderRadius: 10,
                    background: s.color,
                    color: "#fff",
                    fontSize: 12,
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}>
                    Ouvrir →
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}
