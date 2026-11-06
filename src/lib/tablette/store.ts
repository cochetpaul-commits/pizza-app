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
  { valeur: 30, libelle: "30 secondes" }, { valeur: 60, libelle: "1 minute" }, { valeur: 120, libelle: "2 minutes" }, { valeur: 300, libelle: "5 minutes" }, { valeur: 600, libelle: "10 minutes" }, { valeur: 0, libelle: "Jamais" },
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
    let employe = brut ? (JSON.parse(brut) as EmployeTablette) : null;
    // Le jeton vaut 16 h (05/11/2026) : au-delà, la tablette se reverrouille au lieu de signer au nom du compte tablette
    if (employe && Date.now() - (employe.depuis ?? 0) > 16 * 3600000) { sessionStorage.removeItem(CLE_EMPLOYE); employe = null; }
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
/**
 * Verrouillage (06/11/2026, retour de Paul) : `auto` = par inactivité. On note alors la page et l'employé : si la
 * même personne retape son code, elle revient là où elle en était au lieu de l'accueil.
 */
const CLE_REPRISE = "tablette:reprise";
export function verrouillerTablette(auto = false) {
  try {
    const e = snapshot().employe;
    if (auto && e && typeof window !== "undefined") sessionStorage.setItem(CLE_REPRISE, JSON.stringify({ path: window.location.pathname + window.location.search, employe: e.id, quand: Date.now() }));
    else sessionStorage.removeItem(CLE_REPRISE);
    sessionStorage.removeItem(CLE_EMPLOYE);
  } catch { /* stockage indisponible */ }
  notifier();
}
/** La page à rouvrir après le code, si c'est la même personne qui revient (moins de 2 h), sinon null */
export function repriseApresCode(employeId: string): string | null {
  try {
    const brut = sessionStorage.getItem(CLE_REPRISE);
    sessionStorage.removeItem(CLE_REPRISE);
    if (!brut) return null;
    const r = JSON.parse(brut) as { path: string; employe: string; quand: number };
    return r.employe === employeId && Date.now() - r.quand < 2 * 3600000 && r.path && r.path !== "/tablette" ? r.path : null;
  } catch { return null; }
}

/** Pages qui tiennent la tablette éveillée (fournée en cours…) : pas de verrouillage par inactivité tant qu'une clé est posée */
const eveil = new Set<string>();
export function tenirEveille(cle: string, actif: boolean) { if (actif) eveil.add(cle); else eveil.delete(cle); }
export function estTenueEveillee(): boolean { return eveil.size > 0; }
/** L'état lu tout de suite (hors rendu) : pour décider d'une redirection sans attendre l'hydratation */
export function etatTablette(): EtatTablette { return snapshot(); }

/** Nom court pour signer une écriture faite directement en base (« Gwendal B. ») */
export function nomTablette(e: EmployeTablette): string {
  return `${e.prenom}${e.nom ? ` ${e.nom.charAt(0).toUpperCase()}.` : ""}`;
}

/** L'employé actif sur la tablette, ou null (poste de travail normal) : pour signer une action */
export function employeTabletteActif(): EmployeTablette | null {
  return snapshot().actif ? snapshot().employe : null;
}
