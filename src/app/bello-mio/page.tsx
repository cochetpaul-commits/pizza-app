"use client";

import Link from "next/link";
import Image from "next/image";
import { AppNav } from "@/components/AppNav";
import { useProfile } from "@/lib/ProfileContext";
import { T } from "@/lib/tokens";

function Tile({ href, icon, title, sub, accent }: {
  href: string; icon?: string; title: string; sub?: string; accent?: string;
}) {
  return (
    <Link href={href} style={{ textDecoration: "none" }}>
      <div style={{
        background: T.white, borderRadius: 16, padding: "16px 18px",
        border: `1.5px solid ${T.border}`,
        borderLeft: `3px solid ${accent || T.terracotta}`,
        minHeight: 90, display: "flex", flexDirection: "column",
        justifyContent: "space-between", cursor: "pointer",
        transition: "all 0.2s", boxShadow: T.tileShadow,
      }}
        onMouseEnter={e => {
          e.currentTarget.style.boxShadow = T.tileShadowHover;
          e.currentTarget.style.borderColor = accent || T.terracotta;
        }}
        onMouseLeave={e => {
          e.currentTarget.style.boxShadow = T.tileShadow;
          e.currentTarget.style.borderColor = T.border;
          e.currentTarget.style.borderLeftColor = accent || T.terracotta;
        }}
      >
        <div>
          {icon && <div style={{ fontSize: 22, marginBottom: 8 }}>{icon}</div>}
          <div style={{
            fontFamily: "Oswald, sans-serif", fontWeight: 600,
            fontSize: 14, letterSpacing: "0.08em", textTransform: "uppercase",
            color: accent || T.terracotta,
          }}>{title}</div>
          {sub && <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 12, color: T.muted, marginTop: 4, lineHeight: 1.4 }}>{sub}</div>}
        </div>
      </div>
    </Link>
  );
}

export default function BelloMioHub() {
  const { isGroupAdmin } = useProfile();

  return (
    <div style={{ minHeight: "100dvh", background: T.creme, animation: "slideUp 0.25s ease" }}>
      <AppNav />
      <div style={{ maxWidth: 600, margin: "0 auto", padding: "24px 16px 40px" }}>

        {/* Header */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          marginBottom: 28,
          background: `linear-gradient(135deg, ${T.terracotta}15 0%, transparent 60%)`,
          borderRadius: 16,
          padding: "20px 18px",
        }}>
          <Image
            src="/logo-ifratelli.png"
            alt="Bello Mio"
            width={52}
            height={52}
            style={{ height: 56, width: "auto", objectFit: "contain", mixBlendMode: "multiply" }}
            priority
          />
          <div>
            <h1 style={{
              margin: 0, fontSize: 28, fontWeight: 700,
              fontFamily: "Oswald, sans-serif",
              color: T.dark, letterSpacing: 1, lineHeight: 1.1,
            }}>
              Bello Mio
            </h1>
            <div style={{ marginTop: 4, width: 40, height: 3, borderRadius: 2, background: T.terracotta }} />
          </div>
        </div>

        {/* Tiles */}
        <div style={{ display: "grid", gap: 12 }}>
          <Tile href="/bello-mio/cuisine"  icon="&#x1F373;" title="Cuisine"  sub="Recettes, ingredients, commandes" accent={T.terracotta} />
          <Tile href="/bello-mio/planning" icon="&#x1F4C5;" title="Planning" sub="Shifts, equipe, horaires"         accent={T.terracotta} />
          {isGroupAdmin && (
            <Tile href="/bello-mio/gestion" icon="&#x1F4CA;" title="Gestion" sub="Pilotage, finances, admin"       accent={T.terracotta} />
          )}
        </div>
      </div>
    </div>
  );
}
