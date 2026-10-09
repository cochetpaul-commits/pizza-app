import type { DateRange } from "@/components/ui/DateRangePicker";

/**
 * Pages Analyse (10/10/2026) : une page par question du quotidien, même gabarit partout
 * (en-tête + période, tuiles avec variation, un graphique, un tableau). Fonctions communes.
 */
export const BORD = "#ddd6c8";
export const MUTED = "#6f6a61";
export const FAIBLE = "#a39d92";
export const TERRACOTTA = "#D4775A";
export const VERT = "#4a6741";
export const BLEU = "#2563EB";
export const AMBRE = "#b7791f";
export const ROUGE = "#b4443a";
export const OSWALD = "var(--font-oswald), Oswald, sans-serif";
/** Couleurs des services, identiques sur toutes les pages Analyse */
export const COULEUR_MIDI = "#e0a83c";
export const COULEUR_SOIR = "#4a5a8a";
export const COULEUR_EMPORTER = "#5e8278";

export const euros = (n: number, decimales = 0) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: decimales, maximumFractionDigits: decimales })} €`;
export const nombre = (n: number, decimales = 0) => n.toLocaleString("fr-FR", { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
export const pct = (n: number, decimales = 0) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: decimales, maximumFractionDigits: decimales })} %`;

/** Variation relative (−1 … +∞) ou null si la base est nulle */
export function variation(actuel: number, precedent: number | null | undefined): number | null {
  if (precedent == null || precedent === 0) return null;
  return (actuel - precedent) / precedent;
}
export const texteVariation = (v: number | null) => (v == null ? null : `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} %`);

const iso = (d: Date) => d.toISOString().slice(0, 10);
export function nbJours(r: DateRange): number {
  return Math.round((new Date(r.to + "T12:00:00").getTime() - new Date(r.from + "T12:00:00").getTime()) / 86400000) + 1;
}
/** Période précédente de même longueur, juste avant */
export function periodePrecedente(r: DateRange): DateRange {
  const n = nbJours(r);
  const to = new Date(r.from + "T12:00:00"); to.setDate(to.getDate() - 1);
  const from = new Date(to); from.setDate(from.getDate() - n + 1);
  return { from: iso(from), to: iso(to) };
}
/** Raccourcis de période : les N derniers jours jusqu'à hier (aujourd'hui n'est pas fini), ou le mois en cours */
export function derniersJours(n: number): DateRange {
  const to = new Date(); to.setDate(to.getDate() - 1);
  const from = new Date(to); from.setDate(from.getDate() - n + 1);
  return { from: iso(from), to: iso(to) };
}
export function moisEnCours(): DateRange {
  const d = new Date();
  return { from: iso(new Date(d.getFullYear(), d.getMonth(), 1, 12)), to: iso(d) };
}
export const JOURS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
export const jourCourt = (dateIso: string) => new Date(dateIso + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" }).replace(".", "");
export const dateCourte = (dateIso: string) => new Date(dateIso + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
export const libellePeriode = (r: DateRange) => `${dateCourte(r.from)} – ${dateCourte(r.to)}`;
/** Les N derniers mois entiers plus le mois en cours */
export function derniersMois(n: number): DateRange {
  const d = new Date();
  return { from: iso(new Date(d.getFullYear(), d.getMonth() - n + 1, 1, 12)), to: iso(d) };
}
export const libelleMois = (m: string) => new Date(m + "-01T12:00:00").toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });
export const libelleMoisLong = (m: string) => new Date(m + "-01T12:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
