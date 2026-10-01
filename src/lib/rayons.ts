import { CAT_COLORS, type Category } from "@/types/ingredients";

/**
 * Rayons (catégories de l'écran de commande, table rayons_commande) : couleur et rayon par défaut d'un produit.
 * Un produit a un rayon (ingredients.rayon_commande) ; sinon il est rangé d'après sa catégorie de fiche.
 * Partagé par l'écran de commande et l'inventaire, pour la même trame graphique partout.
 */

/** Couleur du titre de rayon : celle de sa catégorie dans les listes de produits (même couleur chez tous les fournisseurs) */
export const CATEGORIE_DU_RAYON: Record<string, Category> = {
  cremerie: "cremerie_fromage", charcuterie: "charcuterie_viande", fruits_legumes: "legumes_herbes",
  base_pizza: "epicerie_salee", epicerie_cuisine: "epicerie_salee", epicerie_sucree: "epicerie_sucree",
  maree_surgeles: "maree", hygiene: "emballage",
  bar_softs: "soft", bar_sirops: "sirops", bar_bieres: "biere", bar_vins: "vins",
  bar_liqueurs: "liqueurs", bar_spiritueux: "spiritueux", bar_cafe: "cafeteria",
  preparations: "preparation",
};
export const couleurRayon = (code: string | null | undefined) => CAT_COLORS[CATEGORIE_DU_RAYON[code ?? ""] ?? "autre"];

/** Rayon d'un produit sans rayon de commande, d'après sa catégorie de fiche */
export const RAYON_PAR_CATEGORIE: Record<Category, string> = {
  cremerie_fromage: "cremerie", charcuterie_viande: "charcuterie", legumes_herbes: "fruits_legumes", fruit: "fruits_legumes",
  epicerie_salee: "epicerie_cuisine", sauce: "epicerie_cuisine", antipasti: "epicerie_cuisine", preparation: "preparations",
  epicerie_sucree: "epicerie_sucree", maree: "maree_surgeles", surgele: "maree_surgeles", emballage: "hygiene",
  soft: "bar_softs", sirops: "bar_sirops", biere: "bar_bieres", vins: "bar_vins", liqueurs: "bar_liqueurs", spiritueux: "bar_spiritueux",
  cafeteria: "bar_cafe", autre: "autres",
};
/** Préparations maison (sorties des recettes cuisine) : rayon propre à l'inventaire, pas un rayon de commande */
export const RAYON_PREPARATIONS = { code: "preparations", libelle: "Préparations maison", ordre: 98 };
export const RAYON_AUTRES = { code: "autres", libelle: "Autres", ordre: 99 };

export function rayonDuProduit(rayonCommande: string | null | undefined, categorie: string | null | undefined): string {
  if (categorie === "preparation") return RAYON_PREPARATIONS.code;
  return rayonCommande || RAYON_PAR_CATEGORIE[categorie as Category] || RAYON_AUTRES.code;
}
