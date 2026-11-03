import { describe, expect, it } from "vitest";
import { champsFiche, departs, equipeDe, trouverEmploye, typeContrat, type ContratCombo, type EmployeApp } from "@/lib/combo/syncEquipe";

const contrat = (p: Partial<ContratCombo>): ContratCombo => ({ id: "c1", original_contract_id: "c1", firstname: "elise", lastname: "Rondeau", email: null, mobile_phone: null, function: null, role: "employee", contract_type: "CDI", contract_time: 35, start_date: "2025-03-17", end_date: null, employee_number: null, monthly_gross_salary: null, street_address: null, zip: null, city: null, social_security_number: null, ...p });
const emp = (p: Partial<EmployeApp>): EmployeApp => ({ id: "e1", prenom: "Elise", nom: "RONDEAU", email: null, combo_id: null, matricule: null, actif: true, equipes_access: ["Salle"], etablissements_ids: ["bm"], date_sortie: null, ...p });

describe("synchronisation Combo", () => {
  it("retrouve la fiche par identifiant, e-mail, matricule puis nom", () => {
    expect(trouverEmploye([emp({ combo_id: "c1" })], contrat({}))?.id).toBe("e1");
    expect(trouverEmploye([emp({ email: "A@B.fr" })], contrat({ id: "x", email: "a@b.fr" }))?.id).toBe("e1");
    expect(trouverEmploye([emp({})], contrat({ id: "x", firstname: "Élise", lastname: "RONDEAU" }))?.id).toBe("e1");
    expect(trouverEmploye([emp({})], contrat({ id: "x", firstname: "Evann", lastname: "Couanon" }))).toBeNull();
  });
  it("équipe d'après la fonction", () => {
    expect(equipeDe("Chef(fe) de rang")).toBe("Salle");
    expect(equipeDe("Commis de salle")).toBe("Salle");
    expect(equipeDe("Pizzaïolo")).toBe("Cuisine");
    expect(equipeDe("Agent de maitrise")).toBe("Cuisine");
    expect(equipeDe(null)).toBeNull();
    expect(typeContrat("seasonal")).toBe("CDD");
  });
  it("n'écrit pas de colonne inconnue et n'efface rien de ce que Combo ne connaît pas", () => {
    const v = champsFiche(contrat({ function: null, street_address: null }), emp({ etablissements_ids: ["bm", "pm"] }), "bm");
    expect(v).not.toHaveProperty("emploi");
    expect(v).not.toHaveProperty("adresse");
    expect(v).not.toHaveProperty("equipes_access");
    expect(v.etablissements_ids).toEqual(["bm", "pm"]);
    expect(v.prenom).toBe("Elise");
  });
  it("départs : date et motif quand le dernier contrat a une fin passée, signalés sinon", () => {
    const liste = [emp({ id: "elise", combo_id: "c1" }), emp({ id: "graux", prenom: "Téheitéa", nom: "GRAUX", combo_id: "c2" }), emp({ id: "remy", prenom: "Rémy", nom: "BASSET", combo_id: "c3" })];
    const actuels = [contrat({ id: "c3", original_contract_id: "c3", firstname: "Rémy", lastname: "BASSET" })];
    const anciens = [contrat({ id: "c1", end_date: "2026-10-31", contract_end_reason: "resignation" }), contrat({ id: "c2", original_contract_id: "c2", firstname: "Téheitéa", lastname: "Graux", contract_type: "seasonal", end_date: null })];
    const d = departs(liste, actuels, anciens, "2026-11-03");
    expect(d.map((x) => [x.employe.id, x.date, x.motif])).toEqual([["elise", "2026-10-31", "Démission"], ["graux", null, null]]);
  });
});
