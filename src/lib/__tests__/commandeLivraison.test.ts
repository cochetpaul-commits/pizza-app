import { describe, it, expect } from "vitest";
import { prochaineLivraison, maintenantParis, livraisonPrecommande, precommandeEnRetard, type RegleLivraison } from "@/lib/commandeLivraison";

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
  it("Maël, heure de Paris : lundi 2 h 30 → livrée lundi ; lundi 3 h 30 → livrée mardi", () => {
    // 2 h 30 à Paris = 0 h 30 UTC : en UTC, la limite tomberait à 5 h du matin
    expect(prochaineLivraison(mael, new Date("2026-09-28T00:30:00Z"))?.date).toBe("2026-09-28");
    expect(prochaineLivraison(mael, new Date("2026-09-28T01:30:00Z"))?.date).toBe("2026-09-29");
    // Heure d'hiver (UTC+1) : lundi 2 novembre 2 h 30 à Paris = 1 h 30 UTC
    expect(prochaineLivraison(mael, new Date("2026-11-02T01:30:00Z"))?.date).toBe("2026-11-02");
    expect(prochaineLivraison(mael, new Date("2026-11-02T02:30:00Z"))?.date).toBe("2026-11-03");
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

describe("livraisonPrecommande (mercredi de la semaine suivante)", () => {
  it("envoyée le mercredi 30/09 → livrée le mercredi 07/10", () => {
    expect(livraisonPrecommande(new Date("2026-09-30T11:00:00+02:00"))).toEqual({ date: "2026-10-07", libelle: "mercredi 7 octobre" });
  });
  it("envoyée le lundi 28/09 ou le dimanche 04/10 → même mercredi 07/10", () => {
    expect(livraisonPrecommande(new Date("2026-09-28T09:00:00+02:00")).date).toBe("2026-10-07");
    expect(livraisonPrecommande(new Date("2026-10-04T20:00:00+02:00")).date).toBe("2026-10-07");
  });
  it("heure de Paris : dimanche 23 h 30 à Paris (21 h 30 UTC) reste dans la semaine du 28/09", () => {
    expect(livraisonPrecommande(new Date("2026-10-04T21:30:00Z")).date).toBe("2026-10-07");
    expect(livraisonPrecommande(new Date("2026-10-04T22:30:00Z")).date).toBe("2026-10-14"); // lundi 00 h 30 à Paris
  });
});

describe("precommandeEnRetard (limite mercredi 12 h, heure de Paris)", () => {
  it("lundi, mardi, mercredi 11 h 59 : dans les temps", () => {
    expect(precommandeEnRetard(new Date("2026-09-28T09:00:00+02:00"))).toBe(false);
    expect(precommandeEnRetard(new Date("2026-09-29T22:00:00+02:00"))).toBe(false);
    expect(precommandeEnRetard(new Date("2026-09-30T11:59:00+02:00"))).toBe(false);
  });
  it("mercredi 12 h, jeudi, dimanche soir : en retard", () => {
    expect(precommandeEnRetard(new Date("2026-09-30T12:00:00+02:00"))).toBe(true);
    expect(precommandeEnRetard(new Date("2026-10-01T08:00:00+02:00"))).toBe(true);
    expect(precommandeEnRetard(new Date("2026-10-04T23:30:00+02:00"))).toBe(true);
  });
  it("heure de Paris et non UTC : mercredi 11 h 30 à Paris = 9 h 30 UTC", () => {
    expect(precommandeEnRetard(new Date("2026-09-30T09:30:00Z"))).toBe(false);
    expect(precommandeEnRetard(new Date("2026-09-30T10:30:00Z"))).toBe(true);
  });
});
