import { describe, expect, it } from "vitest";
import { aideCloture, expliquePar, jourService, lireExportFlatpay, parisVersUtc } from "@/lib/flatpay";

// Forme réelle des exports du 08/10/2026 (dates lues par la librairie xlsx comme des heures UTC « murales »)
const carte = [
  { Date: new Date("2026-10-08T22:59:52.999Z"), Type: "Vente", "Type de carte": "MASTERCARD", Devise: "EUR", Montant: 49, Statut: "Terminé", "Nom du terminal": "SALLE" },
  { Date: new Date("2026-10-08T20:10:00.000Z"), Type: "Vente", "Type de carte": "AMERICAN_EXPRESS", Devise: "EUR", Montant: 105, Statut: "Terminé", "Nom du terminal": "SALLE" },
  { Date: new Date("2026-10-08T21:00:00.000Z"), Type: "Vente", "Type de carte": "VISA", Devise: "EUR", Montant: 26.78, Statut: "Terminé", "Nom du terminal": "TERRASSE" },
  { Date: new Date("2026-10-08T21:05:00.000Z"), Type: "Vente", "Type de carte": "VISA", Devise: "EUR", Montant: 30, Statut: "Refusé", "Nom du terminal": "SALLE" },
  { Date: "Total", Devise: "EUR", Montant: "4,735.09" },
];
const conecs = [{ Date: new Date("2026-10-08T20:41:10.000Z"), Type: "Sale", "Type de carte": "CONECS", "Émetteur": "Edenred France", Terminal: "1854803686", Montant: 25, Devise: "EUR" }];

describe("exports Flatpay", () => {
  it("export cartes : heure de Paris, ligne Total ignorée, AMEX reconnu", () => {
    const r = lireExportFlatpay(carte);
    expect(r.source).toBe("carte");
    expect(r.ignorees).toBe(1);
    expect(r.transactions).toHaveLength(4);
    expect(r.transactions[0].horodatage).toBe("2026-10-08T20:59:52.000Z"); // 22:59 à Paris (UTC+2)
    expect(r.transactions[0].jour).toBe("2026-10-08");
    expect(r.transactions[1].mode).toBe("amex");
  });
  it("export titre-restaurant : heure UTC, Conecs", () => {
    const r = lireExportFlatpay(conecs);
    expect(r.source).toBe("titre_restaurant");
    expect(r.transactions[0].horodatage).toBe("2026-10-08T20:41:10.000Z"); // 22:41 à Paris
    expect(r.transactions[0].mode).toBe("conecs");
    expect(r.transactions[0].terminal).toBe("1854803686");
  });
  it("heure d'hiver et jour de service", () => {
    expect(parisVersUtc(2026, 10, 26, 22, 0).toISOString()).toBe("2026-10-26T21:00:00.000Z");
    expect(parisVersUtc(2026, 10, 9, 22, 0).toISOString()).toBe("2026-10-09T20:00:00.000Z");
    expect(jourService(new Date("2026-10-09T22:30:00Z"))).toBe("2026-10-09"); // 00:30 à Paris : encore la veille
  });
  it("date en numéro de série Excel (lecture brute, sans fuseau)", () => {
    // 08/10/2026 20:41:10 en série Excel
    const serie = 25569 + Date.UTC(2026, 9, 8, 20, 41, 10) / 86400000;
    const c = lireExportFlatpay([{ Date: serie, Type: "Sale", "Type de carte": "CONECS", "Émetteur": "Edenred France", Terminal: "1", Montant: 25, Devise: "EUR" }]);
    expect(c.transactions[0].horodatage).toBe("2026-10-08T20:41:10.000Z");
    const k = lireExportFlatpay([{ Date: serie, Type: "Vente", "Type de carte": "VISA", Montant: 25, Statut: "Terminé", "Nom du terminal": "SALLE" }]);
    expect(k.transactions[0].horodatage).toBe("2026-10-08T18:41:10.000Z");
  });
  it("texte de date « 10/8/26 22:59 »", () => {
    const r = lireExportFlatpay([{ Date: "10/8/26 22:59", Type: "Vente", "Type de carte": "VISA", Montant: "12,50", Statut: "Terminé", "Nom du terminal": "SALLE" }]);
    expect(r.transactions[0].horodatage).toBe("2026-10-08T20:59:00.000Z");
    expect(r.transactions[0].montant).toBe(12.5);
  });
  it("pourboires usuels", () => {
    expect(expliquePar(26, 26.78)).toBe(3);
    expect(expliquePar(46.9, 49.25)).toBe(5);
    expect(expliquePar(45.9, 49.25)).toBeNull();
  });
  it("aide : candidates de l'écart, refusées, Conecs", () => {
    const tx = [...lireExportFlatpay(carte).transactions, ...lireExportFlatpay(conecs).transactions];
    const a = aideCloture(tx, -26);
    expect(a.candidates.map((c) => c.t.montant)).toEqual([26.78]);
    expect(a.refusees).toHaveLength(1);
    expect(a.conecs.map((t) => t.montant)).toEqual([25]);
    expect(a.totalExport.cb).toBe(75.78);
  });
});
