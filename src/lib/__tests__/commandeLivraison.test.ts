import { describe, it, expect } from "vitest";
import { prochaineLivraison, maintenantParis, type RegleLivraison } from "@/lib/commandeLivraison";

const JOURS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
const mael: RegleLivraison[] = JOURS.map((j) => ({ day: j, cutoff: "03:00", delivery_day: j }));
const carniato: RegleLivraison[] = [
  { day: "lundi", cutoff: "12:00", delivery_day: "mercredi" },
  { day: "mardi", cutoff: "12:00", delivery_day: "jeudi" },
  { day: "samedi", cutoff: "", delivery_day: "" },
];

// Lundi 28 septembre 2026 ; Paris = UTC+2 (heure d'été)
const paris = (jourHeure: string) => new Date(`2026-09-${jourHeure}+02:00`);

describe("maintenantParis", () => {
  it("heure de Paris, pas celle du serveur (UTC)", () => {
    expect(maintenantParis(new Date("2026-09-28T23:30:00Z"))).toEqual({ date: "2026-09-29", jour: 2, heure: "01:30" });
  });
});

describe("prochaineLivraison", () => {
  it("Maël : envoyée lundi 22 h → livrée mardi", () => {
    expect(prochaineLivraison(mael, paris("28T22:00:00"))).toEqual({ date: "2026-09-29", libelle: "mardi 29 septembre" });
  });
  it("Maël : envoyée mardi 1 h 30 (avant 3 h) → livrée le jour même", () => {
    expect(prochaineLivraison(mael, paris("29T01:30:00"))?.date).toBe("2026-09-29");
  });
  it("Maël : envoyée mardi à 3 h pile → livrée mercredi", () => {
    expect(prochaineLivraison(mael, paris("29T03:00:00"))?.date).toBe("2026-09-30");
  });
  it("Carniato : lundi 11 h → mercredi ; lundi 13 h → jeudi (règle du mardi)", () => {
    expect(prochaineLivraison(carniato, paris("28T11:00:00"))?.date).toBe("2026-09-30");
    expect(prochaineLivraison(carniato, paris("28T13:00:00"))?.date).toBe("2026-10-01");
  });
  it("jour sans heure limite ignoré ; planning vide → null", () => {
    expect(prochaineLivraison(carniato, new Date("2026-10-03T10:00:00+02:00"))?.date).toBe("2026-10-07");
    expect(prochaineLivraison(null)).toBeNull();
  });
});
