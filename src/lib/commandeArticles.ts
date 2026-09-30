/**
 * Colisage des commandes (table commande_articles) : une seule source de vérité
 * par fiche fournisseur × produit, indépendante des lignes supplier_offers
 * (recréées à chaque changement de prix).
 *
 * Ce module est pur (pas d'accès base) : libellés et prix par unité de commande.
 */

export const UNITES_COMMANDE = [
  "piece", "colis", "carton", "seau", "pochette", "barquette", "bouteille",
  "sachet", "paquet", "boite", "bac", "pot", "plateau", "filet", "botte", "fut",
  "bidon", "bloc", "brick", "cagette", "meule", "pack", "poche", "sac", "kg", "litre",
] as const;
export type UniteCommande = (typeof UNITES_COMMANDE)[number];
/** Types de colisage / d'élément (tout sauf le poids et le volume) : liste unique de la fiche produit et de la commande */
export const TYPES_COLISAGE = UNITES_COMMANDE.filter((u) => u !== "kg" && u !== "litre") as Exclude<UniteCommande, "kg" | "litre">[];
/** Libellé d'un type pour un menu déroulant (« Boîte », « Fût », « Pièce »…) */
export function libelleType(u: string): string {
  const l = LIBELLE[u as UniteCommande]?.un ?? u;
  return l.charAt(0).toUpperCase() + l.slice(1);
}

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
  paquet: { un: "paquet", plusieurs: "paquets" },
  boite: { un: "boîte", plusieurs: "boîtes" },
  bac: { un: "bac", plusieurs: "bacs" },
  pot: { un: "pot", plusieurs: "pots" },
  plateau: { un: "plateau", plusieurs: "plateaux" },
  filet: { un: "filet", plusieurs: "filets" },
  botte: { un: "botte", plusieurs: "bottes" },
  fut: { un: "fût", plusieurs: "fûts" },
  bidon: { un: "bidon", plusieurs: "bidons" },
  bloc: { un: "bloc", plusieurs: "blocs" },
  brick: { un: "brick", plusieurs: "bricks" },
  cagette: { un: "cagette", plusieurs: "cagettes" },
  meule: { un: "meule", plusieurs: "meules" },
  pack: { un: "pack", plusieurs: "packs" },
  poche: { un: "poche", plusieurs: "poches" },
  sac: { un: "sac", plusieurs: "sacs" },
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
 * « colis de 8 pots 250 g », « carton de 6 bouteilles 750 mL », « colis 2 × 1 kg » (éléments sans nom),
 * « carton de 6 boîtes », « plateau de 30 », « seau 2,5 kg », « pièce 125 g », « kg ».
 * (Miroir SQL : public.cmd_libelle_colisage.)
 */
