import { describe, expect, it } from "vitest";
import { POSTES_BUDGET, REGLAGES_DEFAUT, brutMensuel, calculerSimulation, entreesParDefaut, fusionnerReglages, heuresPayees, montantPoste, personneAjoutee, plancherMensuelHt, servicesType, statutBudget, type Personne } from "@/lib/objectifs";

describe("objectifs : plancher et budget", () => {
  it("60 couverts × 35 € × 9 services = 18 900 € TTC par semaine, 73 321 € HT par mois", () => {
    expect(Math.round(plancherMensuelHt(REGLAGES_DEFAUT.plancher, 1.117))).toBe(73321);
  });
  it("statut d'un poste en % : bon, attention jusqu'à +10 %, mauvais au-delà, en cours si le mois est incomplet", () => {
    const achats = POSTES_BUDGET[0];
    expect(statutBudget(achats, 27000, 100000, false, 28).niveau).toBe("bon");
    expect(statutBudget(achats, 30000, 100000, false, 28).niveau).toBe("attention");
    expect(statutBudget(achats, 32000, 100000, false, 28).niveau).toBe("mauvais");
    expect(statutBudget(achats, 32000, 100000, true, 28).niveau).toBe("na");
    expect(statutBudget(achats, 27992, 90910, false, 28).texte).toBe("30,8 %");
  });
  it("les autres charges additionnent les petits postes Pennylane", () => {
    const autres = POSTES_BUDGET.find((p) => p.cle === "autres_charges")!;
    expect(montantPoste(autres, { autres_charges: 100, commissions_cb: 20, honoraires: 5, loyer: 4300 })).toBe(125);
  });
  it("les réglages partiels se fondent dans les défauts", () => {
    const r = fusionnerReglages({ plancher: { couverts: 70 } as never, objectifs: { loyer: 4500 } });
    expect(r.plancher).toEqual({ couverts: 70, tm: 35, services: 9 });
    expect(r.objectifs.loyer).toBe(4500);
    expect(r.objectifs.achats_matieres).toBe(28);
  });
});

describe("objectifs : services type", () => {
  it("moyenne par jour et service, lundi d'abord, services fermés ignorés", () => {
    const t = servicesType([
      { date: "2026-10-05", svc: "soir", ca_ht: 3000, ca_ttc: 3300, couverts: 100 }, // lundi
      { date: "2026-10-12", svc: "soir", ca_ht: 3200, ca_ttc: 3520, couverts: 110 },
      { date: "2026-10-06", svc: "midi", ca_ht: 1700, ca_ttc: 1870, couverts: 60 }, // mardi
      { date: "2026-10-04", svc: "midi", ca_ht: 0, ca_ttc: 0, couverts: 0 }, // dimanche fermé
    ]);
    expect(t.map((x) => x.libelle)).toEqual(["Lundi soir", "Mardi midi"]);
    expect(t[0].couverts).toBe(105);
    expect(t[0].n).toBe(2);
    expect(Math.round(t[0].tmTtc * 10) / 10).toBe(32.5);
  });
});

describe("objectifs : simulateur", () => {
  const equipe: Personne[] = [
    { id: "1", nom: "A", poste: "Chef", contrat: "CDI 43 h", heures: 43, brut: 3572, actif: true, ajout: false, extra: false },
    { id: "2", nom: "B", poste: "Serveur", contrat: "CDI 35 h", heures: 35, brut: 2099, actif: true, ajout: false, extra: false },
    { id: "3", nom: "C", poste: "Extra", contrat: "extra", heures: 20, brut: 1154, actif: false, ajout: false, extra: true },
  ];
  it("heures payées : 39 h = 35 + 4 × 1,1", () => {
    expect(heuresPayees(39)).toBeCloseTo(39.4);
    expect(heuresPayees(35)).toBe(35);
    expect(Math.round(brutMensuel(39, 12.7))).toBe(2168);
    expect(personneAjoutee("extra", 1, 12.7).brut).toBeCloseTo((10 * 52) / 12 * 12.7);
  });
  it("CA, EBE, seuil et capacité d'investissement", () => {
    const v = { cm: 68, tm: 29, nm: 4, cs: 112, ts: 34, ns: 5, chg: 42, brutH: 12.7, ach: 28, variables: 4, dir: 13900, loyer: 4300, fixes: 1000 };
    const r = calculerSimulation(v, equipe, { ttcHt: 1.117, emprunts: 5150, tauxIs: 25 });
    const semaine = 68 * 29 * 4 + 112 * 34 * 5;
    expect(r.caHt).toBeCloseTo((semaine * 52) / 12 / 1.117, 3);
    expect(r.ms).toBeCloseTo((3572 + 2099) * 1.42, 3); // l'extra inactif ne compte pas
    expect(r.ebe).toBeCloseTo(r.caHt * 0.68 - r.ms - 13900 - 4300 - 1000, 3);
    expect(r.seuil).toBeCloseTo((r.ms + 13900 + 4300 + 1000) / 0.68, 3);
    expect(r.invest).toBeCloseTo(r.ebe - 5150 - Math.max(0, r.ebe) * 0.25, 3);
    expect(r.lignes.find(([n]) => n.startsWith("Masse salariale"))?.[0]).toContain("2 personnes, 78 h");
  });
  it("hypothèses de départ tirées des services type et des mois clos", () => {
    const types = servicesType([
      { date: "2026-10-05", svc: "soir", ca_ht: 3000, ca_ttc: 3400, couverts: 100 },
      { date: "2026-10-06", svc: "midi", ca_ht: 1700, ca_ttc: 1740, couverts: 60 },
    ]);
    const e = entreesParDefaut(types, [{ ca_ht: 100000, postes: { achats_matieres: 29000, loyer: 4300, remuneration_gerants: 13900, energie: 900, entretien: 2000, autres_charges: 3000 } }], REGLAGES_DEFAUT);
    expect(e).toMatchObject({ cm: 60, tm: 29, nm: 1, cs: 100, ts: 34, ns: 1, ach: 29, variables: 5, dir: 13900, loyer: 4300, fixes: 900 });
  });
});
