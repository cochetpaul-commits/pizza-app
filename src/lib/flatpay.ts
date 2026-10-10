/**
 * Exports Flatpay (10/10/2026). Flatpay n'a pas d'API : l'équipe exporte la journée depuis
 * l'app Flatpay de l'iPad (ou le portail) et la dépose dans l'écran de clôture.
 *
 * Deux exports, lus tels quels :
 * - « Rapport de transactions » (cartes) : Date, Type, Type de carte, Devise, Montant, Statut,
 *   Nom du terminal. Heures en heure de Paris. Montant pourboire compris. Ligne « Total » à ignorer.
 * - « Rapport des transactions en titre-restaurant » (Conecs) : Date, Type, Type de carte, Émetteur,
 *   Terminal, Montant, Devise. Heures en UTC. Pas de colonne Statut.
 * Aucun numéro de carte n'est lu ni stocké.
 */

export type ModeTpe = "cb" | "amex" | "conecs";
export type SourceFlatpay = "carte" | "titre_restaurant";

export type TransactionFlatpay = {
  /** Instant réel, ISO UTC */
  horodatage: string;
  /** Jour de service (date de Paris, la journée court jusqu'à 4 h du matin) */
  jour: string;
  mode: ModeTpe;
  typeCarte: string;
  montant: number;
  statut: string;
  operation: string;
  terminal: string | null;
  emetteur: string | null;
  source: SourceFlatpay;
};

type Ligne = Record<string, unknown>;

const PARIS = "Europe/Paris";

/** Décalage de Paris (minutes) à un instant donné */
function decalageParis(instant: Date): number {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: PARIS, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(instant);
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value);
  const vu = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
  return Math.round((vu - instant.getTime()) / 60000);
}

/** Heure murale de Paris (composants) → instant UTC, changement d'heure compris */
export function parisVersUtc(a: number, mo: number, j: number, h: number, mi: number, s = 0): Date {
  const naif = Date.UTC(a, mo - 1, j, h, mi, s);
  const d1 = decalageParis(new Date(naif));
  const d2 = decalageParis(new Date(naif - d1 * 60000));
  return new Date(naif - d2 * 60000);
}

/** Jour de service à Paris : une transaction de 1 h du matin appartient à la veille */
export function jourService(instant: Date): string {
  const decale = new Date(instant.getTime() - 4 * 3600 * 1000);
  return new Intl.DateTimeFormat("sv-SE", { timeZone: PARIS }).format(decale);
}

export const heureParis = (iso: string) => new Intl.DateTimeFormat("fr-FR", { timeZone: PARIS, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/**
 * Composants « muraux » d'une date de cellule. À lire de préférence en valeur brute (numéro de série
 * Excel, indépendant du fuseau de l'appareil) : un objet Date construit par la librairie dépend du
 * fuseau du navigateur (vécu 10/10 : Conecs affiché 2 h trop tôt sur un appareil réglé à Paris).
 */
function composants(v: unknown): [number, number, number, number, number, number] | null {
  if (typeof v === "number" && Number.isFinite(v) && v > 20000) {
    const d = new Date(Math.round((v - 25569) * 86400) * 1000);
    return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()];
  }
  if (v instanceof Date && !Number.isNaN(v.getTime())) return [v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate(), v.getUTCHours(), v.getUTCMinutes(), v.getUTCSeconds()];
  if (typeof v === "string") {
    const m = v.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (m) { const a = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]); return [a, Number(m[1]), Number(m[2]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0)]; }
    const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (iso) return [Number(iso[1]), Number(iso[2]), Number(iso[3]), Number(iso[4]), Number(iso[5]), Number(iso[6] ?? 0)];
  }
  return null;
}

