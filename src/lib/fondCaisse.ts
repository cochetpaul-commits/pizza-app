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

/**
 * Fond idéal du lundi soir (Paul, 26/10/2026), 100 € : on démarre la semaine avec beaucoup de monnaie
 * (60 € de pièces), les autres soirs gardent le fond idéal ci-dessus.
 */
export const FOND_IDEAL_LUNDI: Record<number, number> = {
  2000: 1, 1000: 2, 500: 2, 200: 10, 100: 20, 50: 14, 20: 10, 10: 8, 5: 3, 2: 2, 1: 1,
};

/** Lundi (jour de service AAAA-MM-JJ) : fond du lundi ; sinon le fond ordinaire */
export const idealPourJour = (jour: string | null | undefined): Record<number, number> =>
  jour && new Date(`${jour}T12:00:00Z`).getUTCDay() === 1 ? FOND_IDEAL_LUNDI : FOND_IDEAL;

export type Comptage = Record<string, number>;

/** Montant du fond à laisser chaque soir (€) : le total du fond idéal */
export const FOND_CIBLE = Object.entries(FOND_IDEAL).reduce((t, [k, n]) => t + Number(k) * n, 0) / 100;

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
  /** Enveloppe de la banque, coupure par coupure (quand les espèces Popina sont connues) */
  enveloppe?: Comptage | null;
  /** Trop perçu du tiroir qui part dans la cagnotte des pourboires, coupure par coupure */
  cagnotte?: Comptage | null;
  /** Il manque ce montant (centimes) à l'enveloppe : à compléter avec la cagnotte */
  enveloppeManque?: number;
  /** Le trop perçu ne peut pas être isolé avec les coupures du tiroir (il faut casser un billet) */
  cagnotteImpossible?: boolean;
};

const lire = (c: Comptage, k: number) => Math.max(0, Math.floor(Number(c[String(k)]) || 0));

/**
 * La meilleure combinaison exacte de `cible` avec les coupures du tiroir (null si impossible).
 * Chaque coupure prise dans la limite du fond idéal vaut beaucoup ; au-delà, la petite monnaie
 * vaut plus que les gros billets. Sac à dos par coupure (14 coupures × montant en centimes).
 * Vécu 12/10 : le remplissage pas à pas ratait le fond au centime (50 c manquants) et la reprise
 * oubliait le billet de 20 € du fond idéal.
 */
function meilleureCombinaison(dispo: Comptage, cible: number, ideal: Record<number, number>, preferer: "petites" | "grosses" = "petites"): Comptage | null {
  if (cible <= 0) return {};
  const ordre = [...COUPURES].reverse(); // petite monnaie d'abord
  const IMPOSSIBLE = -Infinity;
  let score = new Float64Array(cible + 1).fill(IMPOSSIBLE);
  score[0] = 0;
  const choix: Int16Array[] = [];
  ordre.forEach((k, rang) => {
    const n = Math.min(lire(dispo, k), Math.floor(cible / k));
    const q = ideal[k] ?? 0;
    const poids = preferer === "petites" ? ordre.length - rang : rang + 1;
    const valeur = (j: number) => Math.min(j, q) * 1e6 + Math.max(0, j - q) * poids;
    const suivant = new Float64Array(cible + 1).fill(IMPOSSIBLE);
    const pris = new Int16Array(cible + 1);
    for (let m = 0; m <= cible; m++) {
      for (let j = 0; j <= n && j * k <= m; j++) {
        const avant = score[m - j * k];
        if (avant === IMPOSSIBLE) continue;
        const v = avant + valeur(j);
        if (v > suivant[m]) { suivant[m] = v; pris[m] = j; }
      }
    }
    score = suivant;
    choix.push(pris);
  });
  if (score[cible] === IMPOSSIBLE) return null;
  const out: Comptage = {};
  let m = cible;
  for (let i = ordre.length - 1; i >= 0; i--) {
    const j = choix[i][m];
    if (j > 0) out[String(ordre[i])] = j;
    m -= j * ordre[i];
  }
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
    const meilleure = meilleureCombinaison(comptage, fond, ideal);
    if (meilleure) { laisser = meilleure; total = fond; }
    else {
      // Pas de combinaison au centime : au plus près, fond idéal puis petite monnaie
      for (const k of [...COUPURES].reverse()) prendre(k, Math.min(lire(comptage, k), ideal[k] ?? 0, Math.floor((fond - total) / k)));
      for (const k of [...COUPURES].reverse()) prendre(k, Math.min(lire(comptage, k) - (laisser[String(k)] ?? 0), Math.floor((fond - total) / k)));
    }
  }

  const sortir: Comptage = {};
  for (const k of COUPURES) { const n = lire(comptage, k) - (laisser[String(k)] ?? 0); if (n > 0) sortir[String(k)] = n; }
  const manqueIdeal: Comptage = {};
  for (const k of COUPURES) { const n = (ideal[k] ?? 0) - lire(comptage, k); if (n > 0) manqueIdeal[String(k)] = n; }
  return { compte, fond, laisser, totalLaisse: total, sortir, totalSorti: compte - total, incomplet: Math.max(0, fond - total), manqueIdeal };
}

