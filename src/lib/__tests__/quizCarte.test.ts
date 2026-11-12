import { describe, expect, it } from "vitest";
import { classementMois, genererQuizCarte, ingredientsMarquants, jourParis, lundiDe, nomIngredient, questionsPourPlat, type PlatQuiz } from "@/lib/quizCarte";

const alea = (() => { let s = 11; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; })();
const PLATS: PlatQuiz[] = [
  { id: "p1", nom: "CRUDO", categorie: "PIZZE", prix: 20, ingredients: ["MOZZARELLA LAIT 100 %", "ROQUETTE ITALIE C1 1 KG", "PARMESAN REGGIANO BLOC 24 MOIS", "PARME 24 MOIS DOLCEVALLE ~8.5 KG", "TOMATE SAN MARZANO PELEE 3/1", "HUILE D OLIVE 1 L"] },
  { id: "p2", nom: "POLPO", categorie: "PIZZE", prix: 18, ingredients: ["MOZZARELLA LAIT 100 %", "POMME DE TERRE CHAIR FERME BRETONNE 10 KG", "OLIVE TAGGIASHE", "TENTACULES DE POULPE CUITS (~600 G)", "AIL BLANC (FILET 3 TÊTES)"] },
  { id: "p3", nom: "QUATTRO FORMAGGI", categorie: "PIZZE", prix: 16, ingredients: ["MOZZARELLA LAIT 100 %", "GORGONZOLA DE VACHE 1/8 DOP ~1,5 KG", "TALEGGIO DE VACHE ARTISANAL ~2,2 KG", "PARMESAN REGGIANO BLOC 24 MOIS", "POIVRE NOIR ENTIER 1 KG"] },
  { id: "p4", nom: "TARTUFO", categorie: "PIZZE", prix: 21, ingredients: ["CREME TRUFFE PIZZA", "JAMBON ROTI AUX HERBES 1/2", "MOZZARELLA LAIT 100 %", "CHAMPIGNON DE PARIS BRUN (COLIS 3 KG)"] },
  { id: "p5", nom: "Piatto di salumi", categorie: "ANTIPASTI", prix: 14, ingredients: ["PARME 24 MOIS DOLCEVALLE ~8.5 KG", "MORTADELLE PISTACHE Ø 22 CM", "BRESAOLA 100% BOEUF DI PUNTA D'ANCA IGP", "SPIANATA DE CALABRE ~2 KG"] },
  { id: "p6", nom: "Tiramisu", categorie: "DOLCI", prix: 9, ingredients: [] },
];

describe("quiz carte", () => {
  it("rend les noms du catalogue lisibles", () => {
    expect(nomIngredient("PARME 24 MOIS DOLCEVALLE ~8.5 KG")).toBe("Jambon de Parme");
    expect(nomIngredient("GORGONZOLA DE VACHE 1/8 DOP ~1,5 KG")).toBe("Gorgonzola");
    expect(nomIngredient("ROQUETTE ITALIE C1 1 KG")).toBe("Roquette");
    expect(nomIngredient("TENTACULES DE POULPE CUITS (~600 G)")).toBe("Poulpe");
    expect(nomIngredient("COURG FILET 2KG 14/21 C1 FR FRANCE")).toBe("Courgette");
  });
  it("écarte les basiques et les doublons", () => {
    expect(ingredientsMarquants(PLATS[0])).toEqual(["Mozzarella", "Roquette", "Parmesan", "Jambon de Parme", "Tomate San Marzano"]);
    expect(ingredientsMarquants(PLATS[1])).not.toContain("Ail blanc");
  });
  it("fabrique des questions à 4 réponses distinctes dont la bonne", () => {
    for (const p of PLATS) for (const q of questionsPourPlat(p, PLATS, alea)) {
      expect(q.options).toHaveLength(4);
      expect(new Set(q.options.map((o) => o.toLowerCase())).size).toBe(4);
      expect(q.options[q.bonne]).toBeDefined();
    }
  });
  it("le prix, la composition, l'ingrédient et l'intrus sont ceux de la fiche", () => {
    const qs = questionsPourPlat(PLATS[0], PLATS, alea);
    const de = (t: string) => qs.find((q) => q.type === t)!;
    expect(de("prix_plat").options[de("prix_plat").bonne]).toBe("20 €");
    expect(de("plat_compo").options[de("plat_compo").bonne]).toBe("CRUDO");
    expect(de("plat_compo").options).not.toContain("Tiramisu");
    expect(ingredientsMarquants(PLATS[0])).toContain(de("ingredient_dans").options[de("ingredient_dans").bonne]);
    const faux = de("ingredient_dans").options.filter((_, k) => k !== de("ingredient_dans").bonne);
    expect(faux.some((f) => ingredientsMarquants(PLATS[0]).includes(f))).toBe(false);
    expect(ingredientsMarquants(PLATS[0])).not.toContain(de("intrus").options[de("intrus").bonne]);
    expect(de("intrus").options.filter((o) => ingredientsMarquants(PLATS[0]).includes(o))).toHaveLength(3);
  });
  it("un plat sans fiche n'a que la question de prix", () => {
    expect(questionsPourPlat(PLATS[5], PLATS, alea).map((q) => q.type)).toEqual(["prix_plat"]);
  });
  it("un quiz de 10 varie les plats et les types ; moins de 4 plats : rien", () => {
    const quiz = genererQuizCarte(PLATS, 10, alea);
    expect(quiz).toHaveLength(10);
    expect(new Set(quiz.map((q) => `${q.vin_id}|${q.type}`)).size).toBe(10);
    expect(new Set(quiz.map((q) => q.type)).size).toBe(4);
    expect(genererQuizCarte(PLATS.slice(0, 3), 10, alea)).toEqual([]);
  });
  it("semaine à Paris et classement du mois", () => {
    expect(jourParis("2026-11-01T23:30:00Z")).toBe("2026-11-02");
    expect(lundiDe("2026-11-12")).toBe("2026-11-09");
    expect(lundiDe("2026-11-15")).toBe("2026-11-09");
    const s = (cle: string, nom: string, score: number, quand: string) => ({ cle, nom, score, nb_questions: 10, created_at: quand });
    const c = classementMois([
      s("a", "Gwendal B.", 7, "2026-11-03T10:00:00Z"), s("a", "Gwendal B.", 9, "2026-11-10T10:00:00Z"),
      s("a", "Gwendal B.", 10, "2026-11-11T10:00:00Z"), // deuxième de la même semaine : ignoré
      s("b", "Léa M.", 9, "2026-11-04T10:00:00Z"), s("b", "Léa M.", 10, "2026-10-28T10:00:00Z"), // octobre : hors mois
      s("c", "Tom R.", 9, "2026-11-12T10:00:00Z"),
    ], "2026-11");
    expect(c).toEqual([
      { nom: "Gwendal B.", points: 16, sur: 20, semaines: 2 },
      { nom: "Léa M.", points: 9, sur: 10, semaines: 1 },
      { nom: "Tom R.", points: 9, sur: 10, semaines: 1 },
    ]);
  });
});
