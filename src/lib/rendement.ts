import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Calcule le prix d'un ingrédient dérivé à partir du prix parent et du rendement.
 * rendement = poids_après / poids_avant (ex: 0.625 pour 62,5%)
 */
export function computeDerivedPrice(
  parentCostPerUnit: number,
  rendement: number,
): number {
  if (!rendement || rendement <= 0 || rendement > 1) return parentCostPerUnit;
  return parentCostPerUnit / rendement;
}

/**
 * Calcule le rendement à partir du poids brut et du poids net.
 */
export function computeRendement(poidsBrut: number, poidsNet: number): number {
  if (!poidsBrut || poidsBrut <= 0) return 1;
  if (!poidsNet || poidsNet <= 0) return 0;
  return poidsNet / poidsBrut;
}

/**
 * Quand le prix du parent change, met à jour le cost_per_unit de tous ses dérivés.
 */
export async function updateDerivedIngredients(
  supabaseClient: SupabaseClient,
  parentId: string,
  newParentPrice: number,
) {
  const { data: derived } = await supabaseClient
    .from("ingredients")
    .select("id, rendement")
    .eq("parent_ingredient_id", parentId)
    .eq("is_derived", true);

  for (const d of derived ?? []) {
    const newPrice = computeDerivedPrice(newParentPrice, d.rendement);
    await supabaseClient
      .from("ingredients")
      .update({ purchase_price: newPrice, purchase_unit: 1, purchase_unit_label: "kg" })
      .eq("id", d.id);
  }
}
