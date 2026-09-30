import { describe, it, expect } from "vitest";
import { zonesPour, appliquerZonesEtab, cleEtab } from "@/lib/zonesEtablissement";

const BM = "etab-bello", PM = "etab-piccola";

describe("zonesPour", () => {
  it("rang 1 / 2 de l'établissement demandé, emplacements supplémentaires sans doublon", () => {
    const rows = [
      { etablissement_id: BM, zone: "CHAMBRE FROIDE", rang: 1 },
      { etablissement_id: BM, zone: "BAR", rang: 2 },
      { etablissement_id: BM, zone: "ANNEXE", rang: null },
      { etablissement_id: BM, zone: "BAR", rang: null },
      { etablissement_id: PM, zone: "SURFACE DE VENTE", rang: 1 },
    ];
    expect(zonesPour(rows, BM)).toEqual({ zone1: "CHAMBRE FROIDE", zone2: "BAR", autres: ["ANNEXE"] });
    expect(zonesPour(rows, PM)).toEqual({ zone1: "SURFACE DE VENTE", zone2: null, autres: [] });
    expect(zonesPour(rows, "autre")).toEqual({ zone1: null, zone2: null, autres: [] });
    expect(zonesPour(undefined, BM)).toEqual({ zone1: null, zone2: null, autres: [] });
  });
});

describe("appliquerZonesEtab", () => {
  const fiche = { id: "i1", etablissement_id: PM, storage_zone: "SURFACE DE VENTE", storage_zone_2: null, ingredient_zones: [
    { etablissement_id: PM, zone: "SURFACE DE VENTE", rang: 1 },
    { etablissement_id: BM, zone: "CAVE A VIN", rang: 1 },
    { etablissement_id: BM, zone: "BAR", rang: 2 },
  ] };
  it("vue Bello Mio : zones de Bello Mio, embed retiré", () => {
    const [r] = appliquerZonesEtab([fiche], BM);
    expect(r.storage_zone).toBe("CAVE A VIN");
    expect(r.storage_zone_2).toBe("BAR");
    expect("ingredient_zones" in r).toBe(false);
  });
  it("vue Piccola Mia : zone de Piccola Mia", () => {
    const [r] = appliquerZonesEtab([fiche], PM);
    expect(r.storage_zone).toBe("SURFACE DE VENTE");
    expect(r.storage_zone_2).toBeNull();
  });
  it("sans établissement (vue groupe) : miroir conservé", () => {
    const [r] = appliquerZonesEtab([fiche], null);
    expect(r.storage_zone).toBe("SURFACE DE VENTE");
  });
  it("aucune zone dans cet établissement : vide, pas la zone de l'autre restaurant", () => {
    const [r] = appliquerZonesEtab([{ ...fiche, ingredient_zones: fiche.ingredient_zones.filter((z) => z.etablissement_id === PM) }], BM);
    expect(r.storage_zone).toBeNull();
  });
});

describe("cleEtab", () => {
  it("slug → clé establishments", () => {
    expect(cleEtab("bello_mio")).toBe("bellomio");
    expect(cleEtab("piccola")).toBe("piccola");
    expect(cleEtab(null)).toBeNull();
  });
});
