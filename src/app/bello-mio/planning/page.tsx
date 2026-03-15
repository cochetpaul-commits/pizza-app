"use client";
import Link from "next/link";
import { AppNav } from "@/components/AppNav";
import { useProfile } from "@/lib/ProfileContext";
import { T } from "@/lib/tokens";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: "DM Sans, sans-serif", fontSize: 9, fontWeight: 700,
      letterSpacing: "0.18em", textTransform: "uppercase",
      color: T.mutedLight, marginBottom: 10, marginTop: 4,
    }}>{children}</div>
  );
}

function Tile({ href, icon, title, sub, accent, wide }: {
  href: string; icon?: string; title: string; sub?: string;
  accent?: string; wide?: boolean;
}) {
  return (
    <Link href={href} style={{ textDecoration: "none", gridColumn: wide ? "span 2" : "span 1" }}>
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
          {icon && <div style={{ fontSize: 20, marginBottom: 8 }}>{icon}</div>}
          <div style={{
            fontFamily: "Oswald, sans-serif", fontWeight: 600,
            fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase",
            color: accent || T.terracotta,
          }}>{title}</div>
          {sub && <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 11, color: T.muted, marginTop: 3, lineHeight: 1.4 }}>{sub}</div>}
        </div>
      </div>
    </Link>
  );
}

export default function PlanningHubBM() {
  const { isGroupAdmin } = useProfile();

  return (
    <div style={{ minHeight: "100dvh", background: T.creme, animation: "slideUp 0.25s ease" }}>
      <AppNav />
      <div style={{ padding: "20px 16px 40px" }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 11, color: T.muted, letterSpacing: 2, textTransform: "uppercase" }}>Bello Mio</div>
          <div style={{ fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 32, color: T.dark }}>Planning</div>
        </div>

        <SectionLabel>Quotidien</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
          <Tile href="/plannings" icon="&#x1F4CB;" title="Pointer"  sub="Presences du jour"       accent={T.terracotta} />
          <Tile href="/plannings" icon="&#x1F4C5;" title="Shifts"   sub="Creneaux de la semaine"   accent={T.terracotta} />
        </div>

        {isGroupAdmin && (
          <>
            <SectionLabel>Administration</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
              <Tile href="/rh/equipe" icon="&#x1F465;" title="Equipe" sub="Membres, roles, contrats" accent={T.terracotta} wide />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
