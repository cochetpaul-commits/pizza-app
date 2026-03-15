"use client";

import Link from "next/link";
import { AppNav } from "@/components/AppNav";
import { RequireRole } from "@/components/RequireRole";

const tiles = [
  { label: "Pilotage", sub: "CA Popina, indicateurs", href: "/pilotage" },
  { label: "Finances", sub: "Comptes & flux", href: "/finances" },
  { label: "Factures", sub: "Import fournisseurs", href: "/invoices" },
  { label: "Variations & Alertes", sub: "Ecarts prix, seuils", href: "/variations-prix" },
  { label: "Masse salariale", sub: "Charges, simulateur", href: "/rh/masse-salariale" },
  { label: "Rapports RH", sub: "Bilans mensuels, export SILAE", href: "/rh/rapports" },
  { label: "Admin", sub: "Utilisateurs, roles", href: "/admin/utilisateurs" },
];

export default function GestionHubPM() {
  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <div style={{ minHeight: "100dvh", background: "#f2ede4" }}>
        <AppNav />
        <div style={{ maxWidth: 600, margin: "0 auto", padding: "24px 16px 40px" }}>

          <h1 style={heading}>Gestion</h1>
          <p style={subheading}>Piccola Mia</p>

          <div style={{ display: "grid", gap: 12, marginTop: 20 }}>
            {tiles.map(t => (
              <Link key={t.href} href={t.href} style={{ textDecoration: "none", color: "inherit" }}>
                <div style={tileStyle}>
                  <div>
                    <p style={tileTitle}>{t.label}</p>
                    <p style={tileSub}>{t.sub}</p>
                  </div>
                  <span style={pill}>Ouvrir &rarr;</span>
                </div>
              </Link>
            ))}
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
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
  color: "#1a1a1a",
  letterSpacing: 1,
  textTransform: "uppercase",
};

const subheading: React.CSSProperties = {
  margin: "4px 0 0",
  fontSize: 13,
  color: "#b8a800",
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

const pill: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  height: 28,
  padding: "0 12px",
  borderRadius: 20,
  background: "rgba(245,230,66,0.12)",
  border: "1px solid rgba(245,230,66,0.30)",
  color: "#b8a800",
  fontSize: 11,
  fontWeight: 700,
  whiteSpace: "nowrap",
};
