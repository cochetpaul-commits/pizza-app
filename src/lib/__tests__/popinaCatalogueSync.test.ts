import { describe, it, expect } from "vitest";
import { planifierSync, MAX_DESACTIVATION_LIEES, type ArticleCatalogue, type FicheExistante } from "@/lib/popinaCatalogueSync";

const article = (popina_id: string, name: string, extra: Partial<ArticleCatalogue> = {}): ArticleCatalogue => ({
  popina_id, name, category: "CUCINA", sub_category: "", price_ttc: 12, tva_rate: 0.1, other_tariffs: null, ...extra,
});
const fiche = (id: string, popina_id: string, name: string, o: Partial<FicheExistante> = {}): FicheExistante => ({
  id, popina_id, name, active: true, liee: false, ...o,
});

describe("planifierSync", () => {
  it("même identifiant Popina : mise à jour de la fiche", () => {
    const plan = planifierSync([article("A", "Affogato", { price_ttc: 7 })], [fiche("f1", "A", "Affogato", { liee: true })]);
    expect(plan.misesAJour).toEqual([{ id: "f1", valeurs: { ...article("A", "Affogato", { price_ttc: 7 }), active: true } }]);
    expect(plan.insertions).toEqual([]);
    expect(plan.desactivations).toEqual([]);
    expect(plan.rapprochesParNom).toBe(0);
    expect(plan.refus).toBeNull();
  });

  it("identifiant Popina changé : la fiche est retrouvée par le nom et garde son id interne", () => {
    const plan = planifierSync(
      [article("NOUVEAU", " affogato ")],
      [fiche("f1", "ANCIEN", "Affogato", { liee: true })],
    );
    expect(plan.misesAJour).toHaveLength(1);
    expect(plan.misesAJour[0].id).toBe("f1");
    expect(plan.misesAJour[0].valeurs.popina_id).toBe("NOUVEAU");
    expect(plan.rapprochesParNom).toBe(1);
    expect(plan.desactivations).toEqual([]);
    expect(plan.insertions).toEqual([]);
  });

  it("nom en doublon : la fiche reliée est préférée, l'autre est désactivée", () => {
    const plan = planifierSync(
      [article("N1", "Affogato")],
      [fiche("libre", "A1", "Affogato"), fiche("reliee", "A2", "Affogato", { liee: true })],
    );
    expect(plan.misesAJour.map((m) => m.id)).toEqual(["reliee"]);
    expect(plan.desactivations).toEqual(["libre"]);
  });

  it("deux articles de même nom : une fiche chacun, pas deux fois la même", () => {
    const plan = planifierSync(
      [article("N1", "Affogato"), article("N2", "Affogato")],
      [fiche("f1", "A1", "Affogato", { liee: true }), fiche("f2", "A2", "Affogato")],
    );
    expect(plan.misesAJour.map((m) => m.id).sort()).toEqual(["f1", "f2"]);
    expect(plan.insertions).toEqual([]);
  });

  it("une fiche déjà reconnue par son identifiant n'est pas réutilisée pour un homonyme", () => {
    const plan = planifierSync(
      [article("A", "Tiramisu"), article("B", "Tiramisu")],
      [fiche("f1", "A", "Tiramisu")],
    );
    expect(plan.misesAJour.map((m) => m.id)).toEqual(["f1"]);
    expect(plan.insertions.map((i) => i.popina_id)).toEqual(["B"]);
  });

  it("article inconnu : insertion ; fiche active absente du catalogue : désactivation ; fiche inactive : rien", () => {
    const plan = planifierSync(
      [article("X", "Nouveau plat")],
      [fiche("vieux", "V", "Ancien plat"), fiche("deja", "D", "Plat retiré", { active: false })],
    );
    expect(plan.insertions.map((i) => i.name)).toEqual(["Nouveau plat"]);
    expect(plan.desactivations).toEqual(["vieux"]);
  });

  it("garde-fou : trop de fiches reliées perdues → refus, rien à appliquer", () => {
    const existantes = Array.from({ length: MAX_DESACTIVATION_LIEES + 1 }, (_, i) =>
      fiche(`f${i}`, `A${i}`, `Plat ${i}`, { liee: true }),
    );
    const plan = planifierSync([article("Z", "Autre chose")], existantes);
    expect(plan.lieesDesactivees).toBe(MAX_DESACTIVATION_LIEES + 1);
    expect(plan.refus).toMatch(/refusée/);
  });

  it("garde-fou : le rapprochement par le nom évite le refus quand Popina change tous ses identifiants", () => {
    const existantes = Array.from({ length: 30 }, (_, i) => fiche(`f${i}`, `ANCIEN${i}`, `Plat ${i}`, { liee: true }));
    const catalogue = Array.from({ length: 30 }, (_, i) => article(`NOUVEAU${i}`, `Plat ${i}`));
    const plan = planifierSync(catalogue, existantes);
    expect(plan.refus).toBeNull();
    expect(plan.rapprochesParNom).toBe(30);
    expect(plan.desactivations).toEqual([]);
  });
});
