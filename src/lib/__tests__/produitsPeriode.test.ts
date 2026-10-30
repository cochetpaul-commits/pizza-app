import { describe, expect, it } from "vitest";
import { cleBucket, clesEntre, construireProduitsPeriode, detailProduit, pasPour } from "@/lib/analyse/produitsPeriode";

describe("par produit : tendance et midi / soir", () => {
  it("choisit le pas selon la période", () => {
    expect(pasPour("2026-10-01", "2026-10-31")).toBe("jour");
    expect(pasPour("2026-08-01", "2026-10-31")).toBe("semaine");
    expect(pasPour("2025-10-01", "2026-09-30")).toBe("mois");
  });
  it("regroupe par semaine du lundi", () => {
    expect(cleBucket("2026-10-29", "semaine")).toBe("2026-10-26");
    expect(clesEntre("2026-10-26", "2026-11-08", "semaine")).toEqual(["2026-10-26", "2026-11-02"]);
  });
  it("cumule par catégorie et par service, sans les messages", () => {
    const r = construireProduitsPeriode([
      { date_service: "2026-10-28", service: "midi", categorie: "PIZZE", description: "REGINA", qty: 3, ht: 30, ttc: 33 },
      { date_service: "2026-10-28", service: "soir", categorie: "PIZZE", description: "REGINA", qty: 5, ht: 50, ttc: 55 },
      { date_service: "2026-10-29", service: "soir", categorie: "DOLCI", description: "TIRAMISÙ", qty: 2, ht: 12, ttc: 13 },
      { date_service: "2026-10-29", service: "soir", categorie: "MESSAGES", description: "SANS OIGNON", qty: 1, ht: 0, ttc: 0 },
    ], "2026-10-28", "2026-10-29");
    expect(r.pas).toBe("jour");
    expect(r.tendance.categories).toEqual(["DOLCI", "PIZZE"]);
    expect(r.tendance.qty.PIZZE).toEqual([8, 0]);
    expect(r.tendance.qty.DOLCI).toEqual([0, 2]);
    expect(r.categories.find((c) => c.cat === "PIZZE")).toMatchObject({ midi_qty: 3, soir_qty: 5, midi_ht: 30, soir_ht: 50 });
    expect(r.produits.REGINA).toEqual({ cat: "PIZZE", midi_qty: 3, soir_qty: 5 });
    expect(r.produits["SANS OIGNON"]).toBeUndefined();
  });
  it("zoom sur un produit : midi / soir par période et par jour de semaine", () => {
    const lignes = [
      { date_service: "2026-10-28", service: "midi", categorie: "PIZZE", description: "REGINA", qty: 3, ht: 30, ttc: 33 },
      { date_service: "2026-10-28", service: "soir", categorie: "PIZZE", description: "REGINA", qty: 5, ht: 50, ttc: 55 },
      { date_service: "2026-10-29", service: "soir", categorie: "DOLCI", description: "TIRAMISÙ", qty: 2, ht: 12, ttc: 13 },
    ];
    const d = detailProduit(lignes, "2026-10-28", "2026-10-29", "REGINA")!;
    expect(d).toMatchObject({ cat: "PIZZE", qty: 8, ht: 80, midi_qty: 3, soir_qty: 5, jours_vendu: 1, jours_ouverts: 2 });
    expect(d.tendance.midi).toEqual([3, 0]);
    expect(d.tendance.soir).toEqual([5, 0]);
    expect(d.semaine[2]).toEqual({ jour: "Mercredi", midi: 3, soir: 5 });
    expect(detailProduit(lignes, "2026-10-28", "2026-10-29", "INCONNU")).toBeNull();
  });
});
