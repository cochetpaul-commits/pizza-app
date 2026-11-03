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

import { conseilBassinage, detailBacs, etapesFourneeParDefaut, nbBacs, repereCourant, reperesPetrissage, tiersBassinage } from "@/lib/pate/fournee";

describe("pétrissage chronométré", () => {
  const p = { eauDepart: 11396, farine: 15318, nomFarine: "Tipo 1 Soffio", sel: 643, bassinage: 2849 };
  it("frise par défaut : 0:00, 2:00, 7:00, 7:30, 9:00, 10:30, 15:00, 18:00", () => {
    const r = reperesPetrissage(etapesFourneeParDefaut("biga"), p, "biga");
    expect(r.map((x) => x.t)).toEqual([0, 120, 420, 450, 540, 630, 900, 1080]);
    expect(r.map((x) => x.grammes)).toEqual([11396, 15318, 643, 950, 950, 949, null, null]);
    expect(r[3].indicatif).toBe(true);
    expect(r[6].titre).toBe("Repos");
    expect(r[7].titre).toBe("Un tour de vitesse 1");
  });
  it("directe : mêmes repères, toutes les farines à 2:00", () => {
    const r = reperesPetrissage(etapesFourneeParDefaut("direct"), { ...p, levure: 36 }, "direct");
    expect(r.map((x) => x.t)).toEqual([0, 120, 420, 450, 540, 630, 900, 1080]);
    expect(r[1].titre).toBe("Toutes les farines");
  });
  it("bascule automatique au repère, avance manuelle possible", () => {
    const r = reperesPetrissage(etapesFourneeParDefaut("biga"), p, "biga");
    expect(repereCourant(r, 0, 0)).toBe(0);
    expect(repereCourant(r, 125, 0)).toBe(1);
    expect(repereCourant(r, 541, 0)).toBe(4);
    expect(repereCourant(r, 125, 3)).toBe(3);
    expect(repereCourant(r, 5000, 0)).toBe(7);
  });
  it("bacs et tiers", () => {
    expect(nbBacs(200)).toBe(17);
    expect(detailBacs(200)).toBe("16 bacs pleins et un bac de 8");
    expect(nbBacs(168)).toBe(14);
    expect(tiersBassinage(2849)).toEqual([950, 950, 949]);
  });
  it("conseil de répartition : deux lots de suite au delà de 5 %", () => {
    expect(conseilBassinage([{ eau_bassinage_restante_g: 300, bassinage_g: 2849 }], 80)).toBeNull();
    expect(conseilBassinage([{ eau_bassinage_restante_g: 300, bassinage_g: 2849 }, { eau_bassinage_restante_g: 100, bassinage_g: 2849 }], 80)).toBeNull();
    const c = conseilBassinage([{ eau_bassinage_restante_g: 700, bassinage_g: 2849 }, { eau_bassinage_restante_g: 720, bassinage_g: 2849 }], 80);
    expect(c?.de).toEqual([80, 20]);
    expect(c?.vers).toEqual([85, 15]);
  });
});
