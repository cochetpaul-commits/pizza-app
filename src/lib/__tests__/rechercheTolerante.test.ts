import { describe, it, expect } from "vitest";
import { correspondRecherche, distanceMots, filtrerRecherche, scoreRecherche } from "@/lib/rechercheTolerante";

describe("distanceMots", () => {
  it("compte les lettres de travers", () => {
    expect(distanceMots("filete", "filette", 2)).toBe(1);
    expect(distanceMots("aqua", "acqua", 2)).toBe(1);
    expect(distanceMots("abc", "abc", 2)).toBe(0);
  });
  it("s'arrête au-delà du maximum", () => {
    expect(distanceMots("tomate", "bouteille", 1)).toBeGreaterThan(1);
  });
});

describe("correspondRecherche", () => {
  const nom = "ACQUA FILETTE FRIZZANTE 0,47L";
  it("ignore accents et casse, accepte le début de mot", () => {
    expect(correspondRecherche("acqua", nom)).toBe(true);
    expect(correspondRecherche("Filet", nom)).toBe(true);
    expect(correspondRecherche("frizz", nom)).toBe(true);
  });
  it("tolère les fautes de frappe", () => {
    expect(correspondRecherche("aqua filete", nom)).toBe(true);
    expect(correspondRecherche("frizante", nom)).toBe(true);
    expect(correspondRecherche("filete", nom)).toBe(true);
    expect(correspondRecherche("mozarella", "MOZZARELLA FIOR DI LATTE")).toBe(true);
    expect(correspondRecherche("parmezan", "PARMESAN 24 MOIS")).toBe(true);
  });
  it("mots collés", () => {
    expect(correspondRecherche("acquafilette", nom)).toBe(true);
  });
  it("refuse ce qui ne ressemble pas", () => {
    expect(correspondRecherche("tomate", nom)).toBe(false);
    expect(correspondRecherche("acqua tomate", nom)).toBe(false);
    // 3 lettres : pas de tolérance, il faut un vrai morceau
    expect(correspondRecherche("xyz", nom)).toBe(false);
  });
  it("requête vide : tout passe", () => {
    expect(correspondRecherche("", nom)).toBe(true);
    expect(correspondRecherche(" a ", nom)).toBe(true);
  });
});

describe("scoreRecherche / filtrerRecherche", () => {
  it("classe l'exact avant le début de mot avant l'approché", () => {
    const items = ["FILET DE BOEUF", "ACQUA FILETTE 75CL", "FILETTE NATURALE", "FARINE"];
    // « filet » est à deux lettres de « filette » : accepté, mais classé après les vrais « filette »
    expect(filtrerRecherche(items, "filette", (x) => x)).toEqual(["ACQUA FILETTE 75CL", "FILETTE NATURALE", "FILET DE BOEUF"]);
    expect(filtrerRecherche(items, "filet", (x) => x)).toEqual(["FILET DE BOEUF", "ACQUA FILETTE 75CL", "FILETTE NATURALE"]);
    expect(scoreRecherche("filet", "FILET DE BOEUF")).toBeGreaterThan(scoreRecherche("filet", "FILETTE NATURALE")!);
  });
});
