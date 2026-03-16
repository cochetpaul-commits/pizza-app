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
          {iconName && <div style={{ marginBottom: 8 }}><TileIcon name={iconName} size={20} color={accent || T.jauneDark} /></div>}
          <div style={{
            fontFamily: "Oswald, sans-serif", fontWeight: 600,
            fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase",
            color: accent || T.jauneDark,
          }}>{title}</div>
          {sub && <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 11, color: T.muted, marginTop: 3, lineHeight: 1.4 }}>{sub}</div>}
        </div>
      </div>
    </Link>
  );
}

export default function GestionHubPM() {
  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <div style={{ minHeight: "100dvh", background: T.creme, animation: "slideUp 0.25s ease" }}>
        <AppNav />
        <div style={{ padding: "20px 16px 40px" }}>
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 11, color: T.muted, letterSpacing: 2, textTransform: "uppercase" }}>Piccola Mia</div>
            <div style={{ fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 32, color: T.dark }}>Gestion</div>
          </div>

          <SectionLabel>Pilotage</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
            <Tile href="/kezia"    iconName="upload"    title="Import Kezia" sub="Synthese CA journalier" />
            <Tile href="/pilotage" iconName="pilotage"  title="Pilotage"     sub="CA, indicateurs" />
          </div>

          <SectionLabel>Achats</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
            <Tile href="/invoices"        iconName="factures"   title="Factures"              sub="Import fournisseurs" />
            <Tile href="/variations-prix" iconName="variations" title="Variations & Alertes"  sub="Ecarts prix, seuils" />
          </div>

          <SectionLabel>Prix & Marges</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
            <Tile href="/finances"   iconName="finances"   title="Finances"       sub="P&L, food cost" />
            <Tile href="/mercuriale" iconName="mercuriale" title="Mercuriale"     sub="Prix fournisseurs, export PDF" />
            <Tile href="/epicerie"   iconName="prix"       title="Prix de vente"  sub="CPU, coefficients, TVA" />
          </div>

          <SectionLabel>Ressources humaines</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
            <Tile href="/rh/masse-salariale" iconName="masse-salariale" title="Masse salariale" sub="Charges, simulateur" />
            <Tile href="/rh/rapports"        iconName="rapports"        title="Rapports RH"     sub="Bilans mensuels, export SILAE" />
          </div>

          <SectionLabel>Administration</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
            <Tile href="/admin/utilisateurs" iconName="admin" title="Admin" sub="Utilisateurs, roles" />
          </div>
        </div>
      </div>
    </RequireRole>
  );
}
