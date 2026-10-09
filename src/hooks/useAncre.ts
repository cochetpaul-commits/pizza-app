"use client";

import { useEffect } from "react";

/**
 * Fait défiler la page jusqu'à l'élément désigné par le `#ancre` de l'URL une fois le contenu prêt.
 * Les pages chargent leurs données après le montage : le défilement natif du navigateur arrive trop tôt.
 */
export function useAncre(pret: boolean) {
  useEffect(() => {
    if (!pret || typeof window === "undefined") return;
    const id = window.location.hash.replace(/^#/, "");
    if (!id) return;
    const t = window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    return () => window.clearTimeout(t);
  }, [pret]);
}
