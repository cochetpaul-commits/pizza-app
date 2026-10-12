/**
 * Comptage du tiroir et fond de caisse, Bello Mio (13/10/2026). Le soir, l'équipe compte le tiroir
 * coupure par coupure ; l'app donne le total, puis ce qu'il faut laisser pour le fond du lendemain
 * et ce qui part dans l'enveloppe de la banque (déposée la semaine suivante).
 *
 * Règle de Paul : on vise d'abord le fond idéal (celui du début de semaine), puis on complète avec
 * la petite monnaie en priorité, car c'est elle qui sert à rendre. Tout est calculé en centimes.
 */

/** Coupures en centimes, de la plus grande à la plus petite */
export const COUPURES = [20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50, 20, 10, 5, 2, 1] as const;
export const estBillet = (c: number) => c >= 500;

/** Fond idéal de Paul (13/10/2026), 100 € : 40 € de pièces, 1 × 20 €, 3 × 10 €, 2 × 5 € */
export const FOND_IDEAL: Record<number, number> = {
  2000: 1, 1000: 3, 500: 2, 200: 10, 100: 13, 50: 10, 20: 5, 10: 8, 5: 1, 2: 5, 1: 5,
};

export type Comptage = Record<string, number>;

export const libelleCoupure = (c: number) => (c >= 100 ? `${c / 100} €` : `${c} c`);

export function totalComptage(c: Comptage | null | undefined): number {
  if (!c) return 0;
  let t = 0;
  for (const k of COUPURES) t += k * Math.max(0, Math.floor(Number(c[String(k)]) || 0));
  return t;
}

export const comptageSaisi = (c: Comptage | null | undefined) => !!c && COUPURES.some((k) => (Number(c[String(k)]) || 0) > 0);

export type CompositionFond = {
  /** Tout en centimes */
  compte: number;
  fond: number;
  laisser: Comptage;
  totalLaisse: number;
  sortir: Comptage;
  /** Ce qui part dans l'enveloppe de la banque */
  totalSorti: number;
  /** Le fond n'a pas pu être fait au centime près avec les coupures du tiroir */
  incomplet: number;
  /** Ce qui manque au tiroir pour refaire le fond idéal (à prévoir en change) */
  manqueIdeal: Comptage;
};

const lire = (c: Comptage, k: number) => Math.max(0, Math.floor(Number(c[String(k)]) || 0));

/** Une combinaison exacte de `cible` avec les coupures disponibles, petite monnaie d'abord (null si impossible) */
function combinaisonExacte(dispo: Comptage, cible: number): Comptage | null {
  if (cible <= 0) return {};
  const de = new Array<number>(cible + 1).fill(0);   // coupure utilisée pour atteindre ce montant
  const atteint = new Array<boolean>(cible + 1).fill(false);
  atteint[0] = true;
  for (const k of [...COUPURES].reverse()) {
    const n = lire(dispo, k);
    if (!n) continue;
    // Somme bornée classique : nombre de pièces de k utilisées pour atteindre m (0 si déjà atteint sans elles)
    const utilise = new Array<number>(cible + 1).fill(0);
    for (let m = k; m <= cible; m++) {
      if (!atteint[m] && atteint[m - k] && utilise[m - k] < n) {
        atteint[m] = true; de[m] = k; utilise[m] = utilise[m - k] + 1;
      }
    }
  }
  if (!atteint[cible]) return null;
  const out: Comptage = {};
  for (let m = cible; m > 0; m -= de[m]) out[String(de[m])] = (out[String(de[m])] ?? 0) + 1;
  return out;
}

export function composerFond(comptage: Comptage, fondEuros: number, ideal: Record<number, number> = FOND_IDEAL): CompositionFond {
  const fond = Math.round(fondEuros * 100);
  const compte = totalComptage(comptage);
  let laisser: Comptage = {};
  let total = 0;
  const prendre = (k: number, n: number) => { if (n > 0) { laisser[String(k)] = (laisser[String(k)] ?? 0) + n; total += n * k; } };

  if (compte <= fond) {
    for (const k of COUPURES) prendre(k, lire(comptage, k));
  } else {
    // 1. Le fond idéal, petite monnaie d'abord
    for (const k of [...COUPURES].reverse()) prendre(k, Math.min(lire(comptage, k), ideal[k] ?? 0, Math.floor((fond - total) / k)));
    // 2. Compléter avec le reste, petite monnaie d'abord
    for (const k of [...COUPURES].reverse()) prendre(k, Math.min(lire(comptage, k) - (laisser[String(k)] ?? 0), Math.floor((fond - total) / k)));
    // 3. Pas au centime près (ex. il reste 1 € à faire et plus que des pièces de 2 €) : combinaison exacte
    if (total !== fond) {
      const exacte = combinaisonExacte(comptage, fond);
      if (exacte) { laisser = exacte; total = fond; }
    }
  }

  const sortir: Comptage = {};
  for (const k of COUPURES) { const n = lire(comptage, k) - (laisser[String(k)] ?? 0); if (n > 0) sortir[String(k)] = n; }
  const manqueIdeal: Comptage = {};
  for (const k of COUPURES) { const n = (ideal[k] ?? 0) - lire(comptage, k); if (n > 0) manqueIdeal[String(k)] = n; }
  return { compte, fond, laisser, totalLaisse: total, sortir, totalSorti: compte - total, incomplet: Math.max(0, fond - total), manqueIdeal };
}

/** « 2 × 20 €, 3 × 1 € » */
export function listerCoupures(c: Comptage): string {
  return COUPURES.filter((k) => lire(c, k) > 0).map((k) => `${lire(c, k)} × ${libelleCoupure(k)}`).join(", ");
}
