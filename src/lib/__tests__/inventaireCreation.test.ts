import { describe, it, expect } from "vitest";
import { articleDeFiche, codeUnite, conditionnementDArticle, ficheDepuisCreation, type CreationProduit } from "@/lib/inventaire";

describe("codeUnite", () => {
  it("reconnaît les libellés libres de la fiche", () => {
    expect(codeUnite("Carton")).toBe("carton");
    expect(codeUnite("cartons")).toBe("carton");
    expect(codeUnite("Boîtes")).toBe("boite");
    expect(codeUnite("pcs")).toBe("piece");
    expect(codeUnite("L")).toBe("litre");
    expect(codeUnite("kilo")).toBe("kg");
    expect(codeUnite("fût")).toBe("fut");
    expect(codeUnite("truc")).toBeNull();
    expect(codeUnite(null)).toBeNull();
  });
});

describe("articleDeFiche", () => {
  it("carton de 12 bouteilles 750 mL", () => {
    const a = articleDeFiche({ order_unit_label: "carton", order_quantity: 12, order_element: "bouteille", purchase_unit_label: "bouteille", piece_weight_g: null, piece_volume_ml: 750 });
    expect(a).toMatchObject({ unite_commande: "carton", contenu_nb: 12, element: "bouteille", element_qte: 750, element_unite: "ml", commande_element_permise: false });
    expect(conditionnementDArticle(a!, null)).toMatchObject({ supplier_id: null, contenu: 12, libelle: "carton de 12 bouteilles 750 mL", unite: "bouteille" });
  });
  it("élément d'après le type de pièce quand la fiche n'en nomme pas", () => {
    const a = articleDeFiche({ order_unit_label: "colis", order_quantity: 8, order_element: null, purchase_unit_label: "pot", piece_weight_g: 250, piece_volume_ml: null });
    expect(a).toMatchObject({ unite_commande: "colis", contenu_nb: 8, element: "pot", element_qte: 250, element_unite: "g" });
  });
  it("au kilo : kg, sans contenu", () => {
    expect(articleDeFiche({ order_unit_label: "kg", order_quantity: 5, order_element: null, purchase_unit_label: "kg", piece_weight_g: null, piece_volume_ml: null }))
      .toMatchObject({ unite_commande: "kg", contenu_nb: 1, element: null });
  });
  it("unité inconnue ou vide : rien", () => {
    expect(articleDeFiche({ order_unit_label: null, order_quantity: null, order_element: null, purchase_unit_label: "kg", piece_weight_g: null, piece_volume_ml: null })).toBeNull();
    expect(articleDeFiche({ order_unit_label: "n'importe quoi", order_quantity: 3, order_element: null, purchase_unit_label: null, piece_weight_g: null, piece_volume_ml: null })).toBeNull();
  });
});

describe("ficheDepuisCreation", () => {
  const base: CreationProduit = { nom: "Acqua Filette Naturale 0,75L", categorie: "soft", unite: "piece", type_piece: "bouteille", taille_qte: 750, taille_unite: "ml", colisage: "carton", contenu: 12 };
  it("bouteille 750 mL en carton de 12", () => {
    const r = ficheDepuisCreation(base);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.fiche).toMatchObject({
      name: "Acqua Filette Naturale 0,75L", category: "soft", default_unit: "pc", purchase_unit_label: "bouteille",
      piece_volume_ml: 750, piece_weight_g: null, order_unit_label: "carton", order_quantity: 12, order_element: "bouteille", order_element_permis: false,
    });
    // La fiche ainsi créée donne bien le conditionnement attendu à l'inventaire et à la commande
    const a = articleDeFiche(r.fiche as never);
    expect(conditionnementDArticle(a!, null).libelle).toBe("carton de 12 bouteilles 750 mL");
  });
  it("à la pièce sans colis : unité de commande = type de pièce", () => {
    const r = ficheDepuisCreation({ ...base, colisage: null, contenu: null });
    expect(r.ok && r.fiche).toMatchObject({ order_unit_label: "bouteille", order_quantity: null, order_element: null });
    const a = articleDeFiche((r as unknown as { fiche: never }).fiche);
    expect(conditionnementDArticle(a!, null)).toMatchObject({ contenu: 1, libelle: "bouteille 750 mL", unite: "bouteille" });
  });
  it("au kilo : kg partout, pas de taille de pièce", () => {
    const r = ficheDepuisCreation({ nom: "Farine T00", categorie: "epicerie_salee", unite: "kg", taille_qte: 25, taille_unite: "kg" });
    expect(r.ok && r.fiche).toMatchObject({ default_unit: "kg", purchase_unit_label: "kg", order_unit_label: "kg", piece_weight_g: null, piece_volume_ml: null });
  });
  it("fournisseur et sous-catégorie repris, vides → null", () => {
    const r = ficheDepuisCreation({ ...base, supplier_id: "", sous_categorie: "  " });
    expect(r.ok && r.fiche).toMatchObject({ supplier_id: null, default_supplier_id: null, sub_category: null });
    const r2 = ficheDepuisCreation({ ...base, supplier_id: "f1", sous_categorie: "Eaux" });
    expect(r2.ok && r2.fiche).toMatchObject({ supplier_id: "f1", default_supplier_id: "f1", sub_category: "Eaux" });
  });
  it("refuse ce qui est incohérent", () => {
    expect(ficheDepuisCreation({ ...base, nom: "A" })).toMatchObject({ ok: false });
    expect(ficheDepuisCreation({ ...base, colisage: "carton", contenu: 0 })).toMatchObject({ ok: false });
    expect(ficheDepuisCreation({ ...base, colisage: "palette" })).toMatchObject({ ok: false });
    expect(ficheDepuisCreation({ ...base, taille_qte: -1 })).toMatchObject({ ok: false });
  });
});
