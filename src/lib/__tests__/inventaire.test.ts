import { describe, it, expect } from "vitest";
import { choisirConditionnement, totalLigne, lireFeuille, zoneCorrespondante, type ArticleFournisseur } from "@/lib/inventaire";

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
  it("zones du fichier reconnues sans accents ni casse, « Cave » → CAVE A VIN", () => {
    expect(zoneCorrespondante("Congelateur", zones)).toBe("CONGÉLATEUR");
    expect(zoneCorrespondante("Cave", zones)).toBe("CAVE A VIN");
    expect(zoneCorrespondante("Caravane", zones)).toBeNull();
  });
  it("ordre gardé, zone et famille reportées sur les cellules vides, doublons signalés", () => {
    const r = lireFeuille([
      ["Zone", "Famille", "Nom", "Identifiant"],
      ["Chambre froide", "Crèmerie", "Beurre", id(1)],
      ["", "", "Crème", id(2)],
      ["", "Charcuterie", "Jambon", id(3)],
      ["", "", "Jambon", id(3)],
      ["Cave", "Vins", "Barolo", id(4)],
      ["", "", "Ligne sans id", ""],
    ], zones);
    expect(r.lignes.map((l) => [l.zone, l.famille, l.nom, l.ordre])).toEqual([
      ["CHAMBRE FROIDE", "Crèmerie", "Beurre", 1],
      ["CHAMBRE FROIDE", "Crèmerie", "Crème", 2],
      ["CHAMBRE FROIDE", "Charcuterie", "Jambon", 3],
      ["CAVE A VIN", "Vins", "Barolo", 4],
    ]);
    expect(r.erreurs).toHaveLength(2);
  });
  it("colonnes manquantes : erreur claire", () => {
    expect(lireFeuille([["Produit", "Quantité"]], zones).erreurs[0]).toMatch(/introuvables/);
  });
});
