import { describe, expect, it } from "vitest";
import { pointsAControler } from "@/lib/produits/aControler";

describe("fiches à contrôler", () => {
  it("dit ce qui cloche", () => {
    expect(pointsAControler({ name: "BLACK TEA BLEND GIARDINO OLTRE LE MURA TIN X 100 G NON PREFERENTIAL CHINA ORIGIN - 090230 [ 12438 A ]", category: "autre" }, { unit: "pc", unit_price: 0.09 }, true))
      .toEqual(["categorie", "prix_suspect", "nom"]);
    expect(pointsAControler({ name: "AMORA MAYO FS 225GR", category: "autre" }, { unit: "pc", unit_price: 2.08 }, true)).toEqual(["categorie"]);
    expect(pointsAControler({ name: "Burrata", category: "cremerie_fromage" as never }, undefined, false)).toEqual(["prix"]);
  });
  it("une fiche classée avec un prix plausible est prête à valider", () => {
    expect(pointsAControler({ name: "BALANCE PRO 10 KG IP67", category: "emballage" as never }, { unit: "pc", unit_price: 191 }, true)).toEqual([]);
    expect(pointsAControler({ name: "Farine T00", category: "epicerie" as never }, { unit: "kg", unit_price: 0.9 }, true)).toEqual([]);
  });
});
