import { describe, expect, it } from "vitest";
import { capaciteService, capacitesParJour, jardinOuvert } from "@/components/analyse/parJour";
import type { StatsVentes } from "@/components/analyse/useStatsVentes";

describe("places disponibles : salle et jardin", () => {
  it("le jardin compte ouvert dès qu'il y a une vente en Terrasse ou Jardin", () => {
    expect(jardinOuvert({ Salle: 1200, Terrasse: 0 })).toBe(false);
    expect(jardinOuvert({ Salle: 1200, Terrasse: 310 })).toBe(true);
    expect(jardinOuvert({ Salle: 1200, Jardin: 5 })).toBe(true);
    expect(jardinOuvert(undefined)).toBe(false);
  });
  it("67 places en salle, 117 quand le jardin a servi, null sans réglage", () => {
    const cap = { salle: 67, jardin: 50 };
    expect(capaciteService({ Salle: 900, Pergolas: 300 }, cap)).toBe(67);
    expect(capaciteService({ Salle: 900, Terrasse: 300 }, cap)).toBe(117);
    expect(capaciteService({ Terrasse: 300 }, { salle: null, jardin: 50 })).toBeNull();
  });
  it("capacité par date et par service", () => {
    const stats = { services: [
      { date: "2026-10-05", svc: "midi", z_ttc: { Salle: 500 } }, { date: "2026-10-05", svc: "soir", z_ttc: { Salle: 900, Terrasse: 400 } },
    ] } as unknown as StatsVentes;
    const m = capacitesParJour(stats, { salle: 67, jardin: 50 });
    expect(m.get("2026-10-05")).toEqual({ midi: 67, soir: 117, jardinMidi: false, jardinSoir: true });
  });
});
