"use client";

import { AppNav } from "@/components/AppNav";
import { HubTile } from "@/components/HubTile";
import { RequireRole } from "@/components/RequireRole";
import { TOKENS } from "@/lib/tokens";

export default function GestionHubBM() {
  const accent = TOKENS.color.terracotta;

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <div style={{ minHeight: "100dvh", background: TOKENS.color.creme }}>
        <AppNav />
        <div style={{ maxWidth: 600, margin: "0 auto", padding: "24px 16px 40px" }}>

          <h1 style={heading}>Gestion</h1>
          <p style={subheading}>Bello Mio</p>

          <div style={{ display: "grid", gap: 12, marginTop: 20 }}>
            <HubTile href="/pilotage" label="Pilotage" sub="CA Popina, indicateurs" accent={accent} />
            <HubTile href="/finances" label="Finances" sub="Comptes & flux" accent={accent} />
            <HubTile href="/invoices" label="Factures" sub="Import fournisseurs" accent={accent} />
            <HubTile href="/variations-prix" label="Variations & Alertes" sub="Ecarts prix, seuils" accent={accent} />
            <HubTile href="/rh/masse-salariale" label="Masse salariale" sub="Charges, simulateur" accent={accent} />
            <HubTile href="/rh/rapports" label="Rapports RH" sub="Bilans mensuels, export SILAE" accent={accent} />
            <HubTile href="/settings" label="Parametres" sub="Configuration etablissement" accent={accent} />
            <HubTile href="/admin/utilisateurs" label="Admin" sub="Utilisateurs, roles" accent={accent} />
          </div>
        </div>
      </div>
    </RequireRole>
  );
}

const heading: React.CSSProperties = {
  margin: 0,
  fontSize: 28,
  fontWeight: 700,
  fontFamily: TOKENS.font.oswald,
  color: TOKENS.color.dark,
  letterSpacing: 1,
  textTransform: "uppercase",
};

const subheading: React.CSSProperties = {
  margin: "4px 0 0",
  fontSize: 13,
  color: TOKENS.color.terracotta,
  fontWeight: 600,
};