export function libelleColisage(a: CommandeArticle): string {
  const unite = nomUnite(a.unite_commande);
  if (a.unite_commande === "kg" || a.unite_commande === "litre") return unite;
  const t = a.element_qte != null && a.element_unite ? taille(a.element_qte, a.element_unite) : null;
  if (a.contenu_nb <= 1) return t ? `${unite} ${t}` : unite;
  const nomme = a.element && a.element !== "piece";
  if (t && nomme) return `${unite} de ${nombre(a.contenu_nb)} ${nomUnite(a.element!, a.contenu_nb)} ${t}`;
  if (t) return `${unite} ${nombre(a.contenu_nb)} × ${t}`;
  if (nomme) return `${unite} de ${nombre(a.contenu_nb)} ${nomUnite(a.element!, a.contenu_nb)}`;
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
  const auPoids = a.unite_commande === "kg" || a.unite_commande === "litre";
  const colis = offre.pack_price != null && offre.pack_price > 0 && offre.pack_count != null && offre.pack_count > 0;
  // Même conditionnement que l'offre (pack_count = contenu_nb, y compris un colis de 1 : « paquet de 1 kg à 20,75 € ») : prix du colis tel quel
  if (!parElement && !auPoids && colis && offre.pack_count === a.contenu_nb) {
    return arrondi(offre.pack_price!);
  }
  const pu = offre.unit_price, unitePrix = (offre.unit ?? "").toLowerCase();
  // Offre au colis sans prix unitaire (vécu 30/09, Cafés Celtik) : prix à l'élément = prix du colis ÷ nombre d'éléments
  if ((pu == null || !(pu > 0)) && colis && !auPoids) {
    return arrondi((offre.pack_price! / offre.pack_count!) * nb);
  }
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

/**
 * Quantité affichée sur l'écran de commande, toujours avec son unité :
 * « 1 colis (5 kg) », « 3 filets », « 2 kg », « 12 pots (2 colis) ».
 * (Le mail et le PDF composent leur propre texte à partir de quantiteLisible.)
 */
export function quantiteAffichee(
  a: ArticleQuantite & { element_qte?: number | null; element_unite?: UniteTaille | null },
  q: number, mode: "uc" | "element",
): string {
  const txt = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");
  if (a.au_poids) return `${txt(q)} ${nomUnite(a.unite_commande, q)}`;
  if (a.contenu_nb > 1) return quantiteLisible(a, q, mode);
  const t = a.element_qte != null && a.element_unite ? ` (${taille(q * a.element_qte, a.element_unite)})` : "";
  return `${txt(q)} ${nomUnite(a.unite_commande, q)}${t}`;
}

/** Nom de zone de stockage à l'affichage : « CAVE A VIN » → « Cave à vin » (la base garde ses majuscules) */
export function libelleZone(nom: string): string {
  const t = nom.trim().toLocaleLowerCase("fr").replace(/(^|\s)a(?=\s)/g, "$1à");
  return t.charAt(0).toLocaleUpperCase("fr") + t.slice(1);
}

export const UNITES_TAILLE: UniteTaille[] = ["pc", "g", "kg", "ml", "l"];

/**
 * Conditionnement saisi sur la fiche produit (bloc « Commande chez … ») : contrôlé avant écriture,
 * avec les mêmes règles que la base (commande_articles) et quelques règles de bon sens :
 * au poids (kg, litre) → contenu 1, sans élément ; commande à l'élément seulement s'il y a un élément
 * et plusieurs éléments par unité de commande.
 */
export function validerConditionnement(x: {
  unite_commande?: unknown; contenu_nb?: unknown; element?: unknown;
  element_qte?: unknown; element_unite?: unknown; commande_element_permise?: unknown;
}): { ok: true; valeur: Omit<CommandeArticle, "precommande"> } | { ok: false; erreur: string } {
  const unite = String(x.unite_commande ?? "");
  if (!(UNITES_COMMANDE as readonly string[]).includes(unite)) return { ok: false, erreur: "Unité de commande inconnue" };
  const auPoids = unite === "kg" || unite === "litre";
  const contenu = auPoids ? 1 : Number(x.contenu_nb);
  if (!Number.isFinite(contenu) || contenu <= 0) return { ok: false, erreur: "Le contenu doit être un nombre positif" };
  const elementBrut = x.element == null || x.element === "" ? null : String(x.element);
  if (elementBrut && (!(UNITES_COMMANDE as readonly string[]).includes(elementBrut) || elementBrut === "kg" || elementBrut === "litre")) {
    return { ok: false, erreur: "Élément inconnu" };
  }
  const element = auPoids ? null : (elementBrut as ElementCommande | null);
  const qteBrute = x.element_qte == null || x.element_qte === "" ? null : Number(x.element_qte);
  const uniteTaille = x.element_unite == null || x.element_unite === "" ? null : String(x.element_unite);
  if ((qteBrute == null) !== (uniteTaille == null)) return { ok: false, erreur: "Taille : indiquer la quantité et l'unité, ou aucune des deux" };
  if (qteBrute != null && (!Number.isFinite(qteBrute) || qteBrute <= 0)) return { ok: false, erreur: "Taille : quantité positive" };
  if (uniteTaille != null && !(UNITES_TAILLE as string[]).includes(uniteTaille)) return { ok: false, erreur: "Taille : unité inconnue" };
  const permise = !!x.commande_element_permise;
  if (permise && (!element || contenu <= 1)) {
    return { ok: false, erreur: "Commande à l'élément : il faut un élément et plusieurs éléments par unité de commande" };
  }
  return {
    ok: true,
    valeur: {
      unite_commande: unite as UniteCommande, contenu_nb: contenu, element,
      element_qte: auPoids ? null : qteBrute, element_unite: auPoids ? null : (uniteTaille as UniteTaille | null),
      commande_element_permise: permise,
    },
  };
}
