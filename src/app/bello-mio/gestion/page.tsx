"use client";
import Link from "next/link";
import { AppNav } from "@/components/AppNav";
import { RequireRole } from "@/components/RequireRole";
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

export default function GestionHubBM() {
  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <div style={{ minHeight: "100dvh", background: T.creme, animation: "slideUp 0.25s ease" }}>
        <AppNav />
        <div style={{ padding: "20px 16px 40px" }}>
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 11, color: T.muted, letterSpacing: 2, textTransform: "uppercase" }}>Bello Mio</div>
            <div style={{ fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 32, color: T.dark }}>Gestion</div>
          </div>

          <SectionLabel>Pilotage</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
            <Tile href="/pilotage" icon="&#x1F4CA;" title="Pilotage" sub="CA Popina, indicateurs" accent={T.terracotta} wide />
          </div>

          <SectionLabel>Achats</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
            <Tile href="/invoices"        icon="&#x1F9FE;" title="Factures"              sub="Import fournisseurs"   accent={T.terracotta} />
            <Tile href="/variations-prix" icon="&#x1F4C9;" title="Variations & Alertes"  sub="Ecarts prix, seuils"   accent={T.terracotta} />
          </div>

          <SectionLabel>Prix & Marges</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
            <Tile href="/finances"   icon="&#x1F4B0;" title="Finances"      sub="P&L, food cost"              accent={T.terracotta} />
            <Tile href="/mercuriale" icon="&#x1F4C4;" title="Mercuriale"    sub="Prix fournisseurs, export PDF" accent={T.terracotta} />
            <Tile href="/epicerie"   icon="&#x1F6CD;&#xFE0F;" title="Prix de vente" sub="CPU, coefficients, TVA" accent={T.terracotta} />
          </div>

          <SectionLabel>Ressources humaines</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
            <Tile href="/rh/masse-salariale" icon="&#x1F4B5;" title="Masse salariale" sub="Charges, simulateur"          accent={T.terracotta} />
            <Tile href="/rh/rapports"        icon="&#x1F4C4;" title="Rapports RH"     sub="Bilans mensuels, export SILAE" accent={T.terracotta} />
          </div>

          <SectionLabel>Administration</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
            <Tile href="/admin/utilisateurs" icon="&#x1F464;" title="Admin" sub="Utilisateurs, roles" accent={T.terracotta} />
          </div>
        </div>
      </div>
    </RequireRole>
  );
}
