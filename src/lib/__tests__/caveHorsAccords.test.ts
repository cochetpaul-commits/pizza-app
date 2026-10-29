import { describe, expect, it } from "vitest";
import { estHorsAccords } from "@/lib/cave/horsAccords";

describe("cave : touches de caisse sans accord de vin", () => {
  it("écarte les pâtes enfants, les contorni et les glaces", () => {
    for (const n of ["Pasta Beurre", "Pasta Tomate Jambon", "Assiette pasta pesto", "INSALATE VERDE", "PATATE CROCCANTI", "Glace 2 boules"]) expect(estHorsAccords(n)).toBe(true);
  });
  it("garde les plats de la carte", () => {
    for (const n of ["ALLA TARTUFATA", "3 FORMAGGI", "TAGLIATA ", "FREGOLA GAMBERI", "TIRAMISÙ"]) expect(estHorsAccords(n)).toBe(false);
  });
});
