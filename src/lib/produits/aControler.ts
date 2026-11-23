import type { Ingredient, LatestOffer } from "@/types/ingredients";

/**
 * Fiches « à contrôler » (24/11/2026, retour de Paul : rien ne disait quoi vérifier). Les fiches créées par un import
 * de facture ou un inventaire naissent « à contrôler » ; on dit ici, pour chacune, ce qui cloche vraiment.
 * Une fiche sans point est « prête à valider ». Logique pure.
 */
export type PointControle = "categorie" | "prix" | "prix_suspect" | "nom";
export const LIBELLE_POINT: Record<PointControle, string> = {
  categorie: "Catégorie à choisir",
  prix: "Sans prix",
  prix_suspect: "Prix à vérifier",
  nom: "Nom de facture",
};

export function pointsAControler(x: Pick<Ingredient, "name" | "category">, offre: Pick<LatestOffer, "unit" | "unit_price"> | undefined, aUnPrix: boolean): PointControle[] {
  const points: PointControle[] = [];
  if (!x.category || x.category === "autre") points.push("categorie");
  if (!aUnPrix) points.push("prix");
  // Moins de 15 centimes la pièce : presque toujours un prix au gramme ou au conditionnement mal lu (thé à 0,09 € pc)
  else if (offre?.unit === "pc" && offre.unit_price != null && offre.unit_price > 0 && offre.unit_price < 0.15) points.push("prix_suspect");
  // Nom brut recopié de la facture : références entre crochets, mentions douanières, ou très long
  const nom = x.name ?? "";
  if (/\[[^\]]*\]|NON PREFERENTIAL|ORIGIN\b/i.test(nom) || nom.length > 48) points.push("nom");
  return points;
}
