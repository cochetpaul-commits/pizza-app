"use client";

import Image from "next/image";
import { AppNav } from "@/components/AppNav";
import { HubTile } from "@/components/HubTile";
import { useProfile } from "@/lib/ProfileContext";
import { TOKENS } from "@/lib/tokens";

export default function BelloMioHub() {
  const { isGroupAdmin } = useProfile();

  return (
    <div style={{ minHeight: "100dvh", background: TOKENS.color.creme }}>
      <AppNav />
      <div style={{ maxWidth: 600, margin: "0 auto", padding: "24px 16px 40px" }}>

        {/* Header */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          marginBottom: 28,
          background: `linear-gradient(135deg, ${TOKENS.color.terracotta}15 0%, transparent 60%)`,
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
              margin: 0,
              fontSize: 28,
              fontWeight: 700,
              fontFamily: TOKENS.font.oswald,
              color: TOKENS.color.dark,
              letterSpacing: 1,
              lineHeight: 1.1,
            }}>
              Bello Mio
            </h1>
            <div style={{
              marginTop: 4,
              width: 40,
              height: 3,
              borderRadius: 2,
              background: TOKENS.color.terracotta,
            }} />
          </div>
        </div>

        {/* Tiles */}
        <div style={{ display: "grid", gap: 12 }}>
          <HubTile
            href="/bello-mio/cuisine"
            label="Cuisine"
            sub="Recettes, ingredients, commandes"
            accent={TOKENS.color.terracotta}
          />
          <HubTile
            href="/bello-mio/planning"
            label="Planning"
            sub="Shifts, equipe, horaires"
            accent={TOKENS.color.terracotta}
          />
          {isGroupAdmin && (
            <HubTile
              href="/bello-mio/gestion"
              label="Gestion"
              sub="Pilotage, finances, admin"
              accent={TOKENS.color.terracotta}
            />
          )}
        </div>
      </div>
    </div>
  );
}
