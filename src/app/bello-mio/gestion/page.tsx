"use client";
import Link from "next/link";
import { AppNav } from "@/components/AppNav";
import { RequireRole } from "@/components/RequireRole";
import { T } from "@/lib/tokens";
import { TileIcon } from "@/components/TileIcon";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: "DM Sans, sans-serif", fontSize: 9, fontWeight: 700,
      letterSpacing: "0.18em", textTransform: "uppercase",
      color: T.mutedLight, marginBottom: 10, marginTop: 4,
    }}>{children}</div>
  );
}

function Tile({ href, iconName, title, sub, accent, wide }: {
  href: string; iconName?: React.ComponentProps<typeof TileIcon>["name"]; title: string; sub?: string;
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
          {iconName && <div style={{ marginBottom: 8 }}><TileIcon name={iconName} size={20} color={accent || T.terracotta} /></div>}
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
            <Tile href="/pilotage" iconName="pilotage" title="Pilotage" sub="CA Popina, indicateurs" accent={T.terracotta} wide />
          </div>

          <SectionLabel>Achats</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
            <Tile href="/invoices"        iconName="factures"   title="Factures"              sub="Import fournisseurs"   accent={T.sauge} />
            <Tile href="/variations-prix" iconName="variations" title="Variations & Alertes"  sub="Ecarts prix, seuils"   accent={T.sauge} />
          </div>

          <SectionLabel>Prix & Marges</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
            <Tile href="/finances"   iconName="finances"   title="Finances"       sub="P&L, food cost"               accent={T.dore} />
            <Tile href="/mercuriale" iconName="mercuriale" title="Mercuriale"     sub="Prix fournisseurs, export PDF" accent={T.dore} />
            <Tile href="/epicerie"   iconName="prix"       title="Prix de vente"  sub="CPU, coefficients, TVA"       accent={T.dore} />
          </div>

          <SectionLabel>Ressources humaines</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
            <Tile href="/rh/masse-salariale" iconName="masse-salariale" title="Masse salariale" sub="Charges, simulateur"          accent={T.bleu} />
            <Tile href="/rh/rapports"        iconName="rapports"        title="Rapports RH"     sub="Bilans mensuels, export SILAE" accent={T.bleu} />
          </div>

          <SectionLabel>Administration</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
            <Tile href="/admin/utilisateurs" iconName="admin" title="Admin" sub="Utilisateurs, roles" accent={T.ardoise} />
          </div>
        </div>
      </div>
    </RequireRole>
  );
}
