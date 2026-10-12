import { describe, expect, it } from "vitest";
import { composerFond, FOND_IDEAL, listerCoupures, totalComptage, type Comptage } from "@/lib/fondCaisse";

const idealEnComptage = (): Comptage => Object.fromEntries(Object.entries(FOND_IDEAL).map(([k, n]) => [k, n]));

describe("fond de caisse", () => {
  it("le fond idéal de Paul fait 100 €", () => {
    expect(totalComptage(idealEnComptage())).toBe(10000);
  });

  it("soir ordinaire : le fond reprend l'idéal, petite monnaie d'abord, le reste part à la banque", () => {
    // fond idéal + 211,50 € de recette (4 × 50 €, 1 × 10 €, 3 × 50 c)
    const c = idealEnComptage();
    c["5000"] = 4; c["1000"] = 3; c["50"] = 13;
    const r = composerFond(c, 100);
    expect(r.totalLaisse).toBe(10000);
    expect(r.incomplet).toBe(0);
    expect(r.laisser["5000"]).toBeUndefined();          // jamais de billet de 50 dans le fond
    expect(r.laisser["1"]).toBe(5);                     // toutes les petites pièces restent
    expect(r.totalSorti).toBe(totalComptage(c) - 10000);
    expect(r.sortir["5000"]).toBe(4);
  });

  it("au centime près même quand la monnaie ne tombe pas", () => {
    // 100 € à faire avec 1 × 50 €, 2 × 20 €, 5 × 2 €, 1 × 50 € de plus (pas de pièce de 1 €)
    const r = composerFond({ "5000": 2, "2000": 2, "200": 5 }, 100);
    expect(r.totalLaisse).toBe(10000);
    expect(r.incomplet).toBe(0);
  });

  it("tiroir sous le fond : tout reste, rien à la banque", () => {
    const r = composerFond({ "2000": 3, "100": 5 }, 100);
    expect(r.totalLaisse).toBe(6500);
    expect(r.totalSorti).toBe(0);
    expect(r.incomplet).toBe(3500);
  });

  it("fond impossible au centime : signalé", () => {
    const r = composerFond({ "5000": 3 }, 100);
    expect(r.totalLaisse).toBe(10000); // 2 × 50 €
    const r2 = composerFond({ "2000": 6, "200": 1 }, 101);
    expect(r2.incomplet).toBeGreaterThan(0);
  });

  it("12/10 réel : fond au centime, billet de 20 € du fond idéal gardé", () => {
    const c = { "10": 5, "20": 5, "50": 4, "100": 12, "200": 8, "500": 2, "1000": 11, "2000": 3, "5000": 2 };
    const r = composerFond(c, 100);
    expect(r.totalLaisse).toBe(10000);
    expect(r.totalSorti).toBe(21150);
    expect(r.laisser["2000"]).toBe(1);
    expect(r.laisser["1000"]).toBe(4); // 41,50 € de pièces et de 5 € : il faut un 10 € de plus et rendre 1,50 € de pièces
    expect(r.laisser["5000"]).toBeUndefined();
  });

  it("ce qui manque pour refaire le fond idéal", () => {
    const c = idealEnComptage();
    c["100"] = 10; c["1"] = 0;
    const r = composerFond(c, 100);
    expect(r.manqueIdeal).toEqual({ "100": 3, "1": 5 });
    expect(listerCoupures(r.manqueIdeal)).toBe("3 × 1 €, 5 × 1 c");
  });
});
