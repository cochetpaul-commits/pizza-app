"use client";

import { RequireRole } from "@/components/RequireRole";
import { AccueilEtablissement } from "@/components/accueil/AccueilEtablissement";

/** Accueil Bello Mio : « point du jour » (étape 2 de la refonte, 08/10/2026) */
export default function BelloMioDashboard() {
  return (
    <RequireRole allowedRoles={["group_admin", "manager", "equipier"]}>
      <AccueilEtablissement slug="bello" couleur="#e27f57" />
    </RequireRole>
  );
}
