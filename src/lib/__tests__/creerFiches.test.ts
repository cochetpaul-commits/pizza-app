import { describe, expect, it } from "vitest";
import { brutMensuelContrat, equipeDeFonction, ficheDuContrat } from "@/lib/combo/fiches";
import type { ComboContract } from "@/lib/combo/api";

const contrat = (p: Partial<ComboContract>): ComboContract => ({ id: "c1", original_contract_id: "o1", firstname: "Corentin", lastname: "Bodin", email: null, mobile_phone: null, function: "Pizzaïolo", role: "employee", contract_type: "CDI", contract_time: 39, start_date: "2025-10-01", end_date: null, location_id: "l", employee_number: "00013", monthly_gross_salary: 2500, hourly_gross_salary: 14.6, hourly_gross_rate: 19.8, street_address: null, zip: null, city: null, ...p } as ComboContract);
const fiche = { id: "e1", prenom: "Corentin", nom: "BODIN", matricule: null, combo_id: null, combo_contract_id: null };

describe("fiches créées depuis Combo", () => {
  it("retrouve une fiche par combo_id, matricule ou nom (accents et casse ignorés)", () => {
    expect(ficheDuContrat(contrat({}), [fiche])?.id).toBe("e1");
    expect(ficheDuContrat(contrat({ firstname: "Téheitéa", lastname: "Graux" }), [{ ...fiche, prenom: "Teheitea", nom: "GRAUX" }])?.id).toBe("e1");
    expect(ficheDuContrat(contrat({ firstname: "X", lastname: "Y" }), [{ ...fiche, combo_id: "c1" }])?.id).toBe("e1");
    expect(ficheDuContrat(contrat({ firstname: "X", lastname: "Y" }), [{ ...fiche, matricule: "00013" }])?.id).toBe("e1");
    expect(ficheDuContrat(contrat({ firstname: "X", lastname: "Y" }), [fiche])).toBeNull();
  });
  it("devine l'équipe d'après la fonction", () => {
    expect(equipeDeFonction("Pizzaïolo")).toBe("Cuisine");
    expect(equipeDeFonction("Cheffe de rang")).toBe("Salle");
    expect(equipeDeFonction("Chef")).toBe("Cuisine");
    expect(equipeDeFonction("Barman")).toBe("Salle");
    expect(equipeDeFonction("Gérant")).toBeNull();
  });
  it("brut mensuel d'un extra sans salaire mensuel : heures × 52 / 12 × taux", () => {
    expect(brutMensuelContrat(contrat({ monthly_gross_salary: null as unknown as number, hourly_gross_salary: 13.8418, contract_time: 20 }))).toBeCloseTo(1199.62, 1);
    expect(brutMensuelContrat(contrat({}))).toBe(2500);
  });
});
