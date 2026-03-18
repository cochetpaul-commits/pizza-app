"use client";

import { RequireRole } from "@/components/RequireRole";

export default function NouveauDevisPage() {
  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px 40px" }}>
        <h1 style={h1Style}>Creer un devis</h1>
        <p style={placeholder}>Creer un devis — bientot disponible</p>
      </div>
    </RequireRole>
  );
}

const h1Style: React.CSSProperties = {
  fontFamily: "var(--font-oswald), Oswald, sans-serif",
  fontSize: 22,
  fontWeight: 700,
  letterSpacing: 1,
  marginBottom: 16,
  color: "#1a1a1a",
};

const placeholder: React.CSSProperties = {
  color: "#999",
  fontSize: 14,
  textAlign: "center",
  marginTop: 60,
};