export type EchangeCagnotte = {
  /** Pièces de la cagnotte à mettre dans le tiroir */
  pieces: Comptage;
  /** Billets du tiroir à donner à la cagnotte, même montant */
  billets: Comptage;
  /** Centimes */
  montant: number;
};

/**
 * Faire la monnaie avec la cagnotte des pourboires (Paul, 26/10/2026) : les pièces de la cagnotte
 * passent dans le tiroir contre des billets, par tranches rondes (5, 10, 20 €), pour que les pourboires
 * sortent en billets et que la monnaie serve à rendre. On prend d'abord les pièces qui manquent au fond
 * idéal, dans la limite de ce que la cagnotte a en pièces et le tiroir en billets. Null si rien à échanger.
 */
export function echangerCagnotte(cagnotte: Comptage, tiroir: Comptage, ideal: Record<number, number> = FOND_IDEAL): EchangeCagnotte | null {
  const pieces: Comptage = {};
  for (const k of COUPURES) if (!estBillet(k) && lire(cagnotte, k) > 0) pieces[String(k)] = lire(cagnotte, k);
  const billetsTiroir: Comptage = {};
  for (const k of COUPURES) if (estBillet(k) && lire(tiroir, k) > 0) billetsTiroir[String(k)] = lire(tiroir, k);
  const totalPieces = totalComptage(pieces);
  const totalBillets = totalComptage(billetsTiroir);
  // Ce qui manque au fond idéal, en pièces : on vise au moins ça, arrondi aux 5 € supérieurs
  const manque: Comptage = {};
  for (const k of COUPURES) { const n = (ideal[k] ?? 0) - lire(tiroir, k); if (n > 0 && !estBillet(k)) manque[String(k)] = n; }
  const plafond = Math.min(totalPieces, totalBillets);
  let cible = Math.min(plafond - (plafond % 500), Math.ceil(totalComptage(manque) / 500) * 500);
  // Rien ne manque au fond : on échange quand même ce qu'on peut, la cagnotte veut des billets
  if (cible <= 0) cible = plafond - (plafond % 500);
  for (let m = cible; m >= 500; m -= 500) {
    const piecesPrises = meilleureCombinaison(pieces, m, manque, "grosses");
    const billetsPris = meilleureCombinaison(billetsTiroir, m, {}, "grosses");
    if (piecesPrises && billetsPris) return { pieces: piecesPrises, billets: billetsPris, montant: m };
  }
  return null;
}

/** Comptage après un échange : tiroir + pièces − billets */
export function appliquerEchange(tiroir: Comptage, e: EchangeCagnotte): Comptage {
  const out: Comptage = {};
  for (const k of COUPURES) { const n = lire(tiroir, k) + lire(e.pieces, k) - lire(e.billets, k); if (n > 0) out[String(k)] = n; }
  return out;
}

