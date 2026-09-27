import { describe, it, expect } from "vitest";
import { calculerHabituels, quantiteCommande, type RegleArticle } from "@/lib/commandeHabituels";

const colis = (prix: number, nb: number, element = false): RegleArticle => ({ prix_uc: prix, contenu_nb: nb, element_permis: element, au_poids: false });

describe("quantiteCommande (une ligne de facture = une livraison, convertie par le montant)", () => {
  it("burrata facturée « 2 pc » à 24,70 € = 2 colis de 20", () => {
    expect(quantiteCommande({ ingredient_id: "b", date: "2026-09-01", montant: 49.39 }, colis(24.7, 20))).toEqual({ quantite: 2, mode: "uc" });
  });
  it("hausse de prix de quelques % : l'arrondi retombe juste", () => {
    expect(quantiteCommande({ ingredient_id: "b", date: "2026-09-01", montant: 201.6 }, colis(24.7, 20))).toEqual({ quantite: 8, mode: "uc" });
  });
  it("½ colis de crème = 6 bouteilles quand la bouteille est permise", () => {
    expect(quantiteCommande({ ingredient_id: "c", date: "2026-09-01", montant: 25.84 }, colis(51.72, 12, true))).toEqual({ quantite: 6, mode: "element" });
  });
  it("sans commande à l'élément, une fraction est arrondie au colis (jamais 0)", () => {
    expect(quantiteCommande({ ingredient_id: "o", date: "2026-09-01", montant: 6.65 }, colis(19.57, 90))).toEqual({ quantite: 1, mode: "uc" });
  });
  it("au poids : pas de 0,5 kg, minimum 1", () => {
    const kg: RegleArticle = { prix_uc: 1.23, contenu_nb: 1, element_permis: false, au_poids: true };
    expect(quantiteCommande({ ingredient_id: "k", date: "2026-09-01", montant: 1.9 }, kg)).toEqual({ quantite: 1.5, mode: "uc" });
    expect(quantiteCommande({ ingredient_id: "k", date: "2026-09-01", montant: 0.12 }, kg)).toEqual({ quantite: 1, mode: "uc" });
  });
  it("prix inconnu (poids variable) : l'achat compte, 1 unité proposée", () => {
    expect(quantiteCommande({ ingredient_id: "x", date: "2026-09-01", montant: 10 }, colis(0, 1))).toEqual({ quantite: 1, mode: "uc" });
    expect(quantiteCommande({ ingredient_id: "x", date: "2026-09-01", montant: 0 }, colis(0, 1))).toBeNull();
  });
});

describe("calculerHabituels (médiane par livraison)", () => {
  const regles = new Map([["b", colis(24.7, 20)], ["c", colis(51.72, 12, true)], ["beurre", colis(4.56, 1)]]);
  it("facture hebdomadaire à plusieurs livraisons : médiane par ligne, pas la somme de la semaine", () => {
    // Semaine 1 : 3 livraisons de 6, 6, 4 beurres ; semaine 2 : 6 et 8
    const h = calculerHabituels([
      { ingredient_id: "beurre", date: "2026-09-07", montant: 6 * 4.56 },
      { ingredient_id: "beurre", date: "2026-09-07", montant: 6 * 4.56 },
      { ingredient_id: "beurre", date: "2026-09-07", montant: 4 * 4.56 },
      { ingredient_id: "beurre", date: "2026-09-14", montant: 6 * 4.56 },
      { ingredient_id: "beurre", date: "2026-09-14", montant: 8 * 4.56 },
    ], regles);
    expect(h.get("beurre")).toEqual({ nb_achats: 2, quantite: 6, mode: "uc", derniere: "2026-09-14" });
  });
  it("médiane d'un nombre pair de livraisons, commandes de l'appli comprises", () => {
    const h = calculerHabituels([
      { ingredient_id: "b", date: "2026-09-01", montant: 24.7 },
      { ingredient_id: "b", date: "2026-09-03", montant: 74.1 },
      { ingredient_id: "b", date: "2026-09-05", montant: 49.4 },
      { ingredient_id: "b", date: "2026-09-08", quantite: 2, mode: "uc" },
    ], regles);
    expect(h.get("b")).toEqual({ nb_achats: 4, quantite: 2, mode: "uc", derniere: "2026-09-08" });
  });
  it("crème : colis et bouteilles mélangés, médiane en colis puis arrondi (½ colis → 6 bouteilles)", () => {
    const h = calculerHabituels([
      { ingredient_id: "c", date: "2026-09-01", montant: 25.86 },
      { ingredient_id: "c", date: "2026-09-02", quantite: 6, mode: "element" },
      { ingredient_id: "c", date: "2026-09-04", montant: 51.72 },
    ], regles);
    expect(h.get("c")).toMatchObject({ nb_achats: 3, quantite: 6, mode: "element" });
  });
  it("produit sans colisage ignoré", () => {
    expect(calculerHabituels([{ ingredient_id: "z", date: "2026-09-01", montant: 5 }], regles).size).toBe(0);
  });
});
