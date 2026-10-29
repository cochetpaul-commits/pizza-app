"use client";

import { RequireRole } from "@/components/RequireRole";
import { Produits } from "@/components/analyse/Produits";

/** Ventes › Par produit (29/10/2026) : remplace l'ancien rapport de vente, redistribué dans Chiffre d'affaires, Couverts et ici. */
export default function Page() {
  return (
    <RequireRole permission="performances.view">
      <Produits />
    </RequireRole>
  );
}
