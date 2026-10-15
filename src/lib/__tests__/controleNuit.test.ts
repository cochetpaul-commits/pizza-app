import { describe, expect, it } from "vitest";
import { controlerNuit, lirePaiements, rapprocher, type PaiementPopina } from "@/lib/controleNuit";
import { VIDE, type SaisieCloture } from "@/lib/cloture";
import type { TransactionFlatpay } from "@/lib/flatpay";

// Z Popina réel du 14/10/2026 (centimes)
const rapport14 = {
  reportPayments: [
    { paymentName: "Carte de crédit", paymentAmount: 440145 },
    { paymentName: "American Express", paymentAmount: 19550 },
    { paymentName: "Espèces", paymentAmount: 50825 },
    { paymentName: "Carte Connecs", paymentAmount: 7500 },
  ],
  reportEntries: [],
  initialCashBalance: 10000,
  finalCashBalance: 60825,
};
const saisie14: SaisieCloture = {
  z: { total: 4640.39, pourboires: 43.44, amex: 205.35, conecs: 75, conecsPourboires: 0, conecsNb: 3 },
  popina: { ...VIDE.popina, cb: 4401.45, amex: 195.5, conecs: 75, conecsNb: 3, especes: 508.25, pourboires: 0 },
  tiroir: { fond: 100, compte: 608.35 },
};

const tx = (montant: number, heure: string, mode: "cb" | "amex" = "cb"): TransactionFlatpay => ({
  horodatage: `2026-10-13T${heure}:00.000Z`, jour: "2026-10-13", mode, typeCarte: mode === "amex" ? "AMERICAN_EXPRESS" : "VISA",
  montant, statut: "Terminé", operation: "Vente", terminal: "SALLE", emetteur: null, source: "carte",
});
const pay = (montant: number, heure: string, mode: "cb" | "amex" = "cb", table: string | null = null): PaiementPopina => ({ montant, mode, heure: `2026-10-13T${heure}:00.000Z`, table });

describe("contrôle de la nuit", () => {
  it("lit les paiements du Z Popina par mode", () => {
    expect(lirePaiements(rapport14)).toMatchObject({ cb: 4401.45, amex: 195.5, especes: 508.25, conecs: 75 });
  });

  it("14/10 : Z Popina juste face au TPE, 0,10 € de trop perçu au tiroir", () => {
    const c = controlerNuit({ saisie: saisie14, corrections: [], rapports: [rapport14] });
    expect(c.niveau).toBe("ok");
    expect(c.differences).toEqual([]);
    expect(c.tiroir).toEqual({ compte: 608.35, attendu: 608.25, ecart: 0.1 });
    expect(c.messages.join(" ")).toMatch(/0,10 € de trop perçu/);
  });

  it("une correction faite dans Popina mais pas recopiée : signalée, et le vrai Z est jugé", () => {
    const soir = { ...saisie14, popina: { ...saisie14.popina, cb: 4421.45, especes: 488.25 } };
    const c = controlerNuit({ saisie: soir, corrections: [], rapports: [rapport14] });
    expect(c.differences.map((d) => d.libelle)).toEqual(["Carte de crédit", "Espèces"]);
    expect(c.niveau).toBe("ok");
    expect(c.titre).toMatch(/la saisie du soir avait des montants différents/);
  });

  it("le vrai Z ne tombe pas juste : écart", () => {
    const faux = { ...rapport14, reportPayments: [{ paymentName: "Carte de crédit", paymentAmount: 440000 }, ...rapport14.reportPayments.slice(1)] };
    const c = controlerNuit({ saisie: saisie14, corrections: [], rapports: [faux] });
    expect(c.niveau).toBe("ecart");
    expect(c.verdictReel?.residu).toBe(-1.45);
  });

  it("pas de Z, ou pas de saisie", () => {
    expect(controlerNuit({ saisie: saisie14, corrections: [], rapports: [] }).niveau).toBe("absent");
    expect(controlerNuit({ saisie: null, corrections: [], rapports: [rapport14] }).niveau).toBe("sans_saisie");
  });

  it("rapprochement : pourboires retrouvés, la carte arrondie du 13/10 (table 40-1) ressort", () => {
    const tpe = [tx(258, "20:56"), tx(72.62, "20:25", "amex"), tx(77.25, "19:44"), tx(24.5, "11:55"), tx(17, "11:55")];
    const popina = [pay(258, "20:56", "cb", "40"), pay(70.5, "20:25", "amex", "140"), pay(75, "19:44", "cb", "101"), pay(24.2, "11:55", "cb", "40-1"), pay(17, "11:55", "cb", "40")];
    const r = rapprocher(tpe, popina);
    expect(r.tpeSeuls).toEqual([]);
    expect(r.popinaSeuls).toEqual([]);
    // 2,12 (AMEX) + 2,25 + 0,30 (la table 40-1, payée 24,50 pour 24,20)
    expect(r.pourboires).toEqual({ montant: 4.67, nb: 3 });
  });

  it("rapprochement : une transaction TPE sans paiement Popina", () => {
    const r = rapprocher([tx(25, "20:09"), tx(52, "20:11")], [pay(52, "20:09", "cb", "601")]);
    expect(r.tpeSeuls).toEqual([{ montant: 25, heure: "22:09", mode: "cb" }]);
  });
});
