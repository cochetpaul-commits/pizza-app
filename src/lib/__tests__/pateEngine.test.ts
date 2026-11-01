import { describe, expect, it } from "vitest";
import { calculerPate, decouperLots, poidsCalcule, repartirFarines } from "@/lib/pateEngine";

/** Recette biga standard de Bello Mio (brief du 01/11/2026) */
const BIGA = { hydration_total: 69, salt_percent: 2.1, honey_percent: 1, oil_percent: 0, biga_percent: 50, biga_hydration: 45, biga_yeast_percent: 0.5, biga_flour: "Tipo 0 Soffio", water_start_pct: 80, loss_margin_pct: 1.5, mixer_max_balls: 215 };
const MIX = [{ name: "Tipo 0 Soffio", percent: 50 }, { name: "Tipo 1 Soffio", percent: 50 }];
const farine = (phase: { flours: { name: string; grams: number }[] }, nom: string) => phase.flours.find((f) => f.name === nom)?.grams ?? 0;

describe("poids calculé et découpe", () => {
  it("pâton 260 g calculé à 264 g avec 1,5 % de marge", () => {
    expect(poidsCalcule(260, 1.5)).toBe(264);
    expect(poidsCalcule(264, 0)).toBe(264);
  });
  it("coupe en deux pétrissages au delà de la capacité", () => {
    expect(decouperLots(130, 215)).toEqual([130]);
    expect(decouperLots(215, 215)).toEqual([215]);
    expect(decouperLots(300, 215)).toEqual([150, 150]);
    expect(decouperLots(301, 215)).toEqual([151, 150]);
    expect(decouperLots(500, 215)).toEqual([167, 167, 166]);
    expect(decouperLots(130, 0)).toEqual([130]);
  });
});

describe("recette biga, valeurs de contrôle du brief", () => {
  it.each([
    [130, { farine: 19942, tipo0: 9971, eauBiga: 4487, levure: 50, tipo1: 9971, depart: 7418, bassinage: 1855, sel: 419, miel: 199 }],
    [200, { farine: 30680, tipo0: 15340, eauBiga: 6903, levure: 77, tipo1: 15340, depart: 11413, bassinage: 2853, sel: 644, miel: 307 }],
  ])("%i pâtons", (patons, attendu) => {
    const r = calculerPate({ type: "biga", nbPatons: patons, poidsPaton: 260, recipe: BIGA, flourMix: MIX });
    expect(r.summary.poidsCalcule_g).toBe(264);
    expect(r.summary.total_dough_g).toBe(patons * 264);
    expect(r.flour_total_g).toBe(attendu.farine);
    const [biga, final] = r.phases;
    expect(biga.kind).toBe("biga");
    expect(biga.flours).toHaveLength(1);
    expect(farine(biga, "Tipo 0 Soffio")).toBe(attendu.tipo0);
    expect(biga.water_g).toBe(attendu.eauBiga);
    expect(biga.yeast_g).toBe(attendu.levure);
    expect(final.kind).toBe("final");
    expect(final.flours).toHaveLength(1);
    expect(farine(final, "Tipo 1 Soffio")).toBe(attendu.tipo1);
    expect(final.water_start_g).toBe(attendu.depart);
    expect(final.water_bassinage_g).toBe(attendu.bassinage);
    expect(final.salt_g).toBe(attendu.sel);
    expect(final.honey_g).toBe(attendu.miel);
    // Toute la levure est dans la biga : plus de ligne levure dans la pâte finale
    expect(final.yeast_g).toBe(0);
    expect(r.totals.yeast_g).toBe(attendu.levure);
    // La pâte totale pesée comprend la levure
    expect(r.summary.total_ingredients_g).toBe(Math.round(attendu.farine * 1.721 + attendu.levure));
    expect(r.warnings).toEqual([]);
  });

  it("au delà de la capacité du pétrin, propose deux pétrissages", () => {
    const r = calculerPate({ type: "biga", nbPatons: 300, poidsPaton: 260, recipe: BIGA, flourMix: MIX });
    expect(r.summary.lots).toEqual([150, 150]);
    expect(r.warnings[0]).toContain("couper en 2 pétrissages de 150 et 150 pâtons");
  });
});

