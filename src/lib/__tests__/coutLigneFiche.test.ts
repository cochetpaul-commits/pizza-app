import { describe, it, expect } from "vitest";
import { coutLigne, coutRecetteTotal, type LigneIngredient, type IngredientRef } from "@/components/fiche/ficheTypes";

const creme: IngredientRef = { id: "c", nom_court: "Crème", nom_produit: "CREME LEGERE 18% 1 L", prix_base: 0.0308, unite_base: "cl", allergenes: [], cpu: { ml: 0.00308 } };
const sauce: IngredientRef = { id: "s", nom_court: "Sauce truffe", nom_produit: "SAUCE TRUFFE 5 %", prix_base: 0.0289, unite_base: "g", allergenes: [], cpu: { g: 0.0289 } };
const l = (ingredient: IngredientRef, quantite: number, unite: string): LigneIngredient =>
  ({ key: unite + quantite, ingredient_id: ingredient.id, ingredient, quantite, unite, zone: "base" } as unknown as LigneIngredient);

describe("coutLigne", () => {
  it("crème achetée au litre et pesée en grammes : 1000 g = 1 L = 3,08 €", () => {
    expect(coutLigne(l(creme, 1000, "g"))).toBeCloseTo(3.08, 2);
    expect(coutLigne(l(creme, 100, "cl"))).toBeCloseTo(3.08, 2);
  });
  it("le total est la somme des lignes affichées", () => {
    expect(coutRecetteTotal([l(creme, 1000, "g"), l(sauce, 500, "g")], 0)).toBeCloseTo(17.53, 2);
  });
  it("produit au poids saisi en cl", () => {
    expect(coutLigne(l(sauce, 10, "cl"))).toBeCloseTo(2.89, 2);
  });
});
