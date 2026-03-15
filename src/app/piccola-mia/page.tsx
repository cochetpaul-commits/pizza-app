"use client";

import Link from "next/link";
import Image from "next/image";
import { AppNav } from "@/components/AppNav";
import { useProfile } from "@/lib/ProfileContext";

export default function PiccolaMiaHub() {
  const { isGroupAdmin } = useProfile();

  const tiles = [
    { label: "Cuisine", sub: "Recettes, ingredients, commandes", href: "/piccola-mia/cuisine", show: true },
    { label: "Planning", sub: "Shifts, equipe, horaires", href: "/piccola-mia/planning", show: true },
    { label: "Evenements", sub: "Mariages, seminaires, traiteur", href: "/piccola-mia/evenements", show: isGroupAdmin },
    { label: "Gestion", sub: "Pilotage, finances, admin", href: "/piccola-mia/gestion", show: isGroupAdmin },
  ];

  return (
    <div style={{ minHeight: "100dvh", background: "#f2ede4" }}>
      <AppNav />
      <div style={{ maxWidth: 600, margin: "0 auto", padding: "24px 16px 40px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 28 }}>
          <Image
            src="/logo-ifratelli.png"
            alt="Piccola Mia"
            width={52}
            height={52}
            style={{ height: 56, width: "auto", objectFit: "contain", mixBlendMode: "multiply" }}
            priority
          />
          <div>
            <h1 style={{
              margin: 0,
              fontSize: 28,
              fontWeight: 700,
              fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
              color: "#1a1a1a",
              letterSpacing: 1,
              lineHeight: 1.1,
            }}>
              Piccola Mia
            </h1>
            <div style={{
              marginTop: 4,
              width: 40,
              height: 3,
              borderRadius: 2,
              background: "#F5E642",
            }} />
          </div>
        </div>

        {/* Decorative stripe band */}
        <div style={{
          height: 6,
          borderRadius: 3,
          marginBottom: 20,
          background: "repeating-linear-gradient(90deg, #fff 0px, #fff 10px, #FAF0A0 10px, #FAF0A0 20px)",
        }} />

        {/* Tiles */}
        <div style={{ display: "grid", gap: 12 }}>
          {tiles.filter(t => t.show).map(t => (
            <Link key={t.href} href={t.href} style={{ textDecoration: "none", color: "inherit" }}>
              <div style={tileStyle}>
                <div>
                  <p style={tileTitle}>{t.label}</p>
                  <p style={tileSub}>{t.sub}</p>
                </div>
                <span style={pillStyle}>Ouvrir &rarr;</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

const tileStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 14,
  padding: "18px 20px",
  boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  cursor: "pointer",
};

const tileTitle: React.CSSProperties = {
  margin: 0,
  fontSize: 15,
  fontWeight: 700,
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
  color: "#1a1a1a",
  letterSpacing: 0.5,
  textTransform: "uppercase",
};

const tileSub: React.CSSProperties = {
  margin: "4px 0 0",
  fontSize: 12,
  color: "#999",
};

const pillStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  height: 30,
  padding: "0 14px",
  borderRadius: 20,
  background: "rgba(245,230,66,0.12)",
  border: "1px solid rgba(245,230,66,0.30)",
  color: "#b8a800",
  fontSize: 11,
  fontWeight: 700,
  whiteSpace: "nowrap",
  flexShrink: 0,
};
