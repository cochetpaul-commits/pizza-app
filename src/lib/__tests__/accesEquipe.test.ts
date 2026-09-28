import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: {} }));
import { verifierRoleEtablissements, verifierRegles, AccesErreur } from "@/lib/accesEquipe";

const ETABS = ["bello", "piccola"];

describe("verifierRoleEtablissements", () => {
  it("rôle et établissements valides", () => {
    expect(verifierRoleEtablissements("manager", ["piccola", "piccola"], ETABS)).toEqual({ role: "manager", etablissements: ["piccola"] });
  });
  it("rôle inconnu refusé", () => {
    expect(() => verifierRoleEtablissements("direction", ["bello"], ETABS)).toThrow(AccesErreur);
  });
  it("au moins un établissement, et existant", () => {
    expect(() => verifierRoleEtablissements("equipier", [], ETABS)).toThrow(/au moins un/);
    expect(() => verifierRoleEtablissements("equipier", ["autre"], ETABS)).toThrow(/inconnu/);
  });
});

describe("verifierRegles", () => {
  const base = { parId: "paul", roleActuel: "group_admin", cibleActive: true, adminsActifs: ["paul", "pierre"] };
  it("un admin ne change pas son propre rôle", () => {
    expect(() => verifierRegles({ ...base, cibleId: "paul", nouveauRole: "manager" })).toThrow(/propre rôle/);
  });
  it("un admin ne se désactive pas", () => {
    expect(() => verifierRegles({ ...base, cibleId: "paul", desactiver: true })).toThrow(/propre compte/);
  });
  it("rétrograder un autre admin : permis s'il en reste un", () => {
    expect(() => verifierRegles({ ...base, cibleId: "pierre", nouveauRole: "manager" })).not.toThrow();
  });
  it("jamais le dernier admin actif", () => {
    expect(() => verifierRegles({ ...base, parId: "paul", cibleId: "pierre", nouveauRole: "manager", adminsActifs: ["pierre"] })).toThrow(/dernier admin/);
    expect(() => verifierRegles({ ...base, parId: "paul", cibleId: "pierre", desactiver: true, adminsActifs: ["pierre"] })).toThrow(/dernier admin/);
  });
  it("changer les établissements de soi-même sans changer de rôle : permis", () => {
    expect(() => verifierRegles({ ...base, cibleId: "paul", nouveauRole: "group_admin" })).not.toThrow();
  });
});
