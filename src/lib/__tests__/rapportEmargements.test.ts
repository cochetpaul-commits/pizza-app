import { describe, expect, it } from "vitest";
import { estRapportEmargements, parseRapportEmargements } from "@/lib/combo/rapportEmargements";

const ligne = (jour: string, etab: string, nom: string, plan: [string, string], valide: [string | null, string | null], pause = "30") => ({
  Jour: jour, "Établissement": etab, "Équipe": "Cuisine", Collaborateur: nom,
  "Début planifié": plan[0], "Fin planifiée": plan[1], "Pauses planifiées (en minutes)": pause,
  "Début pointé": "", "Fin pointée": "", "Pauses pointées (en minutes)": "",
  "Début validé": valide[0] ?? "", "Fin validée": valide[1] ?? "", "Pauses validées (en minutes)": valide[0] ? pause : "", "Validé par": "Pierre Cochet",
});

describe("rapport Combo des émargements", () => {
  const lignes = [
    ligne("01/10/2026", "Bello mio", "Corentin Bodin", ["09:30", "14:15"], ["09:30", "13:45"]),   // 4 h 15 planifiées, 3 h 45 validées
    ligne("01/10/2026", "Bello mio", "Corentin Bodin", ["18:00", "22:30"], ["18:00", "23:15"]),   // 4 h / 4 h 45
    ligne("05/10/2026", "Bello mio", "Corentin Bodin", ["17:00", "22:30"], [null, null]),         // pas de validation : planning
    ligne("01/10/2026", "Piccola mia", "Anne Rollot", ["09:00", "17:00"], ["09:00", "17:00"], "0"),
  ];
  it("reconnaît le rapport", () => { expect(estRapportEmargements(lignes)).toBe(true); expect(estRapportEmargements([{ Nom: "x" }])).toBe(false); });

  it("regroupe par établissement et par semaine, heures validées", () => {
    const docs = parseRapportEmargements(lignes);
    expect(docs.map((d) => `${d.etablissement_nom} ${d.periode_debut}`)).toEqual(["Bello mio 2026-09-28", "Bello mio 2026-10-05", "Piccola mia 2026-09-28"]);
    const bodin = docs[0].employes[0];
    expect(bodin.heures_planifiees).toBe(8.25);
    expect(bodin.heures_travaillees).toBe(8.5);
    expect(bodin.nb_jours_travailles).toBe(1);
    expect(bodin.nb_repas).toBe(0);
    expect(docs[1].employes[0].heures_travaillees).toBe(5); // 17:00-22:30 moins 30 min, planning faute de validation
    expect(docs[1].employes[0].nb_repas).toBe(1);
    expect(docs[2].employes[0]).toMatchObject({ prenom: "Anne", nom: "Rollot", heures_travaillees: 8 });
  });
});
