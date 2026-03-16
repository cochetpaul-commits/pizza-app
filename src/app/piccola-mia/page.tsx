"use client";

import { useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { AppNav } from "@/components/AppNav";
import { useProfile } from "@/lib/ProfileContext";
import { useEtablissement } from "@/lib/EtablissementContext";
import { T } from "@/lib/tokens";
import { TileIcon } from "@/components/TileIcon";

function Tile({ href, iconName, title, sub, accent }: {
  href: string; iconName?: React.ComponentProps<typeof TileIcon>["name"]; title: string; sub?: string; accent?: string;
}) {
  return (
    <Link href={href} style={{ textDecoration: "none" }}>
      <div style={{
        background: T.white, borderRadius: 16, padding: "16px 18px",
        border: `1.5px solid ${T.border}`,
        borderLeft: `3px solid ${accent || T.jaune}`,
        minHeight: 90, display: "flex", flexDirection: "column",
        justifyContent: "space-between", cursor: "pointer",
        transition: "all 0.2s", boxShadow: T.tileShadow,
      }}
        onMouseEnter={e => {
          e.currentTarget.style.boxShadow = T.tileShadowHover;
          e.currentTarget.style.borderColor = accent || T.jaune;
        }}
        onMouseLeave={e => {
          e.currentTarget.style.boxShadow = T.tileShadow;
          e.currentTarget.style.borderColor = T.border;
          e.currentTarget.style.borderLeftColor = accent || T.jaune;
        }}
      >
        <div>
          {iconName && <div style={{ marginBottom: 8 }}><TileIcon name={iconName} size={22} color={accent || T.jauneDark} /></div>}
          <div style={{
            fontFamily: "Oswald, sans-serif", fontWeight: 600,
            fontSize: 14, letterSpacing: "0.08em", textTransform: "uppercase",
            color: accent || T.jauneDark,
          }}>{title}</div>
          {sub && <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 12, color: T.muted, marginTop: 4, lineHeight: 1.4 }}>{sub}</div>}
        </div>
      </div>
    </Link>
  );
}

export default function PiccolaMiaHub() {
  const { isGroupAdmin } = useProfile();
  const { etablissements, setCurrent } = useEtablissement();

  useEffect(() => {
    const pm = etablissements.find(e => e.slug === "piccola");
    if (pm) setCurrent(pm);
  }, [etablissements, setCurrent]);

  return (
    <div style={{ minHeight: "100dvh", background: T.creme, animation: "slideUp 0.25s ease" }}>
      <AppNav />
      <div style={{ maxWidth: 600, margin: "0 auto", padding: "24px 16px 40px" }}>

        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", gap: 14,
          marginBottom: 8, padding: "20px 18px",
        }}>
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
              margin: 0, fontSize: 28, fontWeight: 700,
              fontFamily: "Oswald, sans-serif",
              color: T.dark, letterSpacing: 1, lineHeight: 1.1,
            }}>
              Piccola Mia
            </h1>
            <div style={{ marginTop: 4, width: 40, height: 3, borderRadius: 2, background: T.jaune }} />
          </div>
        </div>

        {/* Decorative stripe band */}
        <div style={{
          height: 6, borderRadius: 3, marginBottom: 20,
          background: T.stripedPM,
        }} />

        {/* Tiles */}
        <div style={{ display: "grid", gap: 12 }}>
          <Tile href="/piccola-mia/cuisine"     iconName="cuisine"     title="Cuisine"      sub="Recettes, ingredients, commandes" accent={T.jauneDark} />
          <Tile href="/piccola-mia/planning"    iconName="planning"    title="Planning"     sub="Shifts, equipe, horaires"         accent={T.bleu} />
          <Tile href="/mes-shifts"              iconName="horloge"     title="Mon planning" sub="Mes shifts de la semaine"         accent={T.dore} />
          <Tile href="/messagerie"              iconName="messagerie"  title="Messagerie"   sub="Chat interne equipe"              accent={T.sauge} />
          <Tile href="/piccola-mia/evenements"  iconName="evenements"  title="Evenements"   sub="Mariages, seminaires, traiteur"   accent={T.violet} />
          {isGroupAdmin && (
            <Tile href="/piccola-mia/gestion"   iconName="gestion"     title="Gestion"      sub="Pilotage, finances, admin"        accent={T.ardoise} />
          )}
        </div>
      </div>
    </div>
  );
}
