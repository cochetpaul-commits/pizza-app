import { describe, expect, it } from "vitest";
import { genererQuiz, questionsPourVin, resumeEquipe, score, type VinQuiz } from "@/lib/quizVins";

const vin = (i: number, couleur = "rouge", accords: string[] = []): VinQuiz => ({
  id: `v${i}`, nom: `Vin ${i}`, couleur, cepages: `Cépage ${i}`, region: `Région ${i}`, appellation: `AOC ${i}`, domaine: `Domaine ${i}`,
  bouche: `Bouche ${i}`, pitch: `Pitch ${i}`, prix: { b: 20 + i, v: 5 }, accords,
});
const VINS = [vin(1, "rouge", ["Pizza Diavola"]), vin(2, "rouge", ["Tagliata"]), vin(3, "rouge"), vin(4, "rouge"), vin(5, "blanc", ["Burrata"]), vin(6, "blanc")];
// Aléa déterministe
const alea = (() => { let s = 7; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; })();

describe("quiz vins", () => {
  it("fabrique des questions à 4 réponses distinctes, avec la bonne au bon index", () => {
    for (const q of questionsPourVin(VINS[0], VINS, alea)) {
      expect(q.options).toHaveLength(4);
      expect(new Set(q.options.map((o) => o.toLowerCase())).size).toBe(4);
      expect(q.bonne).toBeGreaterThanOrEqual(0);
      expect(q.options[q.bonne]).toBeDefined();
    }
  });
  it("la bonne réponse est celle de la fiche", () => {
    const qs = questionsPourVin(VINS[0], VINS, alea);
    expect(qs.find((q) => q.type === "cepages")?.options[qs.find((q) => q.type === "cepages")!.bonne]).toBe("Cépage 1");
    expect(qs.find((q) => q.type === "prix_bouteille")?.options[qs.find((q) => q.type === "prix_bouteille")!.bonne]).toBe("21 €");
    expect(qs.find((q) => q.type === "accord_plat")?.question).toContain("Pizza Diavola");
  });
  it("les mauvaises réponses viennent d'abord des vins de la même couleur", () => {
    const q = questionsPourVin(VINS[0], VINS, alea).find((x) => x.type === "cepages")!;
    const faux = q.options.filter((o) => o !== "Cépage 1");
    expect(faux.every((f) => ["Cépage 2", "Cépage 3", "Cépage 4"].includes(f))).toBe(true);
  });
  it("un quiz de 10 varie les vins et les types", () => {
    const quiz = genererQuiz(VINS, 10, alea);
    expect(quiz).toHaveLength(10);
    expect(new Set(quiz.map((q) => q.vin_id)).size).toBe(6);
    expect(new Set(quiz.map((q) => q.type)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(quiz.map((q) => `${q.vin_id}|${q.type}`)).size).toBe(10);
  });
  it("moins de 4 vins : pas de quiz", () => {
    expect(genererQuiz(VINS.slice(0, 3), 10, alea)).toEqual([]);
  });
  it("score et résumé d'équipe", () => {
    const quiz = genererQuiz(VINS, 4, alea).map((q, i) => ({ ...q, reponse: i < 3 ? q.bonne : (q.bonne + 1) % 4 }));
    expect(score(quiz)).toBe(3);
    const r = resumeEquipe([{ employe_nom: "Gwendal B.", score: 3, nb_questions: 4, created_at: "2026-11-05T10:00:00Z", questions: quiz }]);
    expect(r.personnes[0]).toMatchObject({ nom: "Gwendal B.", sessions: 1, dernier: 3, dernierSur: 4, meilleur: 75 });
    expect(r.vinsRates).toHaveLength(1);
    expect(r.vinsRates[0].vin).toBe(quiz[3].vin_nom);
  });
});
