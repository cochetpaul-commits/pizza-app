"use client";

import { useSyncExternalStore } from "react";

const REQUETE = "(min-width: 768px)";

function abonner(rappel: () => void) {
  const mq = window.matchMedia(REQUETE);
  mq.addEventListener("change", rappel);
  return () => mq.removeEventListener("change", rappel);
}

/**
 * Vrai sur ordinateur et tablette (barre latérale affichée, ≥ 768 px), faux sur téléphone.
 * Même point de rupture que la mise en page (globals.css) : une page peut proposer une
 * présentation bureau sans toucher à sa version mobile. Côté serveur : faux (mobile d'abord).
 */
export function useBureau(): boolean {
  return useSyncExternalStore(abonner, () => window.matchMedia(REQUETE).matches, () => false);
}
