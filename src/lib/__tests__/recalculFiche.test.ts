import { describe, it, expect } from "vitest";
import { recalculerFiche } from "@/lib/fiche/recalcul";
import type { IngredientRef } from "@/components/fiche/ficheTypes";

const ing = (id: string, prix_base: number, unite_base: "g" | "cl" | "pc", cpu: IngredientRef["cpu"]): IngredientRef =>
  ({ id, nom_court: id, nom_produit: id, prix_base, unite_base, allergenes: [], cpu });

describe("recalculerFiche", () => {
  const parId = new Map([
    ["creme", ing("creme", 0.0308, "cl", { ml: 0.00308 })],
    ["truffe", ing("truffe", 0.0289, "g", { g: 0.0289 })],
  ]);
  it("crème truffe : 1000 g de crème au litre et 500 g de sauce", () => {
    const c = recalculerFiche({ id: "x", category: "preparation", portions_count: 1, ball_weight_g: null, cooked_weight_g: null, sell_price: null },
      [{ ingredient_id: "creme", qty: 1000, unit: "g" }, { ingredient_id: "truffe", qty: 500, unit: "g" }], parId);
    expect(c.total_cost).toBe(17.53);
    expect(c.yield_grams).toBe(1500);
    expect(c.cost_per_kg).toBe(11.69);
    expect(c.margin_rate).toBeNull();
  });
  it("poids cuit prioritaire et portions", () => {
    const c = recalculerFiche({ id: "x", category: "plat_cuisine", portions_count: 5, ball_weight_g: null, cooked_weight_g: 1000, sell_price: 10 },
      [{ ingredient_id: "truffe", qty: 1000, unit: "g" }], parId);
    expect(c.cost_per_portion).toBe(5.78);
    expect(c.cost_per_kg).toBe(28.9);
    expect(c.poids_cru).toBe(1000);
    expect(c.margin_rate).toBeCloseTo(0.422, 3);
  });
});
