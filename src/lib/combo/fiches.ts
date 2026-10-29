import type { ComboContract } from "@/lib/combo/api";

/** Correspondance contrat Combo ↔ fiche employé, et équipe d'après la fonction (fonctions pures, testées) */
export const normNom = (s: string | null | undefined) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
export const TYPES_CONTRAT: Record<string, string> = { CDI: "CDI", CDD: "CDD", seasonal: "extra", extra: "extra", apprenticeship: "apprenti", internship: "stagiaire" };

export type FicheExistante = { id: string; prenom: string; nom: string; matricule: string | null; combo_id: string | null; combo_contract_id: string | null };

/** La fiche qui correspond à un contrat Combo, ou null */
export function ficheDuContrat(c: ComboContract, fiches: FicheExistante[]): FicheExistante | null {
  return fiches.find((e) => e.combo_id === c.id)
    ?? fiches.find((e) => c.original_contract_id && e.combo_contract_id === c.original_contract_id)
    ?? fiches.find((e) => c.employee_number && e.matricule === c.employee_number)
    ?? fiches.find((e) => normNom(e.nom) === normNom(c.lastname) && normNom(e.prenom) === normNom(c.firstname))
    ?? null;
}

/** Équipe (Cuisine / Salle) d'après la fonction Combo */
export function equipeDeFonction(fonction: string | null | undefined): "Cuisine" | "Salle" | null {
  const f = normNom(fonction);
  if (/cuisi|pizza|plong|chef(?!.*rang)|commis de cuisine/.test(f)) return "Cuisine";
  if (/salle|rang|barman|bar\b|serveu|runner|floor/.test(f)) return "Salle";
  return null;
}

/** Brut mensuel : celui de Combo, sinon heures × 52 / 12 × taux horaire (extras) */
export const brutMensuelContrat = (c: ComboContract) => c.monthly_gross_salary ?? (c.hourly_gross_salary ? Math.round(((c.contract_time * 52) / 12) * c.hourly_gross_salary * 100) / 100 : 0);
