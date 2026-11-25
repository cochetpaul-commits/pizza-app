import { describe, expect, it } from "vitest";
import { couleurCategorie, decouperProcede, grouperIngredients, quantite } from "@/lib/ficheTechnique";

describe("fiche technique PDF", () => {
  it("couleurs par catégorie", () => {
    expect(couleurCategorie("entree")).toBe("#c49a3c");
    expect(couleurCategorie("plat_cuisine")).toBe("#a63d2f");
    expect(couleurCategorie("dessert")).toBe("#8b4572");
    expect(couleurCategorie("preparation")).toBe("#1a8a7d");
    expect(couleurCategorie("inconnue")).toBe("#1a8a7d");
  });
  it("découpe le procédé en phases, numérotation continue", () => {
    const p = decouperProcede(["PESTO : Mettre basilic dans le robot.", "Mixer.", "BASE : Chauffer l'huile.", "FAÇONNAGE : Remplir les moules."]);
    expect(p.map((x) => x.phase)).toEqual(["Pesto", "Base", "Façonnage"]);
    expect(p[0].etapes).toEqual([{ n: 1, texte: "Mettre basilic dans le robot." }, { n: 2, texte: "Mixer." }]);
    expect(p[2].etapes[0].n).toBe(4);
  });
  it("sans phase : un seul bloc ; une phrase ordinaire avec deux-points n'ouvre pas de phase", () => {
    const p = decouperProcede(["Former des boules de 80 g : poser la plaque sur la balance.", "Cuire."]);
    expect(p).toHaveLength(1);
    expect(p[0].phase).toBeNull();
    expect(p[0].etapes).toHaveLength(2);
  });
  it("ingrédients avant / après cuisson seulement quand il y a les deux", () => {
    expect(grouperIngredients([{ nom: "a", qte: 1, unite: "g", stage: "pre" }])).toHaveLength(1);
    const g = grouperIngredients([{ nom: "a", qte: 1, unite: "g", stage: "pre" }, { nom: "b", qte: 2, unite: "g", stage: "post" }]);
    expect(g.map((x) => x.titre)).toEqual(["Avant cuisson", "Après cuisson"]);
  });
  it("quantités lisibles", () => {
    expect(quantite(5000, "g")).toEqual({ q: "5", u: "kg" });
    expect(quantite(2500, "g")).toEqual({ q: "2,5", u: "kg" });
    expect(quantite(125, "g")).toEqual({ q: "125", u: "g" });
    expect(quantite(150, "cl")).toEqual({ q: "1,5", u: "l" });
  });
});
