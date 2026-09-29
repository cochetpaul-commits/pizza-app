import { describe, it, expect } from "vitest";
import { categorieDeFamille, choisirConditionnement, comptageFeuille, totalLigne, lireFeuille, uniteFicheDe, zoneCorrespondante, type ArticleFournisseur } from "@/lib/inventaire";

const art = (p: Partial<ArticleFournisseur>): ArticleFournisseur => ({
  supplier_id: "f1", unite_commande: "carton", contenu_nb: 6, element: "bouteille", element_qte: null, element_unite: null,
  commande_element_permise: true, precommande: false, ...p,
});

describe("choisirConditionnement", () => {
  it("fournisseur principal de la fiche d'abord", () => {
    const c = choisirConditionnement("f2", [art({ supplier_id: "f1" }), art({ supplier_id: "f2", contenu_nb: 12 })], []);
    expect(c).toMatchObject({ supplier_id: "f2", contenu: 12, unite: "bouteille" });
  });
  it("sinon fournisseur de la dernière offre active", () => {
    const c = choisirConditionnement("fx", [art({ supplier_id: "f1" }), art({ supplier_id: "f3", contenu_nb: 24 })],
      [{ supplier_id: "f1", created_at: "2026-01-01", valid_from: null }, { supplier_id: "f3", created_at: "2026-09-01", valid_from: null }]);
    expect(c).toMatchObject({ supplier_id: "f3", contenu: 24, libelle: "carton de 24 bouteilles" });
  });
  it("sans conditionnement : null (unités seulement, unité de la fiche)", () => {
    expect(choisirConditionnement(null, [], [])).toBeNull();
  });
  it("colis pesé : on compte des colis", () => {
    const c = choisirConditionnement("f1", [art({ unite_commande: "colis", contenu_nb: 1, element: null, element_qte: 5, element_unite: "kg" })], []);
    expect(c).toMatchObject({ contenu: 1, unite: "colis", libelle: "colis 5 kg" });
  });
});

describe("totalLigne", () => {
  it("colis × contenu + unités", () => {
    expect(totalLigne(2, 3, 6)).toBe(15);
    expect(totalLigne(null, 4, 6)).toBe(4);
    expect(totalLigne(0, 0, 6)).toBe(0);
  });
  it("rien saisi : null (différent de 0)", () => {
    expect(totalLigne(null, null, 6)).toBeNull();
  });
});

describe("lecture de la feuille", () => {
  const zones = ["CHAMBRE FROIDE", "CONGÉLATEUR", "ANNEXE", "GARAGE", "CAVE A VIN", "BAR"];
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const entetes = ["ordre", "zone", "famille", "produit (comme sur la feuille)", "fournisseur", "unité de comptage", "ingredient_id", "nom de la fiche dans l appli", "rattachement"];
  it("zones du fichier reconnues sans accents ni casse, « Cave » → CAVE A VIN", () => {
    expect(zoneCorrespondante("Congelateur", zones)).toBe("CONGÉLATEUR");
    expect(zoneCorrespondante("Cave", zones)).toBe("CAVE A VIN");
    expect(zoneCorrespondante("Caravane", zones)).toBeNull();
  });
  it("format du fichier Bello Mio : ordre, nom imprimé, unité de comptage, référence (id ou nom), doublons gardés", () => {
    const r = lireFeuille([
      entetes,
      [2, "Chambre froide", "Crèmerie & fromages", "BEURRE DOUX 500 G", "Mael", "pièce", "BEURRE DOUX 500 G", "", "facture"],
      [1, "Chambre froide", "Crèmerie & fromages", "BEURRE DEMI-SEL", "Mael", "pièce", id(1), "BEURRE DEMI-SEL 500 G", "ref"],
      [3, "Chambre froide", "Crèmerie & fromages", "LAIT DE COCO 1L", "Metro", "litre", "", "", "À CRÉER"],
      [4, "Cave", "Vins", "BAROLO", "Vinoflo", "colis de 6", id(2), "", "nom"],
      [5, "Cave", "Vins", "BAROLO", "Vinoflo", "colis de 6", id(2), "", "nom"],
    ], zones);
    expect(r.lignes.map((l) => [l.ordre, l.zone, l.nom, l.ref, l.uniteFeuille, l.rattachement])).toEqual([
      [1, "CHAMBRE FROIDE", "BEURRE DEMI-SEL", id(1), "pièce", "ref"],
      [2, "CHAMBRE FROIDE", "BEURRE DOUX 500 G", "BEURRE DOUX 500 G", "pièce", "facture"],
      [3, "CHAMBRE FROIDE", "LAIT DE COCO 1L", null, "litre", "À CRÉER"],
      [4, "CAVE A VIN", "BAROLO", id(2), "colis de 6", "nom"],
      [5, "CAVE A VIN", "BAROLO", id(2), "colis de 6", "nom"],
    ]);
    expect(r.doublons).toBe(1);
    expect(r.erreurs).toHaveLength(0);
  });
  it("colonnes manquantes : erreur claire", () => {
    expect(lireFeuille([["Quantité"]], zones).erreurs[0]).toMatch(/introuvables/);
  });
});

describe("unité de comptage de la feuille", () => {
  it("« colis de 20 » : deux champs, contenu 20, compté en pièces", () => {
    expect(comptageFeuille("colis de 20")).toEqual({ contenu: 20, unite: "pièce", libelle: "colis de 20" });
    expect(comptageFeuille("colis de 4 bacs")).toMatchObject({ contenu: 4, unite: "bac" });
  });
  it("« kg », « pièce » : un seul champ", () => {
    expect(comptageFeuille("kg")).toEqual({ contenu: null, unite: "kg", libelle: "kg" });
  });
  it("famille → catégorie, unité de fiche", () => {
    expect(categorieDeFamille("Crèmerie & fromages")).toBe("cremerie_fromage");
    expect(categorieDeFamille("Spiritueux & liqueurs")).toBe("spiritueux");
    expect(categorieDeFamille("Entretien & hygiène")).toBe("emballage");
    expect(uniteFicheDe("litre")).toBe("l");
    expect(uniteFicheDe("colis de 20")).toBe("pc");
  });
});
