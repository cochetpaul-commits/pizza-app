"use client";

import { useState } from "react";
import { RequireRole } from "@/components/RequireRole";
import { moisCourant, TableauPourboires } from "@/components/pourboires/PourboiresMois";

export default function PourboiresPage() {
  const [mois, setMois] = useState(moisCourant());
  return (
    <RequireRole permission="heures.edit_team">
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px 40px" }}>
        <h1 style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 24, fontWeight: 700, color: "#1a1a1a", margin: "0 0 4px" }}>Pourboires de l&apos;équipe</h1>
        <div style={{ fontSize: 13, color: "#999", marginBottom: 16 }}>Répartition au prorata des jours de présence, à jour à la veille.</div>
        <TableauPourboires mois={mois} onMois={setMois} />
      </div>
    </RequireRole>
  );
}
