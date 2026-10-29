import { describe, expect, it } from "vitest";
import { compteDuLibelle, posteParCompte } from "@/lib/pennylane/posteParCompte";

describe("poste par compte (catégories Pennylane préfixées)", () => {
  it("lit le compte en préfixe", () => {
    expect(compteDuLibelle("601120 · Achats cuisine")).toBe("601120");
    expect(compteDuLibelle("Achats cuisine (frais & sec)")).toBeNull();
  });
  it("rattache par le préfixe le plus long", () => {
    expect(posteParCompte("601120 · Achats cuisine")).toBe("achats_matieres");
    expect(posteParCompte("602220 · Produits d'entretien")).toBe("entretien");
    expect(posteParCompte("602600 · Packaging et consommables")).toBe("achats_matieres");
    expect(posteParCompte("6228 · Direction (holding Da Carmela)")).toBe("remuneration_gerants");
    expect(posteParCompte("6226 · Honoraires comptables")).toBe("honoraires");
    expect(posteParCompte("613210 · Loyer restaurant")).toBe("loyer");
    expect(posteParCompte("613501 · Leasing machine à café")).toBe("locations");
    expect(posteParCompte("612201 · Crédit-bail pétrin")).toBe("locations");
    expect(posteParCompte("6451 · URSSAF et charges sociales")).toBe("masse_salariale");
    expect(posteParCompte("606320 · Tenues de travail")).toBe("autres_charges");
    expect(posteParCompte("606130 · Carburant")).toBe("autres_charges");
    expect(posteParCompte("62783 · Commissions CB")).toBe("commissions_cb");
  });
  it("sort de l'EBE les investissements, emprunts et intérêts", () => {
    expect(posteParCompte("218 · Investissements")).toBeNull();
    expect(posteParCompte("164 · Prêt immobilier")).toBeNull();
    expect(posteParCompte("661 · Intérêts d'emprunt")).toBeNull();
  });
  it("laisse les anciens libellés sans compte au rattachement par nom", () => {
    expect(posteParCompte("Virements internes")).toBeUndefined();
  });
});
