import { describe, expect, it } from "vitest";
import { erreurLigne, montantReclame, quantiteEnStock, resumeReception, type LigneControle } from "@/lib/reception";

const base: LigneControle = { quantite: 3, prix_unitaire_ht: 45, etat_reception: null, qty_received: null, prix_recu: null, facture_sur_bon: true };

describe("contrôle de réception", () => {
  it("rien de contrôlé : rien en stock, rien à réclamer", () => {
    expect(quantiteEnStock(base)).toBe(0);
    expect(montantReclame(base)).toBe(0);
  });
  it("reçu : tout entre en stock, rien à réclamer", () => {
    const l = { ...base, etat_reception: "recu" as const };
    expect(quantiteEnStock(l)).toBe(3);
    expect(montantReclame(l)).toBe(0);
  });
  it("manquant facturé : rien en stock, tout à réclamer", () => {
    const l = { ...base, etat_reception: "manquant" as const };
    expect(quantiteEnStock(l)).toBe(0);
    expect(montantReclame(l)).toBe(135);
  });
  it("manquant non facturé : rien à réclamer", () => {
    expect(montantReclame({ ...base, etat_reception: "manquant", facture_sur_bon: false })).toBe(0);
  });
  it("partiel : la quantité reçue entre en stock, le manque est réclamé", () => {
    const l = { ...base, etat_reception: "partiel" as const, qty_received: 1 };
    expect(quantiteEnStock(l)).toBe(1);
    expect(montantReclame(l)).toBe(90);
  });
  it("abîmé : seul l'utilisable entre en stock", () => {
    const l = { ...base, etat_reception: "abime" as const, qty_received: 2 };
    expect(quantiteEnStock(l)).toBe(2);
    expect(montantReclame(l)).toBe(45);
  });
  it("refusé : rien en stock, tout réclamé si facturé", () => {
    expect(quantiteEnStock({ ...base, etat_reception: "refuse" })).toBe(0);
    expect(montantReclame({ ...base, etat_reception: "refuse" })).toBe(135);
  });
  it("prix différent : tout en stock, l'écart de prix est réclamé", () => {
    const l = { ...base, etat_reception: "prix" as const, prix_recu: 48.5 };
    expect(quantiteEnStock(l)).toBe(3);
    expect(montantReclame(l)).toBe(10.5);
    expect(montantReclame({ ...l, prix_recu: 40 })).toBe(0);
  });
  it("prix inconnu : rien à réclamer", () => {
    expect(montantReclame({ ...base, prix_unitaire_ht: null, etat_reception: "manquant" })).toBe(0);
  });
  it("erreurs de saisie", () => {
    expect(erreurLigne({ ...base, etat_reception: "partiel" })).toMatch(/quantité/);
    expect(erreurLigne({ ...base, etat_reception: "partiel", qty_received: 3 })).toMatch(/Reçu/);
    expect(erreurLigne({ ...base, etat_reception: "prix" })).toMatch(/prix/);
    expect(erreurLigne({ ...base, etat_reception: "abime", qty_received: 1 })).toBeNull();
  });
  it("résumé", () => {
    const r = resumeReception([
      { ...base, etat_reception: "recu" },
      { ...base, etat_reception: "manquant" },
      { ...base, etat_reception: "partiel", qty_received: 2 },
      base,
    ]);
    expect(r).toEqual({ total: 4, controlees: 3, conformes: 1, problemes: 2, aReclamer: 180 });
  });
});
