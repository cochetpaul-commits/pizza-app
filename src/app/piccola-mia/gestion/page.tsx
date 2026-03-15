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
          {icon && <div style={{ fontSize: 20, marginBottom: 8 }}>{icon}</div>}
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
            <Tile href="/kezia"           icon="&#x1F4CB;" title="Import Kezia"       sub="Synthese CA journalier"     />
            <Tile href="/pilotage"        icon="&#x1F4CA;" title="Pilotage"           sub="CA, indicateurs"            />
            <Tile href="/finances"        icon="&#x1F4B0;" title="Finances"           sub="Comptes & flux"             />
            <Tile href="/variations-prix" icon="&#x1F4C9;" title="Variations & Alertes" sub="Ecarts prix, seuils"      />
            <Tile href="/invoices"        icon="&#x1F9FE;" title="Factures"           sub="Import fournisseurs"        />
          </div>

          <SectionLabel>Commerce</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
            <Tile href="/epicerie" icon="&#x1F6CD;&#xFE0F;" title="Epicerie" sub="Prix vente, CPU, TVA" wide />
          </div>

          <SectionLabel>Ressources humaines</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
            <Tile href="/rh/masse-salariale" icon="&#x1F4B5;" title="Masse salariale" sub="Charges, simulateur"          />
            <Tile href="/rh/rapports"        icon="&#x1F4C4;" title="Rapports RH"     sub="Bilans mensuels, export SILAE" />
          </div>

          <SectionLabel>Administration</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
            <Tile href="/settings"           icon="&#x2699;&#xFE0F;" title="Parametres" sub="Configuration etablissement" />
            <Tile href="/admin/utilisateurs" icon="&#x1F464;"        title="Admin"       sub="Utilisateurs, roles"         />
          </div>
        </div>
      </div>
    </RequireRole>
  );
}
