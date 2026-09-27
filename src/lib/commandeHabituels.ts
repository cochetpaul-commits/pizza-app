/**
 * « Habituels » d'un établissement chez un fournisseur en commande simplifiée :
 * produits achetés sur 90 jours, d'après les factures et les commandes envoyées.
 *
 * Maël facture à la semaine : une facture regroupe plusieurs bons de livraison, et chaque LIGNE
 * de facture correspond à une livraison. La quantité habituelle est donc la MÉDIANE par ligne
 * (par livraison), pas la somme de la semaine (vécu 28/09 : beurre affiché 12 au lieu de 6).
 *
 * Les factures Maël n'ont pas d'unité fiable (une ligne « 2 pc » à 24,70 € = 2 colis de 20 burratas,
 * les légumes sont au poids réel) : chaque ligne est convertie en unités de commande par le MONTANT,
 * montant facturé ÷ prix actuel d'une unité de commande.
 */

export type AchatBrut = {
  ingredient_id: string;
  date: string; // AAAA-MM-JJ
  /** Quantité déjà en unités de commande (commandes de l'appli) */
  quantite?: number;
  mode?: "uc" | "element";
  /** Montant HT facturé (factures) : converti par le prix d'une unité de commande */
  montant?: number;
};

export type RegleArticle = {
  /** Prix actuel d'une unité de commande (colis, pièce…) */
  prix_uc: number | null;
  /** Nombre d'éléments par unité de commande */
  contenu_nb: number;
  /** Commande à l'élément permise (ex. crème à la bouteille) */
  element_permis: boolean;
  /** Vendu au poids ou au volume (unite_commande kg ou litre) : pas de 0,5 */
  au_poids: boolean;
};

/** nb_achats : jours d'achat distincts (tri et seuil) ; quantite / mode : médiane par livraison */
export type Habituel = { nb_achats: number; quantite: number; mode: "uc" | "element"; derniere: string };

/** Un produit est « habituel » à partir de 3 jours d'achat distincts sur 90 jours (factures et commandes envoyées) */
export const SEUIL_HABITUEL = 3;

const TOLERANCE = 0.15;

/** Quantité brute d'une livraison, en unités de commande (nombre à virgule), ou null si inconnue */
export function unitesCommande(a: AchatBrut, r: RegleArticle): number | null {
  if (a.quantite != null && a.mode) {
    if (!(a.quantite > 0)) return null;
    return a.mode === "element" && r.contenu_nb > 0 ? a.quantite / r.contenu_nb : a.quantite;
  }
  if (a.montant == null || !(a.montant > 0) || !r.prix_uc || !(r.prix_uc > 0)) return null;
  return a.montant / r.prix_uc;
}

/**
 * Arrondit une quantité en unités de commande au pas de commande, minimum 1 :
 * au poids par 0,5 ; une fraction de colis (½ colis de crème) en éléments si c'est permis ; sinon en colis entiers.
 */
export function arrondirCommande(n: number, r: RegleArticle): { quantite: number; mode: "uc" | "element" } {
  if (r.au_poids) return { quantite: Math.max(1, Math.round(n * 2) / 2), mode: "uc" };
  const entier = Math.round(n);
  if (r.element_permis && r.contenu_nb > 1 && (entier === 0 || Math.abs(n - entier) > TOLERANCE)) {
    return { quantite: Math.max(1, Math.round(n * r.contenu_nb)), mode: "element" };
  }
  return { quantite: Math.max(1, entier), mode: "uc" };
}

/** Quantité d'une livraison, arrondie ; 1 unité si le prix est inconnu (poids variable) */
export function quantiteCommande(a: AchatBrut, r: RegleArticle): { quantite: number; mode: "uc" | "element" } | null {
  const n = unitesCommande(a, r);
  if (n != null) return arrondirCommande(n, r);
  // Prix d'une unité de commande inconnu (charcuterie à poids variable facturée au kilo) :
  // l'achat compte quand même, avec 1 unité proposée
  if (a.montant != null && a.montant > 0) return { quantite: 1, mode: "uc" };
  return null;
}

function mediane(v: number[]): number {
  const t = [...v].sort((a, b) => a - b);
  const m = Math.floor(t.length / 2);
  return t.length % 2 ? t[m] : (t[m - 1] + t[m]) / 2;
}

/**
 * Habituels par produit : nombre de jours d'achat distincts sur la période (tri et seuil)
 * et quantité médiane PAR LIVRAISON (une ligne de facture ou de commande = une livraison).
 */
export function calculerHabituels(achats: AchatBrut[], regles: Map<string, RegleArticle>): Map<string, Habituel> {
  const parProduit = new Map<string, { jours: Set<string>; livraisons: number[] }>();
  for (const a of achats) {
    const r = regles.get(a.ingredient_id);
    if (!r) continue;
    const n = unitesCommande(a, r);
    if (n == null && !(a.montant != null && a.montant > 0)) continue;
    let p = parProduit.get(a.ingredient_id);
    if (!p) { p = { jours: new Set(), livraisons: [] }; parProduit.set(a.ingredient_id, p); }
    p.jours.add(a.date);
    if (n != null) p.livraisons.push(n);
  }
  const res = new Map<string, Habituel>();
  for (const [id, p] of parProduit) {
    const r = regles.get(id)!;
    const q = p.livraisons.length ? arrondirCommande(mediane(p.livraisons), r) : { quantite: 1, mode: "uc" as const };
    res.set(id, { nb_achats: p.jours.size, quantite: q.quantite, mode: q.mode, derniere: [...p.jours].sort().pop()! });
  }
  return res;
}
