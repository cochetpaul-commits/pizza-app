import { describe, expect, it } from "vitest";
import { calculerCloture, lireMontant, VIDE, type SaisieCloture } from "@/lib/cloture";

const saisie = (z: Partial<SaisieCloture["z"]>, p: Partial<SaisieCloture["popina"]>, t: Partial<SaisieCloture["tiroir"]> = {}): SaisieCloture => ({
  z: { ...VIDE.z, amex: 0, conecsPourboires: 0, ...z },
  popina: { ...VIDE.popina, amex: 0, pourboireAmexFacture: 0, ...p },
  tiroir: { ...VIDE.tiroir, ...t },
});

describe("clôture du soir (cas réels du brief)", () => {
  it("08/10 : un Conecs de 25 € est une CB, puis 1 € à chercher", () => {
    const r = calculerCloture(saisie({ total: 4735.09, pourboires: 88.69, conecs: 25, conecsNb: 1 }, { cb: 4631.99, conecs: 50, conecsNb: 2, pourboires: 11.59 }));
    expect(r.ecartConecs).toBe(25);
    expect(r.ecartCb).toBe(-26);
    expect(r.residu).toBe(-1);
    expect(r.niveau).toBe("manque");
    expect(r.etapes[0]).toMatch(/25,00 € de Conecs en trop/);
    expect(r.etapes[0]).toMatch(/Popina compte 2 paiements Conecs et le TPE 1/);
    expect(r.pourboiresPaie).toBe(88.69);
  });
  it("09/10 premier écran : 3,20 € de carte en trop", () => {
    const r = calculerCloture(saisie({ total: 6187.05, pourboires: 137.8, conecs: 0, conecsNb: 0 }, { cb: 6060.42, conecs: 0, conecsNb: 0, pourboires: 7.97 }));
    expect(r.residu).toBe(3.2);
    expect(r.niveau).toBe("trop");
  });
  it("09/10 final : tout colle", () => {
    const r = calculerCloture(saisie({ total: 6187.05, pourboires: 137.8, conecs: 0, conecsNb: 0 }, { cb: 6049.25, conecs: 0, conecsNb: 0, pourboires: 0 }));
    expect(r.niveau).toBe("ok");
  });
  it("aucune tolérance : 1 centime n'est pas « tout colle »", () => {
    const r = calculerCloture(saisie({ total: 100, pourboires: 0, conecs: 0 }, { cb: 100.01, conecs: 0 }));
    expect(r.niveau).toBe("trop");
  });
  it("erreur de mode seule, sans résidu", () => {
    const r = calculerCloture(saisie({ total: 100, pourboires: 0, conecs: 25, conecsNb: 1 }, { cb: 125, conecs: 0, conecsNb: 0 }));
    expect(r.residu).toBe(0);
    expect(r.niveau).toBe("mode");
  });
  it("AMEX : pourboire par différence, compté pour la paie", () => {
    const r = calculerCloture(saisie({ total: 500, pourboires: 10, amex: 105, conecs: 0 }, { cb: 385, amex: 100, conecs: 0 }));
    expect(r.pourboireAmex).toBe(5);
    expect(r.pourboiresPaie).toBe(15);
    expect(r.niveau).toBe("ok");
  });
  it("tiroir : une carte saisie en espèces manque à la fois en carte et dans le tiroir", () => {
    // 30 € payés par carte saisis en espèces : carte −30, espèces Popina +30 → tiroir compté 30 € sous l'attendu
    const r = calculerCloture(saisie({ total: 100, pourboires: 0, conecs: 0 }, { cb: 70, conecs: 0, especes: 80 }, { fond: 100, compte: 150 }));
    expect(r.residu).toBe(-30);
    expect(r.ecartTiroir).toBe(-30);
    expect(r.etapes.join(" ")).toMatch(/même écart que la carte/);
    const juste = calculerCloture(saisie({ total: 100, pourboires: 0, conecs: 0 }, { cb: 100, conecs: 0, especes: 50 }, { fond: 100, compte: 150 }));
    expect(juste.etapes.join(" ")).toMatch(/Tiroir juste/);
  });
  it("12/10 : comptage par coupure, fond laissé et enveloppe", () => {
    // Popina : 211,50 € d'espèces, fond de 100 € → 311,50 € attendus
    const coupures = { "5000": 2, "2000": 6, "1000": 4, "500": 2, "200": 10, "100": 14, "50": 11, "20": 5, "10": 8, "5": 1, "2": 5, "1": 5 };
    const r = calculerCloture(saisie({ total: 2954, pourboires: 22, conecs: 0 }, { cb: 2932, conecs: 0, especes: 211.5 }, { fond: 100, coupures }));
    expect(r.tiroirCompte).toBe(311.5);
    expect(r.ecartTiroir).toBe(0);
    expect(r.fondCaisse?.totalLaisse).toBe(10000);
    expect(r.fondCaisse?.totalSorti).toBe(21150);
    expect(r.manquePourValider).toEqual([]);
  });
  it("valider demande les espèces Popina et le comptage", () => {
    const r = calculerCloture(saisie({ total: 100, pourboires: 0, conecs: 0 }, { cb: 100, conecs: 0 }));
    expect(r.niveau).toBe("ok");
    expect(r.manquePourValider).toEqual(["les espèces de l'écran Popina", "le comptage du tiroir"]);
  });
  it("saisie incomplète", () => {
    expect(calculerCloture(VIDE).niveau).toBe("vide");
  });
  it("lecture des montants", () => {
    expect(lireMontant("4 735,09")).toBe(4735.09);
    expect(lireMontant("88.69 €")).toBe(88.69);
    expect(lireMontant("")).toBeNull();
    expect(lireMontant("abc")).toBeNull();
  });
});
