import { describe, expect, it } from "vitest";
import { rapprocher, ressemblance, type DocumentLu, type LigneDocument } from "@/lib/rapprochementReception";

const ld = (p: Partial<LigneDocument> & { nom: string }): LigneDocument => ({ sku: null, quantite: null, unite: null, prix_unitaire: null, total: null, ingredient_id: null, ...p });
const doc = (lignes: LigneDocument[]): DocumentLu => ({ numero: "F1", date: "2026-10-10", total_ht: null, total_ttc: null, lignes, lecture: "parser" });

describe("rapprochement document ↔ commande", () => {
  it("sans document : rien", () => {
    expect(rapprocher([{ id: "a", ingredient_id: "i1", nom: "X", quantite: 1, prix_unitaire_ht: 1 }], null).nbEcarts).toBe(0);
  });
  it("conforme par fiche produit", () => {
    const r = rapprocher([{ id: "a", ingredient_id: "i1", nom: "Burrata", quantite: 3, prix_unitaire_ht: 4 }], doc([ld({ nom: "BURRATA 125G", ingredient_id: "i1", quantite: 3, prix_unitaire: 4, total: 12 })]));
    expect(r.parLigne.a.statut).toBe("conforme");
    expect(r.parLigne.a.suggestion).toBeNull();
    expect(r.nbEcarts).toBe(0);
  });
  it("absent du bon : manquant non facturé", () => {
    const r = rapprocher([{ id: "a", ingredient_id: "i1", nom: "Burrata", quantite: 3, prix_unitaire_ht: 4 }], doc([]));
    expect(r.parLigne.a.statut).toBe("absent");
    expect(r.parLigne.a.suggestion?.patch).toEqual({ etat_reception: "manquant", qty_received: 0, facture_sur_bon: false });
  });
  it("prix plus élevé à quantité égale", () => {
    const r = rapprocher([{ id: "a", ingredient_id: "i1", nom: "Burrata", quantite: 3, prix_unitaire_ht: 4 }], doc([ld({ nom: "BURRATA", ingredient_id: "i1", quantite: 3, prix_unitaire: 4.5 })]));
    expect(r.parLigne.a.statut).toBe("ecart");
    expect(r.parLigne.a.ecart).toBe(1.5);
    expect(r.parLigne.a.suggestion?.patch).toEqual({ etat_reception: "prix", prix_recu: 4.5 });
  });
  it("quantité facturée moindre au même prix : partiel", () => {
    const r = rapprocher([{ id: "a", ingredient_id: "i1", nom: "Burrata", quantite: 3, prix_unitaire_ht: 4 }], doc([ld({ nom: "BURRATA", ingredient_id: "i1", quantite: 2, prix_unitaire: 4 })]));
    expect(r.parLigne.a.suggestion?.patch).toEqual({ etat_reception: "partiel", qty_received: 2, facture_sur_bon: false });
  });
  it("rapprochement par libellé et ligne hors commande", () => {
    const r = rapprocher(
      [{ id: "a", ingredient_id: null, nom: "Lambrusco Grasparossa Cavicchioli", quantite: 6, prix_unitaire_ht: 7 }],
      doc([ld({ nom: "LAMBRUSCO GRASPAROSSA DI CASTELVETRO CAVICCHIOLI 75CL", quantite: 6, prix_unitaire: 7 }), ld({ nom: "CONSIGNE PALETTE", quantite: 1, total: 15 })]),
    );
    expect(r.parLigne.a.statut).toBe("conforme");
    expect(r.horsCommande.map((l) => l.nom)).toEqual(["CONSIGNE PALETTE"]);
    expect(r.nbEcarts).toBe(1);
  });
  it("ressemblance", () => {
    expect(ressemblance("Mozzarella fior di latte", "FIOR DI LATTE MOZZARELLA 1KG")).toBe(1);
    expect(ressemblance("Burrata", "Parmigiano")).toBe(0);
  });
});
