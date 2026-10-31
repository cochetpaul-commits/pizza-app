import { describe, expect, it } from "vitest";
import { signerJeton, verifierJeton } from "@/lib/tablette/jeton";

process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "cle-de-test";

describe("jeton tablette", () => {
  it("signe puis relit l'employé et l'établissement", () => {
    const j = signerJeton("emp-1", "etab-1", 1000);
    expect(verifierJeton(j, 2000)).toMatchObject({ employe_id: "emp-1", etab_id: "etab-1" });
  });
  it("expire après seize heures", () => {
    const j = signerJeton("emp-1", "etab-1", 0);
    expect(verifierJeton(j, 17 * 3600 * 1000)).toBeNull();
  });
  it("refuse un jeton modifié ou vide", () => {
    const j = signerJeton("emp-1", "etab-1");
    const [corps, sig] = j.split(".");
    const autre = Buffer.from(JSON.stringify({ employe_id: "emp-2", etab_id: "etab-1", exp: Date.now() + 1e6 })).toString("base64url");
    expect(verifierJeton(`${autre}.${sig}`)).toBeNull();
    expect(verifierJeton(`${corps}.abc`)).toBeNull();
    expect(verifierJeton(null)).toBeNull();
    expect(verifierJeton("")).toBeNull();
  });
});
