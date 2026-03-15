"use client";

import { AppNav } from "@/components/AppNav";
import { HubTile } from "@/components/HubTile";
import { useProfile } from "@/lib/ProfileContext";
import { TOKENS } from "@/lib/tokens";

export default function PlanningHubBM() {
  const { isGroupAdmin } = useProfile();
  const accent = TOKENS.color.terracotta;

  return (
    <div style={{ minHeight: "100dvh", background: TOKENS.color.creme }}>
      <AppNav />
      <div style={{ maxWidth: 600, margin: "0 auto", padding: "24px 16px 40px" }}>

        <h1 style={heading}>Planning</h1>
        <p style={subheading}>Bello Mio</p>

        <div style={{ display: "grid", gap: 12, marginTop: 20 }}>
          <HubTile href="/plannings" label="Pointer" sub="Presences du jour" accent={accent} />
          <HubTile href="/plannings" label="Shifts" sub="Creneaux de la semaine" accent={accent} />
          {isGroupAdmin && (
            <HubTile href="/rh/equipe" label="Equipe" sub="Membres, roles, contrats" accent={accent} />
          )}
        </div>
      </div>
    </div>
  );
}

const heading: React.CSSProperties = {
  margin: 0,
  fontSize: 28,
  fontWeight: 700,
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
  color: "#1a1a1a",
  letterSpacing: 1,
  textTransform: "uppercase",
};

const subheading: React.CSSProperties = {
  margin: "4px 0 0",
  fontSize: 13,
  color: "#D4775A",
  fontWeight: 600,
};
