"use client";

// ── Types ────────────────────────────────────────────────────

export interface GestionPilotageProps {
  recipeName?: string;
  recipeType: string;
}

// ── Component ────────────────────────────────────────────────

export function GestionPilotage({ recipeName: _recipeName, recipeType: _recipeType }: GestionPilotageProps) {
  return (
    <div style={{ padding: 32, textAlign: "center", color: "#999", fontSize: 13 }}>
      Donnees de vente non disponibles ici. Consultez la page Pilotage pour les statistiques.
    </div>
  );
}
