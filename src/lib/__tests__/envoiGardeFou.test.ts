import { describe, it, expect } from "vitest";
import { destinatairesBloques } from "@/lib/envoiGardeFou";

describe("destinatairesBloques", () => {
  const liste = ["cochetpaul@bellomio.fr", "commandes@mael.fr", " Contact@BelloMio.FR "];
  it("en production : rien n'est bloqué", () => {
    expect(destinatairesBloques(liste, "production")).toEqual([]);
  });
  it("en preview : tout ce qui n'est pas @bellomio.fr est bloqué", () => {
    expect(destinatairesBloques(liste, "preview")).toEqual(["commandes@mael.fr"]);
  });
  it("en local (VERCEL_ENV absent) : même règle qu'en preview", () => {
    expect(destinatairesBloques(liste, undefined)).toEqual(["commandes@mael.fr"]);
  });
  it("un domaine qui ressemble ne passe pas", () => {
    expect(destinatairesBloques(["x@faux-bellomio.fr", "x@bellomio.fr.evil.com"], "preview")).toHaveLength(2);
  });
});
