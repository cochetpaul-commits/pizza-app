import { describe, expect, it } from "vitest";
import { fmtLitres, litresLigne, totalLitres } from "@/lib/francoLitres";

describe("minimum de commande en litres", () => {
  it("un bac compte pour son contenu", () => {
    expect(litresLigne(2, "bac", 4500)).toBe(9);
    expect(litresLigne(1, "bac", 2500)).toBe(2.5);
  });

  it("une ligne en litres compte telle quelle, contenu inconnu : 0", () => {
    expect(litresLigne(3, "L", 4500)).toBe(3);
    expect(litresLigne(50, "cl", null)).toBe(0.5);
    expect(litresLigne(2, "bac", null)).toBe(0);
  });

  it("commande Éric Élien : 1 vanille + 2 citron = 9,5 L, sous les 10 L", () => {
    const t = totalLitres([{ quantite: 1, unite: "bac", pieceVolumeMl: 4500 }, { quantite: 2, unite: "bac", pieceVolumeMl: 2500 }]);
    expect(t).toBe(9.5);
    expect(fmtLitres(t)).toBe("9,5 L");
  });
});