function montant(v: unknown): number | null {
  if (typeof v === "number") return Math.round(v * 100) / 100;
  if (typeof v === "string") {
    let t = v.replace(/[\s  €]/g, "");
    if (/,\d{2}$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
    else t = t.replace(/,/g, "");
    const n = Number(t);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
  }
  return null;
}

const champ = (l: Ligne, ...noms: string[]) => { for (const n of noms) if (n in l) return l[n]; return undefined; };

/** Reconnaît l'export et le convertit en transactions. Les lignes « Total » et illisibles sont ignorées. */
export function lireExportFlatpay(lignes: Ligne[]): { source: SourceFlatpay | null; transactions: TransactionFlatpay[]; ignorees: number } {
  if (!lignes.length) return { source: null, transactions: [], ignorees: 0 };
  const cles = Object.keys(lignes[0]);
  const source: SourceFlatpay | null = cles.includes("Émetteur") || cles.includes("Emetteur") ? "titre_restaurant"
    : cles.includes("Nom du terminal") || cles.includes("Statut") ? "carte" : null;
  if (!source) return { source: null, transactions: [], ignorees: lignes.length };
  const out: TransactionFlatpay[] = [];
  let ignorees = 0;
  for (const l of lignes) {
    const c = composants(champ(l, "Date"));
    const m = montant(champ(l, "Montant"));
    if (!c || m == null) { ignorees++; continue; }
    const instant = source === "titre_restaurant"
      ? new Date(Date.UTC(c[0], c[1] - 1, c[2], c[3], c[4], c[5]))   // export en UTC
      : parisVersUtc(...c);                                            // export en heure de Paris
    const typeCarte = String(champ(l, "Type de carte") ?? "").trim().toUpperCase();
    const mode: ModeTpe = source === "titre_restaurant" ? "conecs" : /AMERICAN|AMEX/.test(typeCarte) ? "amex" : "cb";
    out.push({
      horodatage: instant.toISOString(), jour: jourService(instant), mode, typeCarte, montant: m,
      statut: String(champ(l, "Statut") ?? "Terminé").trim(),
      operation: String(champ(l, "Type") ?? "").trim(),
      terminal: (champ(l, "Nom du terminal", "Terminal") as string | undefined)?.toString().trim() || null,
      emetteur: (champ(l, "Émetteur", "Emetteur") as string | undefined)?.toString().trim() || null,
      source,
    });
  }
  return { source, transactions: out, ignorees };
}

export const estValide = (t: Pick<TransactionFlatpay, "statut" | "operation">) =>
  !/refus|échou|echou|annul|declin|fail/i.test(t.statut) && !/rembours|refund/i.test(t.operation);
export const estRefusee = (t: Pick<TransactionFlatpay, "statut">) => /refus|declin|échou|echou|fail/i.test(t.statut);

/** Clé de dédoublonnage d'une transaction (un même export peut être déposé deux fois) */
export const cleTransaction = (t: TransactionFlatpay) => `${t.source}|${t.horodatage}|${t.typeCarte}|${t.montant.toFixed(2)}|${t.terminal ?? ""}`;

const POURCENTAGES = [0, 3, 5, 10, 15];

/** Le montant TPE s'explique-t-il par un paiement Popina de `x` plus un pourboire usuel ? */
export function expliquePar(x: number, tpe: number): number | null {
  for (const p of POURCENTAGES) if (Math.abs(tpe - Math.round(x * (1 + p / 100) * 100) / 100) <= 0.011) return p;
  return null;
}

export type AideCloture = {
  totalExport: { cb: number; amex: number; conecs: number; pourboiresInclus: boolean };
  refusees: TransactionFlatpay[];
  conecs: TransactionFlatpay[];
  amex: TransactionFlatpay[];
  /** Transactions dont le montant explique l'écart carte (pourboire usuel compris) */
  candidates: { t: TransactionFlatpay; pourboire: number }[];
  /** À défaut : transactions entre l'écart et l'écart + 16 % */
  proches: TransactionFlatpay[];
};

/** Ce que l'export Flatpay du jour permet de dire, sans les tickets Popina (invisibles avant le Z) */
export function aideCloture(transactions: TransactionFlatpay[], residu: number): AideCloture {
  const valides = transactions.filter(estValide);
  const somme = (m: ModeTpe) => Math.round(valides.filter((t) => t.mode === m).reduce((s, t) => s + t.montant, 0) * 100) / 100;
  const cartes = valides.filter((t) => t.mode === "cb" || t.mode === "amex");
  const x = Math.abs(residu);
  const candidates = x >= 0.01
    ? cartes.map((t) => ({ t, pourboire: expliquePar(x, t.montant) })).filter((c): c is { t: TransactionFlatpay; pourboire: number } => c.pourboire != null)
    : [];
  const proches = x >= 0.01 && candidates.length === 0 ? cartes.filter((t) => t.montant >= x - 0.011 && t.montant <= x * 1.16 + 0.011) : [];
  const parHeure = (a: TransactionFlatpay, b: TransactionFlatpay) => a.horodatage.localeCompare(b.horodatage);
  return {
    totalExport: { cb: somme("cb"), amex: somme("amex"), conecs: somme("conecs"), pourboiresInclus: true },
    refusees: transactions.filter(estRefusee).sort(parHeure),
    conecs: valides.filter((t) => t.mode === "conecs").sort(parHeure),
    amex: valides.filter((t) => t.mode === "amex").sort(parHeure),
    candidates: candidates.sort((a, b) => a.pourboire - b.pourboire || parHeure(a.t, b.t)),
    proches: proches.sort(parHeure),
  };
}
