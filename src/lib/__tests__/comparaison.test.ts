import { describe, expect, it } from "vitest";
import { libelleComparaison, periodeAnDernier, periodeEffective, periodePrecedente } from "@/components/analyse/gabarit";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const aujourdhui = iso(new Date());
const plus = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };

describe("comparaison des périodes", () => {
  it("une période qui dépasse aujourd'hui s'arrête à aujourd'hui", () => {
    expect(periodeEffective({ from: "2026-01-01", to: "2026-01-31" })).toEqual({ from: "2026-01-01", to: "2026-01-31" });
    expect(periodeEffective({ from: plus(-10), to: plus(5) })).toEqual({ from: plus(-10), to: aujourdhui });
  });
  it("la période précédente a autant de jours que les jours écoulés", () => {
    const p = periodePrecedente({ from: plus(-9), to: plus(5) }); // 10 jours écoulés
    expect(p).toEqual({ from: plus(-19), to: plus(-10) });
  });
  it("l'an dernier : mêmes dates, un an plus tôt", () => {
    expect(periodeAnDernier({ from: "2026-10-01", to: "2026-10-29" })).toEqual({ from: "2025-10-01", to: "2025-10-29" });
    expect(periodeAnDernier({ from: "2024-02-29", to: "2024-02-29" })).toEqual({ from: "2023-02-28", to: "2023-02-28" });
  });
  it("libellés", () => {
    expect(libelleComparaison({ from: "2026-09-01", to: "2026-09-30" }, "precedente")).toBe("30 jours · comparés aux 30 jours d'avant");
    expect(libelleComparaison({ from: plus(-9), to: plus(5) }, "an_dernier")).toContain("10 jours écoulés · comparés au");
  });
});
