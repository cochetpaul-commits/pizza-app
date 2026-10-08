import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: {} }));
import { modeDeLigne } from "@/lib/commandeSimplifiee";
import { peutValiderEnvoyer } from "@/lib/commandeEnvoi";

describe("modeDeLigne (libellés anciens et actuels)", () => {
  const vin = { unite_commande: "carton" as const, unite_element: "bouteille" };
  const citron = { unite_commande: "colis" as const, unite_element: "filet 500 g" };
  it("ancien écran : « carton » = colis, « bouteille » = élément", () => {
    expect(modeDeLigne("carton", vin)).toBe("uc");
    expect(modeDeLigne("bouteille", vin)).toBe("element");
  });
  it("libellé actuel « carton de 6 bouteilles » = colis", () => {
    expect(modeDeLigne("carton de 6 bouteilles", vin)).toBe("uc");
  });
  it("« sachet 500 g » devenu « filet 500 g » : toujours l'élément", () => {
    expect(modeDeLigne("sachet 500 g", citron)).toBe("element");
    expect(modeDeLigne("colis 8 × 500 g", citron)).toBe("uc");
  });
  it("sans commande à l'élément : colis", () => {
    expect(modeDeLigne("fut", { unite_commande: "fut", unite_element: null })).toBe("uc");
  });
});

describe("peutValiderEnvoyer (envoi_equipier)", () => {
  it("équipier : seulement si le fournisseur est réglé envoi_equipier", () => {
    expect(peutValiderEnvoyer("equipier", true)).toBe(true);
    expect(peutValiderEnvoyer("equipier", false)).toBe(false);
  });
  it("manager et admin : partout", () => {
    expect(peutValiderEnvoyer("manager", false)).toBe(true);
    expect(peutValiderEnvoyer("group_admin", false)).toBe(true);
  });
  it("équipier avec l'exception « Valider les commandes » sur sa fiche : partout, comme le bouton à l'écran", () => {
    expect(peutValiderEnvoyer("equipier", false, { "commandes.valider": true })).toBe(true);
    expect(peutValiderEnvoyer("equipier", false, { "achats.inventaire": true })).toBe(false);
    expect(peutValiderEnvoyer("equipier", false, {})).toBe(false);
  });
  it("manager à qui on a retiré l'exception : seulement les fournisseurs envoi_equipier", () => {
    expect(peutValiderEnvoyer("manager", false, { "commandes.valider": false })).toBe(false);
    expect(peutValiderEnvoyer("manager", true, { "commandes.valider": false })).toBe(true);
  });
  it("sans rôle : jamais", () => {
    expect(peutValiderEnvoyer(null, true, { "commandes.valider": true })).toBe(false);
  });
});
