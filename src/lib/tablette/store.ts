"use client";

import { useSyncExternalStore } from "react";

/**
 * Mode tablette (30/10/2026) : réglé par appareil (localStorage). La tablette reste connectée avec son propre compte ;
 * l'employé devant l'écran s'identifie avec son code à 4 chiffres, et se déconnecte après un délai sans activité,
 * ou avec « Changer d'employé ». Les menus se limitent à Service, Cuisine et Achats et stock.
 */
export type EmployeTablette = { id: string; prenom: string; nom: string; equipe: string | null; depuis: number; /** jeton signé (API /api/tablette/identifier) : qui est devant l'écran */ jeton?: string };
export type EtatTablette = { actif: boolean; delai: number; employe: EmployeTablette | null };
export const DELAIS: { valeur: number; libelle: string }[] = [
  { valeur: 30, libelle: "30 secondes" }, { valeur: 60, libelle: "1 minute" }, { valeur: 300, libelle: "5 minutes" }, { valeur: 0, libelle: "Jamais" },
];
const CLE_ACTIF = "tablette:actif", CLE_DELAI = "tablette:delai", CLE_EMPLOYE = "tablette:employe";
const abonnes = new Set<() => void>();
let cache: EtatTablette | null = null;
const VIDE: EtatTablette = { actif: false, delai: 60, employe: null };

function lire(): EtatTablette {
  try {
    const actif = localStorage.getItem(CLE_ACTIF) === "1";
    const delai = Number(localStorage.getItem(CLE_DELAI) ?? "60");
    const brut = sessionStorage.getItem(CLE_EMPLOYE);
    const employe = brut ? (JSON.parse(brut) as EmployeTablette) : null;
    return { actif, delai: Number.isFinite(delai) ? delai : 60, employe };
  } catch { return VIDE; }
}
function snapshot(): EtatTablette {
  if (!cache) cache = lire();
  return cache;
}
function notifier() { cache = lire(); abonnes.forEach((f) => f()); }
const abonner = (f: () => void) => {
  abonnes.add(f);
  // Un autre onglet qui change le réglage : on suit
  const onStorage = () => notifier();
  window.addEventListener("storage", onStorage);
  return () => { abonnes.delete(f); window.removeEventListener("storage", onStorage); };
};

export function useTablette(): EtatTablette {
  return useSyncExternalStore(abonner, snapshot, () => VIDE);
}
export function reglerTablette(actif: boolean, delai?: number) {
  try {
    localStorage.setItem(CLE_ACTIF, actif ? "1" : "0");
    if (delai != null) localStorage.setItem(CLE_DELAI, String(delai));
    if (!actif) sessionStorage.removeItem(CLE_EMPLOYE);
  } catch { /* stockage indisponible */ }
  notifier();
}
export function identifierEmploye(e: Omit<EmployeTablette, "depuis">) {
  try { sessionStorage.setItem(CLE_EMPLOYE, JSON.stringify({ ...e, depuis: Date.now() })); } catch { /* stockage indisponible */ }
  notifier();
}
export function verrouillerTablette() {
  try { sessionStorage.removeItem(CLE_EMPLOYE); } catch { /* stockage indisponible */ }
  notifier();
}
/** L'employé actif sur la tablette, ou null (poste de travail normal) : pour signer une action */
export function employeTabletteActif(): EmployeTablette | null {
  return snapshot().actif ? snapshot().employe : null;
}
