import { describe, it, expect } from "vitest";
import { calculerHabituels, lignesCommandesNonFacturees, quantiteCommande, type RegleArticle } from "@/lib/commandeHabituels";

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

describe("lignesCommandesNonFacturees (Vinoflo, 06/10/2026 : une facture importée effaçait trois mois de commandes)", () => {
  const dates = new Map([["s1", "2026-07-24"], ["s2", "2026-08-10"], ["s3", "2026-09-03"], ["s4", "2026-09-16"], ["s5", "2026-09-24"]]);
  const lignes = ["s1", "s2", "s3", "s4", "s5"].flatMap((s) => [{ session_id: s, ingredient_id: "chianti" }, { session_id: s, ingredient_id: "prosecco" }]);
  it("sans facture, toutes les commandes comptent", () => {
    expect(lignesCommandesNonFacturees(lignes, dates, [])).toHaveLength(10);
  });
  it("une facture du 29/09 couvre les commandes des 14 jours précédents (16/09, 24/09) pour les produits qu'elle contient, et rien d'autre", () => {
    const factures = [{ date: "2026-09-29", ingredientIds: new Set(["chianti"]) }];
    const restantes = lignesCommandesNonFacturees(lignes, dates, factures);
    expect(restantes).toHaveLength(8);
    expect(restantes.find((l) => l.session_id === "s5" && l.ingredient_id === "chianti")).toBeUndefined();
    expect(restantes.find((l) => l.session_id === "s4" && l.ingredient_id === "chianti")).toBeUndefined();
    expect(restantes.find((l) => l.session_id === "s5" && l.ingredient_id === "prosecco")).toBeDefined();
    expect(restantes.filter((l) => l.session_id === "s1")).toHaveLength(2);
    expect(restantes[0].date).toBe("2026-07-24");
  });
  it("au delà de 14 jours ou avant la commande, une facture ne couvre pas", () => {
    expect(lignesCommandesNonFacturees(lignes, dates, [{ date: "2026-10-01", ingredientIds: new Set(["chianti"]) }]).filter((l) => l.session_id === "s4")).toHaveLength(2);
    expect(lignesCommandesNonFacturees(lignes, dates, [{ date: "2026-09-23", ingredientIds: new Set(["chianti"]) }]).filter((l) => l.session_id === "s5")).toHaveLength(2);
  });
  it("une ligne d'une session inconnue est ignorée", () => {
    expect(lignesCommandesNonFacturees([{ session_id: "zz", ingredient_id: "x" }], dates, [])).toHaveLength(0);
  });
  it("les habituels reviennent : 5 commandes sur 90 jours font un habituel même après l'import d'une facture", () => {
    const factures = [{ date: "2026-09-29", ingredientIds: new Set(["chianti"]) }];
    const achats = lignesCommandesNonFacturees(lignes, dates, factures).map((l) => ({ ingredient_id: l.ingredient_id, date: l.date, quantite: 2, mode: "uc" as const }));
    achats.push({ ingredient_id: "chianti", date: "2026-09-29", quantite: 2, mode: "uc" });
    const h = calculerHabituels(achats, new Map([["chianti", colis(80, 6)], ["prosecco", colis(60, 6)]]));
    expect(h.get("chianti")?.nb_achats).toBe(4);   // 3 commandes non couvertes + la facture
    expect(h.get("prosecco")?.nb_achats).toBe(5);
  });
});

