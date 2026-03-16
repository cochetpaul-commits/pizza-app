import { useMemo } from "react";
import {
  calculerBilanSemaine,
  type BilanSemaine,
  type ShiftInput,
  type ContratInput,
  type Alerte,
} from "@/hooks/useConventionLegale";
import type { Shift, EmployeAvecContrat } from "@/types/rh";

// ── Types ────────────────────────────────────────────────────────────────

export type BilanEmployeSemaine = {
  employe_id: string;
  nom: string;
  bilan: BilanSemaine;
  heures_travaillees: number;
  delta_contrat: number;
  nb_repas: number;
  has_alerte: boolean;
  nb_alertes: number;
};

export type BilanSemainePlanning = {
  bilans: BilanEmployeSemaine[];
  total_heures: number;
  total_repas: number;
  total_heures_supp: number;
  cout_estime: number;
  alertes_par_jour: Record<string, Alerte[]>;
  employes_en_alerte: number;
};

// ── Hook ─────────────────────────────────────────────────────────────────

export function usePlanningLegal({
  employes,
  shifts,
  lundiISO,
  convention,
  tauxHoraire,
  tauxCharges,
}: {
  employes: EmployeAvecContrat[];
  shifts: Shift[];
  lundiISO: string;
  convention: "HCR_1979" | "RAPIDE_1501";
  tauxHoraire: number;
  tauxCharges: number;
}): BilanSemainePlanning {
  return useMemo(() => {
    const bilans: BilanEmployeSemaine[] = [];
    const alertes_par_jour: Record<string, Alerte[]> = {};
    let total_heures = 0;
    let total_repas = 0;
    let total_heures_supp = 0;
    let employes_en_alerte = 0;

    for (const emp of employes) {
      const contratActif = emp.contrat_actif;
      if (!contratActif) continue;

      const empShifts = shifts.filter((s) => s.employe_id === emp.id);
      if (empShifts.length === 0) continue;

      const shiftInputs: ShiftInput[] = empShifts.map((s) => ({
        date: s.date,
        heure_debut: s.heure_debut,
        heure_fin: s.heure_fin,
        pause_minutes: s.pause_minutes,
        heures_reelles_debut: s.heures_reelles_debut ?? undefined,
        heures_reelles_fin: s.heures_reelles_fin ?? undefined,
        pause_reelle_minutes: s.pause_reelle_minutes ?? undefined,
      }));

      const contratInput: ContratInput = {
        type: contratActif.type,
        heures_semaine: contratActif.heures_semaine,
        convention,
      };

      const bilan = calculerBilanSemaine(shiftInputs, contratInput, emp.id);
      const hs = bilan.heures_supp_10 + bilan.heures_supp_20 + bilan.heures_supp_50;
      const hasAlerte = bilan.alertes.length > 0;

      bilans.push({
        employe_id: emp.id,
        nom: `${emp.prenom} ${emp.nom}`,
        bilan,
        heures_travaillees: bilan.heures_travaillees,
        delta_contrat: bilan.delta_contrat,
        nb_repas: bilan.nb_repas,
        has_alerte: hasAlerte,
        nb_alertes: bilan.alertes.length,
      });

      total_heures += bilan.heures_travaillees;
      total_repas += bilan.nb_repas;
      total_heures_supp += hs;
      if (hasAlerte) employes_en_alerte++;

      for (const a of bilan.alertes) {
        if (!alertes_par_jour[a.date]) alertes_par_jour[a.date] = [];
        alertes_par_jour[a.date].push(a);
      }
    }

    const cout_estime = total_heures * tauxHoraire * (1 + tauxCharges / 100);

    return { bilans, total_heures, total_repas, total_heures_supp, cout_estime, alertes_par_jour, employes_en_alerte };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employes, shifts, lundiISO, convention, tauxHoraire, tauxCharges]);
}

// ── Helpers ──────────────────────────────────────────────────────────────

export function useBilanEmploye(
  bilans: BilanEmployeSemaine[],
  employeId: string | null,
): BilanEmployeSemaine | undefined {
  return useMemo(
    () => (employeId ? bilans.find((b) => b.employe_id === employeId) : undefined),
    [bilans, employeId],
  );
}
