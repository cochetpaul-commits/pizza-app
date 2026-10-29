"use client";

import { useState } from "react";
import { RequireRole } from "@/components/RequireRole";
import { moisCourant, TableauPourboires } from "@/components/pourboires/PourboiresMois";
import { useBureau } from "@/hooks/useBureau";
import { MUTED, h1 } from "@/components/ui/charte";

export default function PourboiresPage() {
  const [mois, setMois] = useState(moisCourant());
  const bureau = useBureau();
  return (
    <RequireRole permission="heures.edit_team">
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: bureau ? "18px 28px 60px" : "12px 14px 60px" }}>
        <h1 style={h1(bureau)}>Pourboires de l&apos;équipe</h1>
        <div style={{ fontSize: 13, color: MUTED, margin: "4px 0 14px" }}>Répartition au prorata des jours de présence, à jour à la veille.</div>
        <TableauPourboires mois={mois} onMois={setMois} />
      </div>
    </RequireRole>
  );
}
