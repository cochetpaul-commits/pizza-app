import { JOURS } from "./gabarit";
import type { StatsVentes } from "./useStatsVentes";

/** Une journée de la période : CA HT par service, couverts par service */
export type Jour = { date: string; jour: string; ht: number; midi: number; soir: number; emporter: number; ttc: number; cov: number; covMidi: number; covSoir: number };

export function parJour(stats: StatsVentes | null): Jour[] {
  if (!stats) return [];
  const m = new Map<string, Jour>();
  for (const d of stats.dates) m.set(d, { date: d, jour: new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long" }), ht: 0, midi: 0, soir: 0, emporter: 0, ttc: 0, cov: 0, covMidi: 0, covSoir: 0 });
  for (const s of stats.services) {
    const j = m.get(s.date); if (!j) continue;
    j.ht += s.ht; j.ttc += s.ttc; j.emporter += s.emp_ht; j.cov += s.cov;
    if (s.svc === "midi") { j.midi += s.sp_ht; j.covMidi += s.cov; } else { j.soir += s.sp_ht; j.covSoir += s.cov; }
  }
  return [...m.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Moyennes par jour de semaine (lundi → dimanche), sur les jours où il y a eu des ventes */
export type JourSemaine = { jour: string; n: number; ht: number; midi: number; soir: number; emporter: number; cov: number; covMidi: number; covSoir: number; nMidi: number; nSoir: number };
export function parJourSemaine(jours: Jour[]): JourSemaine[] {
  return JOURS.map((nom) => {
    const liste = jours.filter((j) => j.jour.toLowerCase() === nom.toLowerCase() && j.ht > 0);
    const n = liste.length || 1;
    const somme = (f: (j: Jour) => number) => liste.reduce((t, j) => t + f(j), 0) / n;
    return {
      jour: nom, n: liste.length, ht: somme((j) => j.ht), midi: somme((j) => j.midi), soir: somme((j) => j.soir), emporter: somme((j) => j.emporter),
      cov: somme((j) => j.cov), covMidi: somme((j) => j.covMidi), covSoir: somme((j) => j.covSoir),
      nMidi: liste.filter((j) => j.covMidi > 0 || j.midi > 0).length, nSoir: liste.filter((j) => j.covSoir > 0 || j.soir > 0).length,
    };
  }).filter((j) => j.n > 0);
}

/* ── Capacité par service (29/10/2026) ───────────────────────────────────
 * 67 places en salle (pergolas comprises) midi et soir ; le jardin (zone « Terrasse » de la caisse)
 * n'ouvre que s'il fait beau et ajoute 50 places. On le compte ouvert sur un service dès qu'il y a
 * une vente dans sa zone. */
export const ZONES_JARDIN = ["jardin", "terrasse"];
export type Capacites = { salle: number | null; jardin: number | null };

export const jardinOuvert = (zones: Record<string, number> | undefined) =>
  Object.entries(zones ?? {}).some(([z, ttc]) => ZONES_JARDIN.includes(z.trim().toLowerCase()) && ttc > 0);

/** Places disponibles sur un service, ou null si la capacité de salle n'est pas réglée */
export const capaciteService = (zones: Record<string, number> | undefined, cap: Capacites): number | null =>
  cap.salle == null ? null : cap.salle + (cap.jardin && jardinOuvert(zones) ? cap.jardin : 0);

export type CapaciteJour = { midi: number; soir: number; jardinMidi: boolean; jardinSoir: boolean };
/** Capacité par date, d'après les services de la période */
export function capacitesParJour(stats: StatsVentes | null, cap: Capacites): Map<string, CapaciteJour> {
  const m = new Map<string, CapaciteJour>();
  if (!stats || cap.salle == null) return m;
  for (const s of stats.services) {
    const c = capaciteService(s.z_ttc, cap) ?? 0;
    const j = m.get(s.date) ?? { midi: 0, soir: 0, jardinMidi: false, jardinSoir: false };
    if (s.svc === "midi") { j.midi = c; j.jardinMidi = jardinOuvert(s.z_ttc); } else { j.soir = c; j.jardinSoir = jardinOuvert(s.z_ttc); }
    m.set(s.date, j);
  }
  return m;
}
