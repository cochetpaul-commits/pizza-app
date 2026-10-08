"use client";

import { RequireRole } from "@/components/RequireRole";
import { AccueilEtablissement } from "@/components/accueil/AccueilEtablissement";

/** Accueil Piccola Mia : « point du jour » avec les prochains événements (étape 2 de la refonte, 08/10/2026) */
export default function PiccolaMiaDashboard() {
  return (
    // "manager" manquant ici provoquait une boucle / ↔ /piccola-mia
    // (RequireRole renvoyait vers / qui renvoyait ici) — Safari coupe
    // après 100 redirections : « Application error » sur le Mac Piccola
    <RequireRole allowedRoles={["group_admin", "manager", "equipier"]}>
      <AccueilEtablissement slug="piccola" couleur="#b5960f" evenements />
    </RequireRole>
  );
}
