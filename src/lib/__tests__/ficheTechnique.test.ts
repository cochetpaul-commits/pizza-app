import { describe, expect, it } from "vitest";
import { clairCategorie, couleurCategorie, decouperProcede, grouperIngredients, quantite } from "@/lib/ficheTechnique";

describe("fiche technique PDF", () => {
  it("couleurs par catégorie", () => {
    expect(couleurCategorie("entree")).toBe("#c49a3c");
    expect(couleurCategorie("plat_cuisine")).toBe("#a63d2f");
    expect(couleurCategorie("dessert")).toBe("#8b4572");
    expect(couleurCategorie("preparation")).toBe("#2d5c4f");
    expect(couleurCategorie("inconnue")).toBe("#2d5c4f");
    expect(clairCategorie("entree")).toBe("#faf5eb");
    expect(clairCategorie("dessert")).toBe("#f9f0f5");
    expect(clairCategorie("inconnue")).toBe("#e8f0ed");
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
    expect(quantite(28, "pcs")).toEqual({ q: "28", u: "pièces" });
  });
});

import { nomLisible, titreFiche } from "@/lib/ficheTechnique";
describe("noms lisibles (brief V3)", () => {
  it("titre sans préfixe de travail", () => {
    expect(titreFiche("PM Nov24 - Poivrons Rôtis")).toBe("Poivrons Rôtis");
    expect(titreFiche("PM Nov24 Bolognese")).toBe("Bolognese");
    expect(titreFiche("Tiramisù")).toBe("Tiramisù");
  });
  it("ingrédients sans poids, calibres ni codes", () => {
    expect(nomLisible("EPINARD BRANCHE600G ROCHAMBEAU")).toBe("Epinard branche rochambeau");
    expect(nomLisible("MASCARPONE DE VACHE 41% 500 G")).toBe("Mascarpone de vache 41%");
    expect(nomLisible("POIVRON ROUGE ESPAGNE C1 ~200 G")).toBe("Poivron rouge espagne");
    expect(nomLisible("OIGNON JAUNE 50/80 FRANCE C1")).toBe("Oignon jaune france");
    expect(nomLisible("BISCUIT CUILLÈRE")).toBe("Biscuit cuillère");
  });
});
