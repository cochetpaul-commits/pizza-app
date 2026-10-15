import { describe, expect, it } from "vitest";
import { additionsPossibles, calculerCloture, lireMontant, noteManquante, VIDE, type SaisieCloture } from "@/lib/cloture";

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
  it("AMEX : pourboire par différence, déjà compris dans les pourboires du Z", () => {
    // Z : 500 € dont 10 € de pourboires, dont 5 € sur l'AMEX de 105 € (100 € dans Popina)
    const r = calculerCloture(saisie({ total: 500, pourboires: 10, amex: 105, conecs: 0 }, { cb: 390, amex: 100, conecs: 0 }));
    expect(r.pourboireAmex).toBe(5);
    expect(r.pourboiresPaie).toBe(10);
    expect(r.niveau).toBe("ok");
  });
  it("13/10 réel : 9 pourboires dont 2,12 € AMEX, 0,30 € de carte arrondie (table 40-1)", () => {
    const z = { total: 4914.98, pourboires: 38.18, amex: 72.62, conecs: 168, conecsNb: 7 };
    const r = calculerCloture(saisie(z, { cb: 4806, amex: 70.5, conecs: 168, conecsNb: 7, especes: 773.7 }));
    expect(r.cibleCb).toBe(4806.3);
    expect(r.ecartCb).toBe(-0.3);
    expect(r.pourboiresPaie).toBe(38.18);
    // « Dont pourboire AMEX » tapé par erreur alors que Popina n'a aucun pourboire : ignoré
    const erreur = calculerCloture(saisie(z, { cb: 4806, amex: 70.5, conecs: 168, conecsNb: 7, especes: 773.7, pourboires: 0, pourboireAmexFacture: 2.12 }));
    expect(erreur.ecartCb).toBe(-0.3);
  });
  it("13/10 : AMEX saisi en Carte de crédit, une seule erreur de mode à corriger", () => {
    const z = { total: 4914.98, pourboires: 38.18, amex: 72.62, conecs: 168, conecsNb: 7 };
    // Avant correction : l'AMEX de 70,50 € est dans la carte Popina (et la table 40-1 déjà arrondie)
    const r = calculerCloture(saisie(z, { cb: 4876.8, amex: 0, conecs: 168, conecsNb: 7, especes: 773.7 }));
    expect(r.niveau).toBe("mode");
    expect(r.etapes[0]).toMatch(/AMEX a été saisi en Carte de crédit/);
    expect(r.etapes[0]).toMatch(/cherche d'abord un paiement carte de 70,50 € \(3 % de pourboire\), sinon 72,62 € \(sans pourboire\), 69,16 € \(5 % de pourboire\)/);
    expect(additionsPossibles(72.62)[0]).toEqual({ montant: 70.5, pourboire: 3 });
    // Après correction dans Popina : tout colle
    const ok = calculerCloture(saisie(z, { cb: 4806.3, amex: 70.5, conecs: 168, conecsNb: 7, especes: 773.7 }));
    expect(ok.niveau).toBe("ok");
  });
  it("petit écart carte (2 € max, liquide bon) : prix sur mesure et note obligatoire", () => {
    const z = { total: 4914.98, pourboires: 38.18, amex: 72.62, conecs: 168, conecsNb: 7 };
    // 13/10 : la table 40-1 payée 24,50 € pour 24,20 € ; tiroir compté juste (873,70 €)
    const tiroir = { fond: 100, compte: 873.7 };
    const r = calculerCloture(saisie(z, { cb: 4806, amex: 70.5, conecs: 168, conecsNb: 7, especes: 773.7 }, tiroir));
    expect(r.petitEcart).toBe(-0.3);
    expect(r.etapes.join(" ")).toMatch(/Prix sur mesure » : augmente-le de 0,30 €/);
    // Rien n'est exigé tant que l'équipe n'a pas déclaré l'ajustement (vécu 15/10 : faute de frappe passagère)
    expect(noteManquante(r, [])).toBe(false);
    // Après la correction dans Popina : carte juste, mais l'ajustement reste attaché et la note est exigée
    const apres = calculerCloture({ ...saisie(z, { cb: 4806.3, amex: 70.5, conecs: 168, conecsNb: 7, especes: 773.7 }, tiroir), ajustement: r.petitEcart });
    expect(apres.niveau).toBe("ok");
    expect(noteManquante(apres, [])).toBe(true);
    expect(noteManquante(apres, ["Table 40-1 : prix sur mesure +0,30 €"])).toBe(false);
    // Tiroir pas encore compté : pas de prix sur mesure, on demande de compter
    const sansTiroir = calculerCloture(saisie(z, { cb: 4806, amex: 70.5, conecs: 168, conecsNb: 7, especes: 773.7 }));
    expect(sansTiroir.petitEcart).toBeNull();
    expect(sansTiroir.etapes.join(" ")).toMatch(/Compte le tiroir/);
    // Plus de 2 € : vraie erreur à chercher
    const gros = calculerCloture(saisie(z, { cb: 4803, amex: 70.5, conecs: 168, conecsNb: 7, especes: 773.7 }, tiroir));
    expect(gros.petitEcart).toBeNull();
  });
  it("14/10 : 20 € d'espèces saisis en carte, tiroir +20,10 € : erreur de mode, pas un trop perçu", () => {
    const z = { total: 4640.39, pourboires: 43.44, amex: 205.35, conecs: 75, conecsNb: 3 };
    const r = calculerCloture(saisie(z, { cb: 4421.45, amex: 195.5, conecs: 75, conecsNb: 3, especes: 488.25 }, { fond: 100, compte: 608.35 }));
    expect(r.erreurEspecesCarte).toBe(true);
    expect(r.titre).toMatch(/20,00 € payés en espèces ont été saisis en carte/);
    expect(r.etapes.join(" ")).toMatch(/repasse-le en Espèces/);
    expect(r.etapes.join(" ")).toMatch(/il restera 0,10 € de trop perçu/);
    expect(r.etapes.join(" ")).not.toMatch(/À donner aux pourboires/);
    expect(r.petitEcart).toBeNull();
    // Après correction : carte juste, 0,10 € de trop perçu pour les pourboires
    const ok = calculerCloture(saisie(z, { cb: 4401.45, amex: 195.5, conecs: 75, conecsNb: 3, especes: 508.25 }, { fond: 100, compte: 608.35 }));
    expect(ok.niveau).toBe("ok");
    expect(ok.etapes.join(" ")).toMatch(/0,10 € de trop perçu.*pourboires de l'équipe/);
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
  it("12/10 corrigé : 50 c de trop perçu aux pourboires, enveloppe = espèces Popina", () => {
    const coupures = { "10": 5, "20": 5, "50": 5, "100": 12, "200": 8, "500": 2, "1000": 11, "2000": 3, "5000": 2 };
    const r = calculerCloture(saisie({ total: 2954, pourboires: 22, conecs: 0 }, { cb: 2932, conecs: 0, especes: 211.5 }, { fond: 100, coupures }));
    expect(r.tiroirCompte).toBe(312);
    expect(r.ecartTiroir).toBe(0.5);
    expect(r.enveloppe).toBe(211.5);
    expect(r.fondCaisse?.totalLaisse).toBe(10000);
    expect(r.manquePourValider).toEqual([]);
    expect(r.etapes.join(" ")).toMatch(/0,50 € de trop perçu.*pourboires de l'équipe/);
    const manque = calculerCloture(saisie({ total: 2954, pourboires: 22, conecs: 0 }, { cb: 2932, conecs: 0, especes: 212.5 }, { fond: 100, coupures }));
    expect(manque.etapes.join(" ")).toMatch(/il manque 0,50 €.*à prendre dans les pourboires/);
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
