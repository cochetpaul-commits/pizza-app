import { describe, expect, it } from "vitest";
import { clesPersonnel, estLignePersonnel, normaliserNom } from "@/lib/achats/personnel";

describe("repas du personnel : reconnaissance des lignes de facture", () => {
  const cles = clesPersonnel([
    { id: "1", name: "Café moulu Lavazza", import_name: "CAFE MOULU LAVAZZA 1KG" },
    { id: "2", name: "Lait demi-écrémé", import_name: null },
  ]);
  it("normalise accents, casse et ponctuation", () => {
    expect(normaliserNom("Lait demi-écrémé  ")).toBe("lait demi ecreme");
  });
  it("reconnaît le nom d'import et le nom de la fiche", () => {
    expect(estLignePersonnel("cafe moulu lavazza 1kg", cles)).toBe(true);
    expect(estLignePersonnel("LAIT DEMI ECREME", cles)).toBe(true);
  });
  it("ignore les autres lignes et les noms vides", () => {
    expect(estLignePersonnel("Mozzarella fior di latte", cles)).toBe(false);
    expect(estLignePersonnel("", cles)).toBe(false);
  });
});
