import type { ComboShift } from "@/lib/combo/api";

/**
 * Heures de présence d'après le planning Combo (27/10/2026). L'API renvoie pour chaque service le
 * planifié (starts_at, ends_at, break_duration) et le réel validé par le responsable (real_starts_at,
 * real_ends_at, real_break_duration : les mêmes chiffres que le rapport « Émargements et validations »).
 * Avant validation, le réel vaut le planifié. Règles :
 * - heures planifiées : tous les services de la période ;
 * - heures travaillées : le réel des services jusqu'à `aJour` (la veille) ; un service à venir ne compte pas ;
 * - un service réel de 5 h et plus compte un repas ; les jours travaillés sont ceux jusqu'à `aJour`.
 */
export type PresenceCombo = {
  firstname: string; lastname: string; employee_number: string | null; team: string | null;
  minutesPlanifiees: number; minutesTravaillees: number; joursTravailles: Set<string>; repas: number;
};

const dureeMinutes = (debut: string, fin: string, pause: number | null | undefined) =>
  Math.max(0, (new Date(fin).getTime() - new Date(debut).getTime()) / 60000 - (Number(pause) || 0));

export const jourParis = (d: Date | string) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date(d));

export function agregerPlannings(plannings: ComboShift[], aJour: string): Map<string, PresenceCombo> {
  const out = new Map<string, PresenceCombo>();
  for (const p of plannings) {
    const cle = `${p.firstname} ${p.lastname}`.trim();
    const e = out.get(cle) ?? { firstname: p.firstname, lastname: p.lastname, employee_number: p.employee_number, team: p.team_name, minutesPlanifiees: 0, minutesTravaillees: 0, joursTravailles: new Set<string>(), repas: 0 };
    const date = p.date ?? jourParis(p.starts_at);
    e.minutesPlanifiees += dureeMinutes(p.starts_at, p.ends_at, p.break_duration);
    if (date <= aJour) {
      const reel = p.real_starts_at && p.real_ends_at ? dureeMinutes(p.real_starts_at, p.real_ends_at, p.real_break_duration ?? p.break_duration) : dureeMinutes(p.starts_at, p.ends_at, p.break_duration);
      e.minutesTravaillees += reel;
      e.joursTravailles.add(date);
      if (reel >= 300) e.repas++;
    }
    out.set(cle, e);
  }
  return out;
}

export const heures = (minutes: number) => Math.round((minutes / 60) * 100) / 100;
