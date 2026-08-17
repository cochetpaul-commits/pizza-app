import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Règles d'absences simultanées (table conges_regles) : par établissement
 * et par équipe, au plus `max_absents` employés absents en même temps.
 * Les demandes en attente comptent comme les congés validés — premier
 * arrivé, premier servi — sinon deux demandes simultanées passeraient
 * toutes les deux puis seraient validées toutes les deux.
 */

export type ViolationRegle = {
  equipe: string;
  max: number;
  /** Jours (ISO) où le plafond serait dépassé, avec les absents du jour */
  jours: { date: string; absents: string[] }[];
};

const addDays = (iso: string, n: number) => {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export function formatViolations(violations: ViolationRegle[]): string {
  return violations
    .map(v => {
      const jours = v.jours.slice(0, 4).map(j => j.date.split("-").reverse().slice(0, 2).join("/")).join(", ");
      const plus = v.jours.length > 4 ? `… (+${v.jours.length - 4} j)` : "";
      const absents = [...new Set(v.jours.flatMap(j => j.absents))].slice(0, 4).join(", ");
      return `Équipe ${v.equipe} : déjà ${v.max} absent(s) le ${jours}${plus} (${absents})`;
    })
    .join(" · ");
}

/**
 * Vérifie qu'une absence de `employeId` du `dateDebut` au `dateFin` ne
 * dépasse aucune règle de son établissement. `ignoreAbsenceId` permet de
 * revérifier une demande existante (à la validation) sans se compter
 * soi-même deux fois.
 */
export async function verifierReglesConges(
  employeId: string,
  dateDebut: string,
  dateFin: string,
  ignoreAbsenceId?: string,
): Promise<ViolationRegle[]> {
  const { data: emp } = await supabaseAdmin
    .from("employes")
    .select("id, etablissement_id, equipes_access")
    .eq("id", employeId)
    .maybeSingle();
  const equipes: string[] = (emp?.equipes_access as string[] | null) ?? [];
  if (!emp?.etablissement_id || equipes.length === 0) return [];

  const { data: regles } = await supabaseAdmin
    .from("conges_regles")
    .select("equipe, max_absents")
    .eq("etablissement_id", emp.etablissement_id)
    .eq("actif", true)
    .in("equipe", equipes);
  if (!regles || regles.length === 0) return [];

  // Toutes les absences chevauchantes des collègues du même établissement
  const { data: absences } = await supabaseAdmin
    .from("absences")
    .select("id, employe_id, date_debut, date_fin, statut, employes!absences_employe_id_fkey(prenom, nom, equipes_access, etablissement_id, actif)")
    .lte("date_debut", dateFin)
    .gte("date_fin", dateDebut)
    .in("statut", ["valide", "en_attente"]);

  type Autre = { prenom: string; debut: string; fin: string; equipes: string[] };
  const autres: Autre[] = [];
  for (const a of absences ?? []) {
    if (a.employe_id === employeId) continue;
    if (ignoreAbsenceId && a.id === ignoreAbsenceId) continue;
    const e = (Array.isArray(a.employes) ? a.employes[0] : a.employes) as
      { prenom?: string; nom?: string; equipes_access?: string[]; etablissement_id?: string; actif?: boolean } | null;
    if (!e || e.actif === false || e.etablissement_id !== emp.etablissement_id) continue;
    autres.push({
      prenom: `${e.prenom ?? ""} ${(e.nom ?? "").charAt(0)}.`.trim(),
      debut: a.date_debut as string,
      fin: a.date_fin as string,
      equipes: (e.equipes_access as string[] | null) ?? [],
    });
  }

  const violations: ViolationRegle[] = [];
  for (const regle of regles) {
    const jours: ViolationRegle["jours"] = [];
    // Plafond appliqué jour par jour (plage bornée à 12 mois par sécurité)
    for (let d = dateDebut, i = 0; d <= dateFin && i < 366; d = addDays(d, 1), i++) {
      const absents = autres
        .filter(o => o.equipes.includes(regle.equipe) && o.debut <= d && o.fin >= d)
        .map(o => o.prenom);
      if (absents.length + 1 > regle.max_absents) jours.push({ date: d, absents });
    }
    if (jours.length > 0) violations.push({ equipe: regle.equipe, max: regle.max_absents, jours });
  }
  return violations;
}
