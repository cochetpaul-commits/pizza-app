"use client";

import { AppNav } from "@/components/AppNav";
import { HubTile } from "@/components/HubTile";
import { TOKENS } from "@/lib/tokens";

export default function CuisineHubBM() {
  const accent = TOKENS.color.terracotta;

  return (
    <div style={{ minHeight: "100dvh", background: TOKENS.color.creme }}>
      <AppNav />
      <div style={{ maxWidth: 600, margin: "0 auto", padding: "24px 16px 40px" }}>

        <h1 style={heading}>Cuisine</h1>
        <p style={subheading}>Bello Mio</p>

        <div style={{ display: "grid", gap: 12, marginTop: 20 }}>
          <HubTile href="/recettes" label="Recettes" sub="Pizze, Cuisine, Cocktails, Empatements" accent={accent} count="75 fiches" />
          <HubTile href="/ingredients" label="Ingredients" sub="Catalogue produits & prix" accent={accent} count="700 ref." />
          <HubTile href="/commandes" label="Commander" sub="Nouvelle commande fournisseur" accent={accent} />
          <HubTile href="/mercuriale" label="Mercuriale" sub="Prix du marche" accent={accent} />
          <HubTile href="/fournisseurs" label="Fournisseurs" sub="Contacts & tarifs" accent={accent} />
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