const soustraire = (a: Comptage, b: Comptage): Comptage => {
  const out: Comptage = {};
  for (const k of COUPURES) { const n = lire(a, k) - lire(b, k); if (n > 0) out[String(k)] = n; }
  return out;
};

/**
 * Les trois tas du soir (vécu 26/10/2026 : 205,50 € comptés, 97 € d'espèces Popina, 8,50 € de trop perçu ;
 * le fond fait d'abord laissait 105,50 € en deux billets de 50 : impossible d'en tirer l'enveloppe de 97 €).
 * 1. la cagnotte reçoit le trop perçu, en petite monnaie que le fond idéal n'utilise pas ;
 * 2. le fond (100 €) est composé avec le reste, fond idéal d'abord ;
 * 3. l'enveloppe de la banque est ce qui reste : les espèces Popina, en billets autant que possible.
 * Quand le tiroir manque, l'enveloppe est complétée avec la cagnotte (enveloppeManque).
 */
export function composerSoir(comptage: Comptage, fondEuros: number, enveloppeEuros: number | null | undefined, ideal: Record<number, number> = FOND_IDEAL): CompositionFond {
  if (enveloppeEuros == null) return composerFond(comptage, fondEuros, ideal);
  const fond = Math.round(fondEuros * 100);
  const env = Math.round(enveloppeEuros * 100);
  const compte = totalComptage(comptage);
  const ecart = compte - fond - env;
  if (ecart <= 0) {
    const base = composerFond(comptage, fondEuros, ideal);
    return { ...base, enveloppe: base.sortir, cagnotte: null, enveloppeManque: Math.max(0, env - base.totalSorti) };
  }
  // Trop perçu : d'abord dans ce qui dépasse le fond idéal, petite monnaie en tête ; sinon dans tout le tiroir
  const surplus: Comptage = {};
  for (const k of COUPURES) { const n = lire(comptage, k) - (ideal[k] ?? 0); if (n > 0) surplus[String(k)] = n; }
  const cagnotte = meilleureCombinaison(surplus, ecart, {}, "petites") ?? meilleureCombinaison(comptage, ecart, {}, "petites");
  if (!cagnotte) {
    const base = composerFond(comptage, fondEuros, ideal);
    return { ...base, enveloppe: null, cagnotte: null, cagnotteImpossible: true };
  }
  const reste = soustraire(comptage, cagnotte);
  const base = composerFond(reste, fondEuros, ideal);
  // Le fond n'est plus faisable au centime sans ces pièces : on laisse le trop perçu dans le tiroir, l'équipe tranche
  if (base.incomplet > 0) {
    const brut = composerFond(comptage, fondEuros, ideal);
    return { ...brut, enveloppe: null, cagnotte: null, cagnotteImpossible: true };
  }
  const manqueIdeal: Comptage = {};
  for (const k of COUPURES) { const n = (ideal[k] ?? 0) - lire(comptage, k); if (n > 0) manqueIdeal[String(k)] = n; }
  return { ...base, compte, sortir: soustraire(comptage, base.laisser), totalSorti: compte - base.totalLaisse, manqueIdeal, enveloppe: base.sortir, cagnotte, enveloppeManque: 0 };
}

/** « 2 × 20 €, 3 × 1 € » */
export function listerCoupures(c: Comptage): string {
  return COUPURES.filter((k) => lire(c, k) > 0).map((k) => `${lire(c, k)} × ${libelleCoupure(k)}`).join(", ");
}

/** Somme de plusieurs comptages (bordereau de banque de la semaine : les enveloppes des soirs) */
export function additionner(comptages: (Comptage | null | undefined)[]): Comptage {
  const out: Comptage = {};
  for (const c of comptages) for (const k of COUPURES) { const n = lire(c ?? {}, k); if (n) out[String(k)] = (out[String(k)] ?? 0) + n; }
  return out;
}
