"use client";

import Image from "next/image";
import { AppNav } from "@/components/AppNav";
import { HubTile } from "@/components/HubTile";
import { useProfile } from "@/lib/ProfileContext";
import { TOKENS } from "@/lib/tokens";

export default function PiccolaMiaHub() {
  const { isGroupAdmin } = useProfile();
  const accent = TOKENS.color.jauneDark;

  return (
    <div style={{ minHeight: "100dvh", background: TOKENS.color.creme }}>
      <AppNav />
      <div style={{ maxWidth: 600, margin: "0 auto", padding: "24px 16px 40px" }}>

        {/* Header */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          marginBottom: 8,
          padding: "20px 18px",
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
              margin: 0,
              fontSize: 28,
              fontWeight: 700,
              fontFamily: TOKENS.font.oswald,
              color: TOKENS.color.dark,
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
              background: TOKENS.color.jaune,
            }} />
          </div>
        </div>

        {/* Decorative stripe band */}
        <div style={{
          height: 6,
          borderRadius: 3,
          marginBottom: 20,
          background: TOKENS.pattern.stripedPM,
        }} />

        {/* Tiles */}
        <div style={{ display: "grid", gap: 12 }}>
          <HubTile
            href="/piccola-mia/cuisine"
            label="Cuisine"
            sub="Recettes, ingredients, commandes"
            accent={accent}
          />
          <HubTile
            href="/piccola-mia/planning"
            label="Planning"
            sub="Shifts, equipe, horaires"
            accent={accent}
          />
          <HubTile
            href="/piccola-mia/evenements"
            label="Evenements"
            sub="Mariages, seminaires, traiteur"
            accent={accent}
          />
          {isGroupAdmin && (
            <HubTile
              href="/piccola-mia/gestion"
              label="Gestion"
              sub="Pilotage, finances, admin"
              accent={accent}
            />
          )}
        </div>
      </div>
    </div>
  );
}
