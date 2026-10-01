import { describe, it, expect } from "vitest";
import { assombrir, eclaircir, normaliserSousCategorie } from "@/lib/styleCategories";

describe("normaliserSousCategorie", () => {
  const existantes = ["Eaux", "Jus & nectars", "Vins rouges"];
  it("reprend l'orthographe existante (casse, accents, espaces)", () => {
    expect(normaliserSousCategorie("eaux", existantes)).toBe("Eaux");
    expect(normaliserSousCategorie("EAUX ", existantes)).toBe("Eaux");
    expect(normaliserSousCategorie("vins  Rouges", existantes)).toBe("Vins rouges");
  });
  it("nouvelle : nettoyée, majuscule initiale", () => {
    expect(normaliserSousCategorie("  sirops  maison ", existantes)).toBe("Sirops maison");
    expect(normaliserSousCategorie("rhum", [])).toBe("Rhum");
  });
  it("vide → null", () => {
    expect(normaliserSousCategorie("", existantes)).toBeNull();
    expect(normaliserSousCategorie("   ", existantes)).toBeNull();
    expect(normaliserSousCategorie(null, existantes)).toBeNull();
  });
});

describe("couleurs", () => {
  it("éclaircit et assombrit un hex", () => {
    expect(eclaircir("#000000", 1)).toBe("#ffffff");
    expect(eclaircir("#D4775A", 0)).toBe("#d4775a");
    expect(assombrir("#ffffff", 0.5)).toBe("#808080");
    expect(eclaircir("rouge", 0.5)).toBe("rouge");
  });
});
