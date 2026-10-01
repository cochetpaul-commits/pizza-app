import { describe, it, expect } from "vitest";
import { coutUniteComptee, choisirOffre, familleUnite } from "@/lib/inventaireValorisation";

const offre = (o: Record<string, unknown>) => ({ is_active: true, valid_from: "2026-09-01", ...o });

describe("coutUniteComptee", () => {
  it("compté au kg, prix au kg", () => {
    expect(coutUniteComptee("kg", {}, [offre({ unit: "kg", unit_price: 12.5 })])).toEqual({ cout: 12.5, source: "offre" });
  });
  it("compté à la pièce, prix à la pièce (bouteille)", () => {
    expect(coutUniteComptee("bouteille", {}, [offre({ unit: "pc", unit_price: 7.2 })])).toEqual({ cout: 7.2, source: "offre" });
  });
  it("compté à la pièce, prix au kg : × poids d'une pièce (meule 2,2 kg)", () => {
    expect(coutUniteComptee("pièce", { piece_weight_g: 2200 }, [offre({ unit: "kg", unit_price: 10 })])).toEqual({ cout: 22, source: "offre" });
  });
  it("compté au kg, prix à la pièce : ÷ poids (sac de 25 kg à 30 €)", () => {
    expect(coutUniteComptee("kg", { piece_weight_g: 25000 }, [offre({ unit: "pc", unit_price: 30 })])).toEqual({ cout: 1.2, source: "offre" });
  });
  it("compté au litre, prix à la bouteille de 75 cL", () => {
    expect(coutUniteComptee("litre", { piece_volume_ml: 750 }, [offre({ unit: "pc", unit_price: 6 })])).toEqual({ cout: 8, source: "offre" });
  });
  it("colis de 6 bouteilles à 42 € : élément = 7 €", () => {
    expect(coutUniteComptee("bouteille", {}, [offre({ unit: "colis", pack_price: 42, pack_count: 6, pack_each_unit: "pc" })])).toEqual({ cout: 7, source: "offre" });
  });
  it("offre fermée = dernier prix connu, puis prix d'achat de la fiche", () => {
    expect(coutUniteComptee("kg", {}, [offre({ unit: "kg", unit_price: 9, is_active: false, valid_to: "2026-08-01" })])).toEqual({ cout: 9, source: "ancienne_offre" });
    expect(coutUniteComptee("pièce", { purchase_price: 3.5, purchase_unit: 1, purchase_unit_label: "bouteille" }, [])).toEqual({ cout: 3.5, source: "fiche" });
    expect(coutUniteComptee("kg", { purchase_price: 20, purchase_unit: 5, purchase_unit_label: "kg" }, [])).toEqual({ cout: 4, source: "fiche" });
  });
  it("conversion impossible : coût inconnu, jamais un prix faux", () => {
    const r = coutUniteComptee("pièce", {}, [offre({ unit: "kg", unit_price: 10 })]);
    expect(r.cout).toBeNull();
    expect(r.raison).toMatch(/poids/);
    expect(coutUniteComptee("kg", {}, []).source).toBeNull();
  });
});

describe("choisirOffre / familleUnite", () => {
  it("active la plus récente d'abord", () => {
    const r = choisirOffre([offre({ unit_price: 1, valid_from: "2026-01-01" }), offre({ unit_price: 2, valid_from: "2026-05-01" }), offre({ unit_price: 3, is_active: false, valid_from: "2026-09-01" })]);
    expect(r.offre?.unit_price).toBe(2);
    expect(r.ancienne).toBe(false);
  });
  it("unités", () => {
    expect(familleUnite("Kg")).toBe("kg");
    expect(familleUnite("litre")).toBe("l");
    expect(familleUnite("pièce")).toBe("pc");
    expect(familleUnite(null)).toBe("pc");
  });
});

describe("préparations maison : coût de recette", () => {
  it("compté au kg, coût au kilo de la recette quand ni offre ni prix de fiche", () => {
    expect(coutUniteComptee("kg", {}, [], { cost_per_kg: 12.97 })).toEqual({ cout: 12.97, source: "recette" });
  });
  it("coût total ÷ poids produit quand le coût au kilo n'est pas enregistré", () => {
    expect(coutUniteComptee("kg", {}, [], { cost_per_kg: null, total_cost: 11.34, yield_grams: 874 })).toEqual({ cout: 12.9748, source: "recette" });
  });
  it("compté à la pièce (bac de 2 kg) : × poids d'une pièce", () => {
    expect(coutUniteComptee("pièce", { piece_weight_g: 2000 }, [], { cost_per_kg: 10 })).toEqual({ cout: 20, source: "recette" });
  });
  it("l'offre ou le prix de fiche passent avant la recette", () => {
    expect(coutUniteComptee("kg", { purchase_price: 8, purchase_unit: 1, purchase_unit_label: "kg" }, [], { cost_per_kg: 12 })).toEqual({ cout: 8, source: "fiche" });
  });
  it("recette sans coût : toujours sans prix", () => {
    expect(coutUniteComptee("kg", {}, [], { cost_per_kg: null, total_cost: null, yield_grams: 500 })).toMatchObject({ cout: null, source: null });
  });
});