describe("répartition des farines", () => {
  it("80 / 20 avec biga à 50 % : biga 50 % tipo 0, final 30 % tipo 0 et 20 % tipo 1", () => {
    const r = calculerPate({ type: "biga", nbPatons: 100, poidsPaton: 264, recipe: { ...BIGA, loss_margin_pct: 0 }, flourMix: [{ name: "Tipo 0 Soffio", percent: 80 }, { name: "Tipo 1 Soffio", percent: 20 }] });
    const [biga, final] = r.phases;
    expect(biga.flours.map((f) => [f.name, f.percent])).toEqual([["Tipo 0 Soffio", 50]]);
    expect(final.flours.map((f) => [f.name, f.percent])).toEqual([["Tipo 0 Soffio", 30], ["Tipo 1 Soffio", 20]]);
    expect(farine(biga, "Tipo 0 Soffio") + farine(final, "Tipo 0 Soffio")).toBe(Math.round(r.flour_total_g * 0.8));
    expect(r.warnings).toEqual([]);
  });
  it("trois farines, la biga prend la farine désignée même si elle n'est pas la première", () => {
    const r = calculerPate({ type: "biga", nbPatons: 100, poidsPaton: 264, recipe: { ...BIGA, biga_percent: 40, biga_flour: "Tipo 1 Soffio" }, flourMix: [{ name: "Tipo 0 Soffio", percent: 50 }, { name: "Tipo 1 Soffio", percent: 40 }, { name: "Semoule", percent: 10 }] });
    const [biga, final] = r.phases;
    expect(biga.flours.map((f) => f.name)).toEqual(["Tipo 1 Soffio"]);
    expect(final.flours.map((f) => [f.name, f.percent])).toEqual([["Tipo 0 Soffio", 50], ["Semoule", 10]]);
  });
  it("farine désignée insuffisante : complément au prorata et avertissement", () => {
    const r = calculerPate({ type: "biga", nbPatons: 100, poidsPaton: 264, recipe: { ...BIGA, biga_percent: 60 }, flourMix: MIX });
    const [biga, final] = r.phases;
    expect(biga.flours.map((f) => [f.name, f.percent])).toEqual([["Tipo 0 Soffio", 50], ["Tipo 1 Soffio", 10]]);
    expect(final.flours.map((f) => [f.name, f.percent])).toEqual([["Tipo 1 Soffio", 40]]);
    expect(r.warnings.some((w) => w.includes("ne suffit pas à remplir la biga"))).toBe(true);
  });
  it("repartirFarines garde les grammes", () => {
    const rep = repartirFarines([{ name: "A", grams: 600, percent: 60 }, { name: "B", grams: 300, percent: 30 }, { name: "C", grams: 100, percent: 10 }], 700, "A");
    const total = [...rep.biga, ...rep.final].reduce((t, f) => t + f.grams, 0);
    expect(total).toBeCloseTo(1000, 6);
    expect(rep.biga.reduce((t, f) => t + f.grams, 0)).toBeCloseTo(700, 6);
    expect(rep.complement).toBe(true);
  });
});

describe("recette directe", () => {
  it("mêmes pourcentages, levure 0,18 % sur la farine totale : 36 g pour 130 pâtons", () => {
    const r = calculerPate({ type: "direct", nbPatons: 130, poidsPaton: 260, recipe: { hydration_total: 69, salt_percent: 2.1, honey_percent: 1, yeast_percent: 0.18, loss_margin_pct: 1.5, water_start_pct: 80 }, flourMix: MIX });
    expect(r.flour_total_g).toBe(19942);
    const [u] = r.phases;
    expect(u.kind).toBe("unique");
    expect(u.yeast_g).toBe(36);
    expect(u.flours.map((f) => [f.name, f.grams])).toEqual([["Tipo 0 Soffio", 9971], ["Tipo 1 Soffio", 9971]]);
    expect(u.water_g).toBe(13760);
    expect(u.water_start_g).toBe(11008);
    expect(u.water_bassinage_g).toBe(2752);
  });
  it("sans paramètres nouveaux, l'ancien appel garde son comportement (focaccia)", () => {
    const r = calculerPate({ type: "focaccia", nbPatons: 10, poidsPaton: 1250, recipe: { hydration_total: 80, salt_percent: 3.3, honey_percent: 3.3, oil_percent: 3.3, yeast_percent: 1 } });
    expect(r.summary.poidsCalcule_g).toBe(1250);
    expect(r.summary.total_dough_g).toBe(12500);
    expect(r.phases[0].flours[0].name).toBe("Farine");
    expect(r.summary.lots).toEqual([10]);
  });
});
