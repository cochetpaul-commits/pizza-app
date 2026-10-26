/**
 * Répartition des pourboires de l'équipe, Bello Mio (règles de Paul, fichier « Répartition des
 * pourboires » et réponses du 26/10/2026) :
 * - le pot du mois = pourboires carte (ticket Z du TPE, Conecs compris) + pourboires espèces (cagnotte
 *   vidée et comptée le vendredi soir à la clôture), du 1er au dernier jour du mois ;
 * - part = pot ÷ Σ jours de présence de l'équipe × jours de présence de la personne ;
 * - un jour travaillé compte 1 ; un seul service dans la journée compte 0,5 (pour tout le monde, extras
 *   compris) : deux services, ou un seul service de 7 h ou plus, font la journée ;
 * - congés payés, maladie, absence injustifiée : 0. Formation, visite médicale, RTT, récupération, férié
 *   travaillé : présence ;
 * - les ajustements par personne et par mois (acompte à déduire, report du mois précédent, « ne pas
 *   compter ») s'ajoutent à la part.
 * Logique pure : les présences viennent de Combo, les absences et les ajustements de la base.
 */

export type Service = { employeId: string; date: string; minutes: number };
export type Absence = { employeId: string; debut: string; fin: string; type: string };
export type Ajustement = { employeId: string; montant: number; motif: string };

/** Types d'absence qui ne retirent pas la présence (le planning fait foi) */
export const ABSENCES_COMPTEES = new Set(["formation", "visite_medicale", "rtt", "recuperation", "recup", "ferie"]);

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Valeur d'une journée : 1 pour deux services ou un service de 7 h et plus, sinon 0,5 */
export function valeurJour(services: number, minutes: number): number {
  if (services <= 0) return 0;
  return services >= 2 || minutes >= 7 * 60 ? 1 : 0.5;
}

export type PresenceEmploye = { jours: number; detail: Record<string, number> };

/** Jours comptés par personne, d'après les services du planning et les absences validées */
export function compterPresences(services: Service[], absences: Absence[] = []): Map<string, PresenceEmploye> {
  const parJour = new Map<string, Map<string, { n: number; minutes: number }>>();
  for (const s of services) {
    const e = parJour.get(s.employeId) ?? new Map();
    const j = e.get(s.date) ?? { n: 0, minutes: 0 };
    j.n++; j.minutes += Math.max(0, s.minutes);
    e.set(s.date, j); parJour.set(s.employeId, e);
  }
  const absent = (employeId: string, date: string) =>
    absences.some((a) => a.employeId === employeId && !ABSENCES_COMPTEES.has(a.type.toLowerCase()) && a.debut <= date && date <= a.fin);
  const out = new Map<string, PresenceEmploye>();
  for (const [employeId, jours] of parJour) {
    const detail: Record<string, number> = {};
    let total = 0;
    for (const [date, j] of [...jours.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const v = absent(employeId, date) ? 0 : valeurJour(j.n, j.minutes);
      detail[date] = v; total += v;
    }
    out.set(employeId, { jours: total, detail });
  }
  return out;
}

export type Part = { employeId: string; jours: number; part: number; ajustements: Ajustement[]; net: number };
export type Repartition = { pot: number; totalJours: number; valeurJour: number; parts: Part[] };

/** Le pot réparti au prorata des jours comptés, puis les ajustements */
export function repartir(pot: number, presences: Map<string, PresenceEmploye>, ajustements: Ajustement[] = []): Repartition {
  const totalJours = [...presences.values()].reduce((t, p) => t + p.jours, 0);
  const valeur = totalJours > 0 ? pot / totalJours : 0;
  const ids = new Set([...presences.keys(), ...ajustements.map((a) => a.employeId)]);
  const parts: Part[] = [...ids].map((employeId) => {
    const jours = presences.get(employeId)?.jours ?? 0;
    const part = r2(jours * valeur);
    const mes = ajustements.filter((a) => a.employeId === employeId);
    return { employeId, jours, part, ajustements: mes, net: r2(part + mes.reduce((t, a) => t + a.montant, 0)) };
  }).sort((a, b) => b.jours - a.jours || a.employeId.localeCompare(b.employeId));
  return { pot: r2(pot), totalJours, valeurJour: r2(valeur), parts };
}
