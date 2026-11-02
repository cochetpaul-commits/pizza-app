import { describe, expect, it } from "vitest";
import { alertePate, calculerTb, conseilEau, eauBiga, eauPetrissage, etatBiga, lireEtapesFournee, numeroLot, tbLot, type LotPourTb } from "@/lib/pate/fournee";

describe("numéro de lot", () => {
  it("prend la première lettre libre du jour", () => {
    expect(numeroLot("2026-11-03", [])).toBe("L-2026-11-03-A");
    expect(numeroLot("2026-11-03", ["L-2026-11-03-A", "L-2026-11-02-B"])).toBe("L-2026-11-03-B");
    expect(numeroLot("2026-11-03", ["L-2026-11-03-A", "L-2026-11-03-C"])).toBe("L-2026-11-03-B");
  });
});

describe("températures d'eau", () => {
  it("biga : 55 moins farine et cuisine", () => { expect(eauBiga(19, 22)).toBe(14); });
  it("pétrissage : TB moins farine, cuisine et biga ; sans biga pour une directe", () => {
    expect(eauPetrissage(56, 19, 23, 6)).toBe(8);
    expect(eauPetrissage(56, 19, 23, null)).toBe(14);
  });
  it("conseils : glaçons sous 2 °C, avertissement au dessus de 35 °C", () => {
    expect(conseilEau(1).niveau).toBe("glacons");
    expect(conseilEau(14).niveau).toBe("ok");
    expect(conseilEau(36).niveau).toBe("chaud");
  });
});

describe("température de base", () => {
  const lot = (t_pate_sortie: number, t_eau = 10, type: "biga" | "direct" = "biga", cloture_at = "2026-11-01"): LotPourTb => ({ type, t_farine: 19, t_cuisine: 23, t_eau_utilisee: t_eau, t_biga: type === "biga" ? 6 : null, t_pate_sortie, cloture_at });
  it("TB d'un lot = farine + cuisine + eau + biga", () => { expect(tbLot(19, 23, 10, 6)).toBe(58); });
  it("moins de 3 lots valides : la valeur manuelle, 56 par défaut", () => {
    expect(calculerTb([lot(23), lot(23)], "biga", null)).toEqual({ tb: 56, source: "manuelle", nbLots: 2 });
    expect(calculerTb([lot(23), lot(23), lot(26)], "biga", 57)).toEqual({ tb: 57, source: "manuelle", nbLots: 2 });
  });
  it("à partir de 3 lots valides : moyenne des 5 derniers, du même type", () => {
    const lots = [lot(23, 10, "biga", "2026-10-01"), lot(22, 12, "biga", "2026-10-02"), lot(24, 8, "biga", "2026-10-03"), lot(23, 20, "direct", "2026-10-04"), lot(27, 30, "biga", "2026-10-05")];
    expect(calculerTb(lots, "biga", 56)).toEqual({ tb: 58, source: "lots", nbLots: 3 });
    expect(calculerTb(lots, "direct", 56).source).toBe("manuelle");
  });
  it("garde les 5 plus récents", () => {
    const lots = Array.from({ length: 8 }, (_, i) => lot(23, i < 5 ? 10 : 40, "biga", `2026-10-${String(20 - i).padStart(2, "0")}`));
    expect(calculerTb(lots, "biga", 56)).toEqual({ tb: 58, source: "lots", nbLots: 5 });
  });
});

describe("alertes", () => {
  it("pâte : alerte hors 22 à 24, forte au delà de 25", () => {
    expect(alertePate(23).niveau).toBe("ok");
    expect(alertePate(21).niveau).toBe("alerte");
    expect(alertePate(24.5).niveau).toBe("alerte");
    expect(alertePate(25.5).niveau).toBe("forte");
  });
  it("biga : fenêtre 20 à 30 h", () => {
    const t0 = new Date("2026-11-02T09:00:00Z").getTime();
    expect(etatBiga("2026-11-01T09:00:00Z", t0).niveau).toBe("ok");
    expect(etatBiga("2026-11-01T20:00:00Z", t0).niveau).toBe("jeune");
    expect(etatBiga("2026-10-31T20:00:00Z", t0).niveau).toBe("depassee");
    expect(etatBiga(null).niveau).toBeNull();
  });
});

describe("étapes de fournée", () => {
  it("par défaut selon le type, une directe n'a pas d'étape biga", () => {
    expect(lireEtapesFournee(null, "biga").filter((e) => e.phase === "biga")).toHaveLength(3);
    expect(lireEtapesFournee(null, "direct").every((e) => e.phase === "final")).toBe(true);
  });
  it("lit les étapes de la recette et ignore les lignes vides", () => {
    const e = lireEtapesFournee([{ texte: "Pétrir", phase: "final", duree_s: "90" }, { texte: "" }, { texte: "Repos", phase: "final" }], "direct");
    expect(e).toEqual([{ texte: "Pétrir", phase: "final", duree_s: 90 }, { texte: "Repos", phase: "final", duree_s: null }]);
  });
});
