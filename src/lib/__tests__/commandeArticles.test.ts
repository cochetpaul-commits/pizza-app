import { describe, it, expect } from "vitest";
import { libelleColisage, libelleElement, prixUniteCommande, quantiteAffichee, type CommandeArticle } from "@/lib/commandeArticles";

const art = (p: Partial<CommandeArticle>): CommandeArticle => ({
  unite_commande: "piece", contenu_nb: 1, element: null, element_qte: null, element_unite: null,
  commande_element_permise: false, precommande: false, ...p,
});

describe("libelleColisage", () => {
  it("colis de bacs avec taille", () => {
    expect(libelleColisage(art({ unite_commande: "colis", contenu_nb: 2, element: "bac", element_qte: 1, element_unite: "kg" }))).toBe("colis 2 × 1 kg");
  });
  it("colis 8 × 250 g", () => {
    expect(libelleColisage(art({ unite_commande: "colis", contenu_nb: 8, element: "pot", element_qte: 250, element_unite: "g" }))).toBe("colis 8 × 250 g");
  });
  it("carton de 6 boîtes sans taille", () => {
    expect(libelleColisage(art({ unite_commande: "carton", contenu_nb: 6, element: "boite" }))).toBe("carton de 6 boîtes");
  });
  it("plateau de 30", () => {
    expect(libelleColisage(art({ unite_commande: "plateau", contenu_nb: 30 }))).toBe("plateau de 30");
  });
  it("pièce avec poids, seau décimal, kg", () => {
    expect(libelleColisage(art({ element: "piece", element_qte: 3, element_unite: "kg" }))).toBe("pièce 3 kg");
    expect(libelleColisage(art({ unite_commande: "seau", element_qte: 2.5, element_unite: "kg" }))).toBe("seau 2,5 kg");
    expect(libelleColisage(art({ unite_commande: "kg" }))).toBe("kg");
  });
  it("élément commandable seul (crème au litre)", () => {
    const creme = art({ unite_commande: "colis", contenu_nb: 12, element: "bouteille", element_qte: 1, element_unite: "l", commande_element_permise: true });
    expect(libelleColisage(creme)).toBe("colis 12 × 1 L");
    expect(libelleElement(creme)).toBe("bouteille 1 L");
    expect(libelleElement({ ...creme, commande_element_permise: false })).toBeNull();
  });
});

describe("prixUniteCommande", () => {
  const creme = art({ unite_commande: "colis", contenu_nb: 12, element: "bouteille", element_qte: 1, element_unite: "l", commande_element_permise: true });
  it("prix au litre × contenu, et à l'élément", () => {
    const offre = { unit: "l", unit_price: 4.5, pack_price: null, pack_count: null };
    expect(prixUniteCommande(creme, offre)).toBe(54);
    expect(prixUniteCommande(creme, offre, true)).toBe(4.5);
  });
  it("même conditionnement que l'offre : prix du colis tel quel (pas de ×N)", () => {
    const burrata = art({ unite_commande: "colis", contenu_nb: 2, element: "piece", element_qte: 125, element_unite: "g" });
    expect(prixUniteCommande(burrata, { unit: "pc", unit_price: 1.975, pack_price: 3.95, pack_count: 2 })).toBe(3.95);
  });
  it("prix au kg avec éléments en grammes", () => {
    const stracciatella = art({ unite_commande: "colis", contenu_nb: 8, element: "pot", element_qte: 250, element_unite: "g" });
    expect(prixUniteCommande(stracciatella, { unit: "kg", unit_price: 12, pack_price: null, pack_count: null })).toBe(24);
  });
  it("unités incompatibles ou prix absent : null plutôt qu'un prix faux", () => {
    const sanMarzano = art({ unite_commande: "carton", contenu_nb: 6, element: "boite" });
    expect(prixUniteCommande(sanMarzano, { unit: "kg", unit_price: 3, pack_price: null, pack_count: null })).toBeNull();
    expect(prixUniteCommande(sanMarzano, null)).toBeNull();
    expect(prixUniteCommande(art({ unite_commande: "kg" }), { unit: "pc", unit_price: 3, pack_price: null, pack_count: null })).toBeNull();
  });
  it("vendu au kg", () => {
    expect(prixUniteCommande(art({ unite_commande: "kg" }), { unit: "kg", unit_price: 9.9, pack_price: null, pack_count: null })).toBe(9.9);
  });
});

describe("quantiteAffichee (écran)", () => {
  const colisPese = { au_poids: false, contenu_nb: 1, element: null, unite_commande: "colis" as const, element_qte: 5, element_unite: "kg" as const };
  it("colis pesé sans élément : « 1 colis (5 kg) »", () => {
    expect(quantiteAffichee(colisPese, 1, "uc")).toBe("1 colis (5 kg)");
    expect(quantiteAffichee(colisPese, 2, "uc")).toBe("2 colis (10 kg)");
  });
  it("unité simple avec son nom", () => {
    expect(quantiteAffichee({ au_poids: false, contenu_nb: 1, element: null, unite_commande: "botte" }, 2, "uc")).toBe("2 bottes");
    expect(quantiteAffichee({ au_poids: false, contenu_nb: 1, element: null, unite_commande: "fut" }, 1, "uc")).toBe("1 fût");
  });
  it("au poids : « 2 kg »", () => {
    expect(quantiteAffichee({ au_poids: true, contenu_nb: 1, element: null, unite_commande: "kg" }, 2, "uc")).toBe("2 kg");
  });
  it("colis de plusieurs éléments : inchangé", () => {
    expect(quantiteAffichee({ au_poids: false, contenu_nb: 6, element: "filet", unite_commande: "colis" }, 12, "element")).toBe("12 filets (2 colis)");
  });
});

describe("libelleZone et validerConditionnement", () => {
  it("zones : minuscules, majuscule au début, « à »", async () => {
    const { libelleZone } = await import("@/lib/commandeArticles");
    expect(libelleZone("CAVE A VIN")).toBe("Cave à vin");
    expect(libelleZone("CHAMBRE FROIDE")).toBe("Chambre froide");
    expect(libelleZone("CONGÉLATEUR")).toBe("Congélateur");
  });
  it("conditionnement valide : carton de 6 bouteilles de 75 cL, commandable à la bouteille", async () => {
    const { validerConditionnement } = await import("@/lib/commandeArticles");
    const r = validerConditionnement({ unite_commande: "carton", contenu_nb: "6", element: "bouteille", element_qte: "75", element_unite: "ml", commande_element_permise: true });
    expect(r.ok).toBe(true);
  });
  it("refus : unité inconnue, contenu nul, taille à moitié, élément permis sans élément", async () => {
    const { validerConditionnement } = await import("@/lib/commandeArticles");
    expect(validerConditionnement({ unite_commande: "caisse", contenu_nb: 1 }).ok).toBe(false);
    expect(validerConditionnement({ unite_commande: "colis", contenu_nb: 0 }).ok).toBe(false);
    expect(validerConditionnement({ unite_commande: "colis", contenu_nb: 1, element_qte: 5 }).ok).toBe(false);
    expect(validerConditionnement({ unite_commande: "colis", contenu_nb: 6, commande_element_permise: true }).ok).toBe(false);
  });
  it("au poids : contenu 1, sans élément", async () => {
    const { validerConditionnement } = await import("@/lib/commandeArticles");
    const r = validerConditionnement({ unite_commande: "kg", contenu_nb: 5, element: "sachet" });
    expect(r).toEqual({ ok: true, valeur: { unite_commande: "kg", contenu_nb: 1, element: null, element_qte: null, element_unite: null, commande_element_permise: false } });
  });
});
