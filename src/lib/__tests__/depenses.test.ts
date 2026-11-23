import { describe, expect, it } from "vitest";
import { moisDePeriode, regrouperDepenses, type LigneDepense } from "@/lib/analyse/depenses";

const l = (mois: string, poste: string, categorie: string, montant_ht: number, fournisseur = "F"): LigneDepense => ({ mois: `${mois}-01`, date: `${mois}-10`, poste, categorie, fournisseur, libelle: null, montant_ht, type: "facture" });

describe("toutes les dépenses", () => {
  it("période en mois et période d'avant de même longueur", () => {
    expect(moisDePeriode("2026-09-01", "2026-11-24")).toEqual({ mois: ["2026-09", "2026-10", "2026-11"], moisPrec: ["2026-06", "2026-07", "2026-08"] });
    expect(moisDePeriode("2026-01-01", "2026-01-31")).toEqual({ mois: ["2026-01"], moisPrec: ["2025-12"] });
  });
  it("regroupe par poste puis catégorie, avec la comparaison", () => {
    const d = regrouperDepenses([
      l("2026-11", "energie", "606110 · Électricité", 300, "EDF"), l("2026-11", "energie", "606120 · Gaz", 100, "Engie"),
      l("2026-10", "energie", "606110 · Électricité", 250), l("2026-11", "loyer", "Loyer", 4300), l("2026-09", "loyer", "Loyer", 4300),
    ], ["2026-11"], ["2026-10"], { energie: "Énergie", loyer: "Loyer" });
    expect(d.total).toBe(4700);
    expect(d.totalPrec).toBe(250);
    expect(d.postes.map((p) => p.poste)).toEqual(["loyer", "energie"]);
    const e = d.postes[1];
    expect(e).toMatchObject({ libelle: "Énergie", total: 400, totalPrec: 250 });
    expect(e.categories.map((c) => [c.categorie, c.total, c.totalPrec, c.nb])).toEqual([["606110 · Électricité", 300, 250, 1], ["606120 · Gaz", 100, 0, 1]]);
    expect(e.categories[0].lignes[0].fournisseur).toBe("EDF");
    expect(d.parMois).toEqual([{ mois: "2026-11", postes: { energie: 400, loyer: 4300 } }]);
  });
  it("un poste seulement présent avant reste affiché, à zéro", () => {
    const d = regrouperDepenses([l("2026-10", "assurances", "Assurance", 90)], ["2026-11"], ["2026-10"], {});
    expect(d.postes).toHaveLength(1);
    expect(d.postes[0]).toMatchObject({ total: 0, totalPrec: 90 });
  });
});
