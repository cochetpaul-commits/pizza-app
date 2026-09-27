/**
 * Colisage des commandes (table commande_articles) : une seule source de vérité
 * par fiche fournisseur × produit, indépendante des lignes supplier_offers
 * (recréées à chaque changement de prix).
 *
 * Ce module est pur (pas d'accès base) : libellés et prix par unité de commande.
 */

export const UNITES_COMMANDE = [
  "piece", "colis", "carton", "seau", "pochette", "barquette", "bouteille",
  "sachet", "boite", "bac", "pot", "plateau", "kg", "litre",
] as const;
export type UniteCommande = (typeof UNITES_COMMANDE)[number];

/** Éléments contenus dans une unité de commande (mêmes contenants, sans kg ni litre) */
export type ElementCommande = Exclude<UniteCommande, "kg" | "litre">;
export type UniteTaille = "pc" | "g" | "kg" | "ml" | "l";

export type CommandeArticle = {
  unite_commande: UniteCommande;
  contenu_nb: number;
  element: ElementCommande | null;
  element_qte: number | null;
  element_unite: UniteTaille | null;
  commande_element_permise: boolean;
  precommande: boolean;
};

/** Champs de l'offre active utiles au prix (supplier_offers) */
export type OffrePrix = {
  unit: string | null;
  unit_price: number | null;
  pack_price: number | null;
  pack_count: number | null;
};

const LIBELLE: Record<UniteCommande, { un: string; plusieurs: string }> = {
  piece: { un: "pièce", plusieurs: "pièces" },
  colis: { un: "colis", plusieurs: "colis" },
  carton: { un: "carton", plusieurs: "cartons" },
  seau: { un: "seau", plusieurs: "seaux" },
  pochette: { un: "pochette", plusieurs: "pochettes" },
  barquette: { un: "barquette", plusieurs: "barquettes" },
  bouteille: { un: "bouteille", plusieurs: "bouteilles" },
  sachet: { un: "sachet", plusieurs: "sachets" },
  boite: { un: "boîte", plusieurs: "boîtes" },
  bac: { un: "bac", plusieurs: "bacs" },
  pot: { un: "pot", plusieurs: "pots" },
  plateau: { un: "plateau", plusieurs: "plateaux" },
  kg: { un: "kg", plusieurs: "kg" },
  litre: { un: "litre", plusieurs: "litres" },
};

/** Nom d'une unité, au singulier ou au pluriel selon n */
export function nomUnite(u: UniteCommande, n = 1): string {
  return n > 1 ? LIBELLE[u].plusieurs : LIBELLE[u].un;
}

const nombre = (n: number) => String(Math.round(n * 1000) / 1000).replace(".", ",");

/** « 1 kg », « 250 g », « 0,75 L », « 12 pc » */
export function taille(qte: number, unite: UniteTaille): string {
  return `${nombre(qte)} ${unite === "l" ? "L" : unite === "ml" ? "mL" : unite}`;
}

/**
 * Libellé de l'unité de commande, calculé (jamais saisi) :
 * « colis 2 × 1 kg », « colis 8 × 250 g », « carton de 6 boîtes », « plateau de 30 »,
 * « seau 2,5 kg », « pièce 125 g », « kg ».
 */
export function libelleColisage(a: CommandeArticle): string {
  const unite = nomUnite(a.unite_commande);
  if (a.unite_commande === "kg" || a.unite_commande === "litre") return unite;
  const t = a.element_qte != null && a.element_unite ? taille(a.element_qte, a.element_unite) : null;
  if (a.contenu_nb <= 1) return t ? `${unite} ${t}` : unite;
  if (t) return `${unite} ${nombre(a.contenu_nb)} × ${t}`;
  if (a.element) return `${unite} de ${nombre(a.contenu_nb)} ${nomUnite(a.element, a.contenu_nb)}`;
  return `${unite} de ${nombre(a.contenu_nb)}`;
}

/** Libellé d'un élément, pour la commande à l'élément : « bouteille 1 L », « bac 1 kg », « boîte » */
export function libelleElement(a: CommandeArticle): string | null {
  if (!a.commande_element_permise || !a.element) return null;
  const t = a.element_qte != null && a.element_unite ? taille(a.element_qte, a.element_unite) : null;
  return t ? `${nomUnite(a.element)} ${t}` : nomUnite(a.element);
}

/** Quantité d'un élément exprimée dans l'unité de prix de l'offre (kg, l ou pc), ou null si inconnue */
function elementEnUnitePrix(a: CommandeArticle, unitePrix: string): number | null {
  const q = a.element_qte, u = a.element_unite;
  if (unitePrix === "pc") return u === "pc" && q != null ? q : 1;
  if (q == null || !u) return null;
  if (unitePrix === "kg") return u === "kg" ? q : u === "g" ? q / 1000 : null;
  if (unitePrix === "l") return u === "l" ? q : u === "ml" ? q / 1000 : null;
  return null;
}

/**
 * Prix HT d'une unité de commande (ou d'un élément si parElement) à partir de l'offre active.
 * Renvoie null plutôt qu'un prix faux quand les unités ne se correspondent pas.
 *  - même conditionnement que l'offre (pack_count = contenu_nb) : pack_price tel quel ;
 *  - sinon prix unitaire (€/kg, €/L ou €/pièce) × contenu converti dans cette unité.
 */
export function prixUniteCommande(a: CommandeArticle, offre: OffrePrix | null, parElement = false): number | null {
  if (!offre) return null;
  const nb = parElement ? 1 : a.contenu_nb;
  if (!parElement && offre.pack_price != null && offre.pack_price > 0 && offre.pack_count != null && offre.pack_count === a.contenu_nb && a.contenu_nb > 1) {
    return arrondi(offre.pack_price);
  }
  const pu = offre.unit_price, unitePrix = (offre.unit ?? "").toLowerCase();
  if (pu == null || !(pu > 0)) return null;
  if (!parElement && a.unite_commande === "kg") return unitePrix === "kg" ? arrondi(pu) : null;
  if (!parElement && a.unite_commande === "litre") return unitePrix === "l" ? arrondi(pu) : null;
  const parEl = elementEnUnitePrix(a, unitePrix);
  return parEl == null ? null : arrondi(pu * parEl * nb);
}

const arrondi = (n: number) => Math.round(n * 10000) / 10000;

/** Champs nécessaires pour écrire une quantité lisible */
export type ArticleQuantite = { au_poids: boolean; contenu_nb: number; element: UniteCommande | null; unite_commande: UniteCommande };

/**
 * Quantité lisible en éléments ET en colis dès qu'un colis contient plusieurs éléments :
 * « 12 pots (2 colis) », « 6 bouteilles », « 18 bouteilles (1,5 colis) ». La cuisine compte à la pièce.
 * mode "uc" : q en unités de commande ; "element" : q en éléments.
 */
export function quantiteLisible(a: ArticleQuantite, q: number, mode: "uc" | "element"): string {
  const txt = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");
  const nb = a.contenu_nb;
  if (a.au_poids || !(nb > 1)) return txt(q);
  const el = a.element ?? "piece";
  if (mode === "element") {
    const colis = q / nb;
    return `${txt(q)} ${nomUnite(el, q)}${Number.isInteger(colis) ? ` (${txt(colis)} ${nomUnite(a.unite_commande, colis)})` : ""}`;
  }
  return `${txt(q * nb)} ${nomUnite(el, q * nb)} (${txt(q)} ${nomUnite(a.unite_commande, q)})`;
}
