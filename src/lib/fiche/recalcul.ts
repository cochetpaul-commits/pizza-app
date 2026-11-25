/**
 * Recalcul des coûts d'une fiche hors de l'éditeur (25/11/2026) : même règle que la fiche ouverte
 * (coutRecetteTotal, pâton des pizzas, poids des lignes), avec les prix du jour.
 * Poids de référence = poids cuit s'il est saisi, sinon poids cru (somme des ingrédients).
 */
import { coutRecetteTotal, coutPaton, coutPortion, ligneWeightG, PATON_BASE, type IngredientRef, type LigneIngredient } from "@/components/fiche/ficheTypes";

export type FicheBrute = {
  id: string;
  category: string | null;
  portions_count: number | null;
  ball_weight_g: number | null;
  cooked_weight_g: number | null;
  sell_price: number | null;
};
export type LigneBrute = { ingredient_id: string | null; qty: number | null; unit: string | null };

export type CoutsFiche = { total_cost: number; cost_per_portion: number; yield_grams: number; cost_per_kg: number | null; poids_cru: number; margin_rate: number | null };

const r2 = (n: number) => Math.round(n * 100) / 100;

export function recalculerFiche(fiche: FicheBrute, lignes: LigneBrute[], parId: Map<string, IngredientRef>): CoutsFiche {
  const pizza = fiche.category === "pizza";
  const lignesFiche: LigneIngredient[] = lignes.map((l, i) => {
    const ing = l.ingredient_id ? parId.get(l.ingredient_id) ?? null : null;
    return { key: String(i), ingredient_id: l.ingredient_id, ingredient: ing, quantite: Number(l.qty) || 0, unite: l.unit ?? ing?.unite_base ?? "g", zone: "apres_four" } as LigneIngredient;
  });
  const paton = pizza ? (Number(fiche.ball_weight_g) || PATON_BASE.poids) : 0;
  const total = coutRecetteTotal(lignesFiche, pizza ? coutPaton(paton, PATON_BASE.cout, PATON_BASE.poids) : 0);
  const portions = Math.max(1, Number(fiche.portions_count) || 1);
  const cpp = coutPortion(total, portions);
  const poidsCru = lignesFiche.reduce((a, l) => a + ligneWeightG(l), 0) + paton;
  const cuit = Number(fiche.cooked_weight_g) || 0;
  const ref = cuit > 0 ? cuit : poidsCru;
  const ht = Number(fiche.sell_price) || 0;
  return {
    total_cost: r2(total),
    cost_per_portion: r2(cpp),
    yield_grams: ref > 0 ? Math.round(ref) : 0,
    cost_per_kg: ref > 0 && total > 0 ? r2((total / ref) * 1000) : null,
    poids_cru: Math.round(poidsCru),
    margin_rate: ht > 0 ? 1 - cpp / ht : null,
  };
}
