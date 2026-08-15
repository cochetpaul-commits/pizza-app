import type { Ingredient, LatestOffer } from "@/types/ingredients";
import { recipeParamsParts } from "@/lib/formatPrice";
import { cachedSupplierColor } from "@/lib/supplierColors";
import { parseAllergens } from "@/lib/allergens";

/**
 * Paramètres produit affichés sous un ingrédient de recette
 * (charte affichage produit) : prix d'achat, équivalent €/kg,
 * conditionnement, fournisseur (pastille colorée), allergènes.
 */
export type RecipeIngredientMeta = {
  prix: string | null;
  perKg: string | null;
  cond: string | null;
  fournisseur: string | null;
  fournisseurColor: string | null;
  allergenes: string[];
};

export function buildRecipeMeta(
  ing: Pick<Ingredient, "piece_weight_g" | "piece_volume_ml" | "cost_per_kg" | "cost_per_unit" | "purchase_price" | "purchase_unit_label" | "allergens">,
  offer: LatestOffer | null | undefined,
  supplier: string | null
): RecipeIngredientMeta {
  const parts = recipeParamsParts(ing, offer);
  return {
    ...parts,
    fournisseur: supplier,
    fournisseurColor: supplier && supplier !== "maison" ? cachedSupplierColor(supplier) : supplier ? "#5e7a5e" : null,
    allergenes: parseAllergens(ing.allergens),
  };
}
