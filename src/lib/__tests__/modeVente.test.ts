import { describe, it, expect } from "vitest";
import { modeVenteParDefaut, calculKilo, etatFoodCost, prixPourObjectif, avecRestaurant, avecTraiteur } from "@/lib/fiche/modeVente";

describe("mode de vente", () => {
  it("par défaut : Piccola en traiteur, Bello Mio en restaurant, préparations à part", () => {
    expect(modeVenteParDefaut("plat_cuisine", ["piccola"])).toBe("traiteur");
    expect(modeVenteParDefaut("plat_cuisine", ["bello_mio"])).toBe("restaurant");
    expect(modeVenteParDefaut("plat_cuisine", ["bello_mio", "piccola"])).toBe("restaurant");
    expect(modeVenteParDefaut("preparation", ["piccola"])).toBe("preparation");
    expect(modeVenteParDefaut("sauce", [])).toBe("preparation");
  });
  it("blocs affichés", () => {
    expect([avecRestaurant("les_deux"), avecTraiteur("les_deux")]).toEqual([true, true]);
    expect([avecRestaurant("preparation"), avecTraiteur("preparation")]).toEqual([false, false]);
  });
  it("au kilo : bolognaise à 8,52 €/kg vendue 25 € TTC le kilo à 5,5 %", () => {
    const k = calculKilo(8.52, 25, 5.5, 30);
    expect(k.htKg).toBeCloseTo(23.70, 2);
    expect(k.foodCost).toBeCloseTo(35.95, 1);
    expect(k.margeKg).toBeCloseTo(15.18, 2);
    expect(k.conseille).toBe(30);
  });
  it("jauge et prix pour l'objectif", () => {
    expect(etatFoodCost(30, 30)).toBe("ok");
    expect(etatFoodCost(35, 30)).toBe("attention");
    expect(etatFoodCost(36.7, 30)).toBe("trop_haut");
    expect(prixPourObjectif(82.52, 30, 10)).toBe(303);
  });
});
