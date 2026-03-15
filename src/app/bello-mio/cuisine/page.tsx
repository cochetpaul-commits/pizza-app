"use client";

import Link from "next/link";
import { AppNav } from "@/components/AppNav";

const tiles = [
  { label: "Recettes", sub: "Pizze, Cuisine, Cocktails, Empatements", href: "/recettes", count: "75 fiches" },
  { label: "Ingredients", sub: "Catalogue produits & prix", href: "/ingredients", count: "700 ref." },
  { label: "Commander", sub: "Nouvelle commande fournisseur", href: "/commandes" },
  { label: "Mercuriale", sub: "Prix du marche", href: "/mercuriale" },
  { label: "Fournisseurs", sub: "Contacts & tarifs", href: "/fournisseurs" },
];

export default function CuisineHubBM() {
  return (
    <div style={{ minHeight: "100dvh", background: "#f2ede4" }}>
      <AppNav />
      <div style={{ maxWidth: 600, margin: "0 auto", padding: "24px 16px 40px" }}>

        <h1 style={heading}>Cuisine</h1>
        <p style={subheading}>Bello Mio</p>

        <div style={{ display: "grid", gap: 12, marginTop: 20 }}>
          {tiles.map(t => (
            <Link key={t.href} href={t.href} style={{ textDecoration: "none", color: "inherit" }}>
              <div style={tileStyle}>
                <div>
                  <p style={tileTitle}>{t.label}</p>
                  <p style={tileSub}>{t.sub}</p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {t.count && <span style={countStyle}>{t.count}</span>}
                  <span style={pill}>Ouvrir &rarr;</span>
                </div>
              </div>
            </Link>
          ))}
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

const tileStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 14,
  padding: "18px 20px",
  boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  cursor: "pointer",
};

const tileTitle: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  fontWeight: 700,
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
  color: "#1a1a1a",
  letterSpacing: 0.5,
  textTransform: "uppercase",
};

const tileSub: React.CSSProperties = {
  margin: "3px 0 0",
  fontSize: 12,
  color: "#999",
};

const countStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "#D4775A",
};

const pill: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  height: 28,
  padding: "0 12px",
  borderRadius: 20,
  background: "rgba(212,119,90,0.08)",
  border: "1px solid rgba(212,119,90,0.20)",
  color: "#D4775A",
  fontSize: 11,
  fontWeight: 700,
  whiteSpace: "nowrap",
};
