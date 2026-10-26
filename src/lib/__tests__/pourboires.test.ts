import { describe, expect, it } from "vitest";
import { compterPresences, repartir, valeurJour } from "@/lib/pourboires";
import { appliquerEchange, composerFond, echangerCagnotte, FOND_IDEAL, FOND_IDEAL_LUNDI, idealPourJour, totalComptage } from "@/lib/fondCaisse";
import { calculerCloture, VIDE } from "@/lib/cloture";

describe("répartition des pourboires", () => {
  it("un service vaut 0,5, deux services ou 7 h font la journée", () => {
    expect(valeurJour(1, 5 * 60)).toBe(0.5);
    expect(valeurJour(2, 8 * 60)).toBe(1);
    expect(valeurJour(1, 7 * 60)).toBe(1);
    expect(valeurJour(0, 0)).toBe(0);
  });

  it("présences : un extra du soir compte 0,5, un congé payé 0", () => {
    const p = compterPresences([
      { employeId: "elise", date: "2026-10-05", minutes: 300 }, { employeId: "elise", date: "2026-10-05", minutes: 300 },
      { employeId: "elise", date: "2026-10-06", minutes: 420 },
      { employeId: "lou", date: "2026-10-05", minutes: 300 },
      { employeId: "remy", date: "2026-10-05", minutes: 480 },
    ], [{ employeId: "remy", debut: "2026-10-05", fin: "2026-10-05", type: "CP" }]);
    expect(p.get("elise")?.jours).toBe(2);
    expect(p.get("lou")?.jours).toBe(0.5);
    expect(p.get("remy")?.jours).toBe(0);
  });

  it("avril 2026 du fichier de Paul : 2 247,30 € pour 143 jours, 15,715 € le jour", () => {
    const presences = new Map([["barbot", { jours: 18, detail: {} }], ["basset", { jours: 19, detail: {} }], ["bodin", { jours: 14, detail: {} }], ["ghestin", { jours: 19, detail: {} }],
      ["jallow", { jours: 18, detail: {} }], ["poulard", { jours: 19, detail: {} }], ["rondeau", { jours: 17, detail: {} }], ["tessier", { jours: 19, detail: {} }]]);
    const r = repartir(2247.3, presences);
    expect(r.totalJours).toBe(143);
    expect(r.valeurJour).toBe(15.72);
    expect(r.parts.find((p) => p.employeId === "bodin")?.part).toBe(220.02);
    expect(Math.round(r.parts.reduce((t, p) => t + p.part, 0))).toBe(2247);
  });

  it("ajustements : acompte déduit, report du mois précédent", () => {
    const r = repartir(300, new Map([["theo", { jours: 10, detail: {} }], ["teddy", { jours: 5, detail: {} }]]),
      [{ employeId: "theo", montant: -400, motif: "Acompte" }, { employeId: "teddy", montant: 71, motif: "Report de juillet" }]);
    expect(r.parts.find((p) => p.employeId === "theo")?.net).toBe(-200);
    expect(r.parts.find((p) => p.employeId === "teddy")?.net).toBe(171);
  });
});

describe("fond du lundi et cagnotte", () => {
  it("le fond du lundi fait 100 € et ne vaut que le lundi", () => {
    expect(totalComptage(Object.fromEntries(Object.entries(FOND_IDEAL_LUNDI).map(([k, n]) => [k, n])))).toBe(10000);
    expect(idealPourJour("2026-10-26")).toBe(FOND_IDEAL_LUNDI); // lundi
    expect(idealPourJour("2026-10-27")).toBe(FOND_IDEAL);
  });

  it("échange : les pièces de la cagnotte contre des billets du tiroir, par tranches de 5 €", () => {
    // tiroir pauvre en pièces de 1 € (il en manque 8 pour le fond du lundi), cagnotte pleine de pièces
    const tiroir = { "2000": 6, "1000": 5, "500": 3, "200": 10, "100": 12, "50": 14, "20": 10, "10": 8, "5": 3, "2": 2, "1": 1 };
    const cagnotte = { "2000": 2, "100": 15, "50": 10, "20": 5 };
    const e = echangerCagnotte(cagnotte, tiroir, FOND_IDEAL_LUNDI);
    expect(e).not.toBeNull();
    expect(e!.montant).toBe(1000);
    expect(e!.pieces["100"]).toBeGreaterThanOrEqual(8);
    expect(totalComptage(e!.pieces)).toBe(1000);
    expect(totalComptage(e!.billets)).toBe(1000);
    const apres = appliquerEchange(tiroir, e!);
    expect(totalComptage(apres)).toBe(totalComptage(tiroir));
    const f = composerFond(apres, 100, FOND_IDEAL_LUNDI);
    expect(f.totalLaisse).toBe(10000);
    expect(f.laisser["100"]).toBe(20);
  });

  it("pas d'échange sans pièces dans la cagnotte, ni sans billets au tiroir", () => {
    expect(echangerCagnotte({ "2000": 3 }, { "1000": 5, "100": 10 })).toBeNull();
    expect(echangerCagnotte({ "100": 10 }, { "100": 10, "50": 4 })).toBeNull();
  });

  it("clôture du vendredi : la cagnotte comptée entre dans le récap, le fond du lundi n'est pas appliqué", () => {
    const s = { ...VIDE, z: { ...VIDE.z, total: 1000, pourboires: 20 }, popina: { ...VIDE.popina, cb: 980, especes: 150 },
      tiroir: { fond: 100, compte: null, coupures: { "2000": 10, "1000": 3, "500": 2, "200": 5 } }, cagnotte: { total: null, coupures: { "500": 4, "200": 10, "100": 10 } } };
    const r = calculerCloture(s, "2026-10-23"); // vendredi
    expect(r.pourboiresEspeces).toBe(50);
    expect(r.echange?.montant).toBe(3000); // 30 € de pièces contre 30 € de billets
    expect(r.fondCaisse?.totalLaisse).toBe(10000);
    const lundi = calculerCloture({ ...s, cagnotte: null }, "2026-10-26");
    expect(lundi.echange).toBeNull();
    expect(lundi.pourboiresEspeces).toBeNull();
  });
});
