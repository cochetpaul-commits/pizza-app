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

const REQUETE_LARGE = "(min-width: 1100px)";

function abonnerLarge(rappel: () => void) {
  const mq = window.matchMedia(REQUETE_LARGE);
  mq.addEventListener("change", rappel);
  return () => mq.removeEventListener("change", rappel);
}

/**
 * Vrai sur un grand écran (≥ 1100 px) : les tableaux à beaucoup de colonnes (éditeur de commande,
 * commande simplifiée, feuille d'inventaire) y tiennent en largeur. Sur iPad (768–1099 px) ces
 * écrans gardent la mise en page bureau (barre latérale, tuiles, cadres) mais leurs lignes passent
 * en trois colonnes, comme sur téléphone, au lieu d'un tableau à faire défiler.
 */
export function useLarge(): boolean {
  return useSyncExternalStore(abonnerLarge, () => window.matchMedia(REQUETE_LARGE).matches, () => false);
}
