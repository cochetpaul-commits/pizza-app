import { describe, expect, it } from "vitest";
import { consignesFournisseur, nettoyerLignesLues } from "@/lib/invoices/consignesScan";

describe("consignes de lecture par fournisseur", () => {
  it("Cozigou reçoit ses consignes, quelle que soit l'écriture du nom", () => {
    expect(consignesFournisseur("SAS COZIGOU COTE D'EMERAUDE")).toContain("NOMBRE DE COLIS");
    expect(consignesFournisseur("Cozigou")).toContain("MONT. HT DS* inclus");
    expect(consignesFournisseur("Metro")).toBe("");
    expect(consignesFournisseur(null)).toBe("");
  });
});

describe("nettoyage des lignes lues", () => {
  const l = (name: string, total: number) => ({ sku: null, name, quantity: 1, unit_price: total, total_price: total });
  it("retire la consignation et la reprise de vide qui s'annulent (facture Cozigou du 02/11/2026)", () => {
    const lignes = [l("FUT 30L MORETTI BLONDE", 120.27), l("CONSIGNATION FUT", 30), l("INDEXATION ENERGIE", 1.99), l("E162 FUT 30L 30.00 EUROS", -30)];
    expect(nettoyerLignesLues(lignes).map((x) => x.name)).toEqual(["FUT 30L MORETTI BLONDE", "INDEXATION ENERGIE"]);
  });
  it("garde une consignation facturée sans reprise", () => {
    const lignes = [l("FUT 30L MORETTI BLONDE", 120.27), l("CONSIGNATION FUT", 30)];
    expect(nettoyerLignesLues(lignes)).toHaveLength(2);
  });
  it("ne touche pas aux produits de même montant", () => {
    const lignes = [l("PROSECCO", 36.1), l("AVOIR PROSECCO", -36.1)];
    expect(nettoyerLignesLues(lignes)).toHaveLength(2);
  });
});
