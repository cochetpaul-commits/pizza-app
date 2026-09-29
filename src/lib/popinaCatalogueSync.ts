/**
 * Plan de synchronisation du catalogue Popina → popina_products.
 *
 * Popina peut regénérer les identifiants de tous ses articles (constaté le
 * 29/09/2026 : 0 identifiant commun entre l'ancien et le nouveau catalogue).
 * Un article inconnu par son identifiant est donc d'abord rapproché par son
 * nom (sans casse ni espaces) d'une fiche existante : la fiche garde son id
 * interne (liens recette / produit, doses) et reçoit le nouvel identifiant.
 *
 * Garde-fou : si la synchro devait désactiver plus de MAX_DESACTIVATION_LIEES
 * fiches reliées, elle est refusée (catalogue méconnaissable, clé API d'un
 * autre établissement, panne Popina…).
 */

export type ArticleCatalogue = {
  popina_id: string;
  name: string;
  category: string;
  sub_category: string;
  price_ttc: number;
  tva_rate: number;
  other_tariffs: string | null;
};

export type FicheExistante = {
  id: string;
  popina_id: string;
  name: string;
  active: boolean;
  /** vrai si la fiche est reliée à une recette ou un produit */
  liee: boolean;
};

export type PlanSync = {
  /** fiches existantes à mettre à jour (même identifiant Popina, ou rapprochées par le nom) */
  misesAJour: { id: string; valeurs: ArticleCatalogue & { active: true } }[];
  /** articles nouveaux, sans fiche */
  insertions: (ArticleCatalogue & { active: true })[];
  /** ids internes des fiches à désactiver */
  desactivations: string[];
  /** nombre d'articles rapprochés par le nom (identifiant Popina changé) */
  rapprochesParNom: number;
  /** nombre de fiches reliées qui seraient désactivées */
  lieesDesactivees: number;
  /** message si la synchro est refusée */
  refus: string | null;
};

export const MAX_DESACTIVATION_LIEES = 10;

export function cleNom(nom: string): string {
  return (nom ?? "").trim().toLowerCase();
}

export function planifierSync(catalogue: ArticleCatalogue[], existantes: FicheExistante[]): PlanSync {
  const parPopinaId = new Map(existantes.map((f) => [f.popina_id, f]));
  const parNom = new Map<string, FicheExistante[]>();
  for (const f of existantes) {
    const k = cleNom(f.name);
    if (!k) continue;
    const arr = parNom.get(k) ?? [];
    arr.push(f);
    parNom.set(k, arr);
  }
  // Les fiches reliées d'abord, puis les actives : ce sont celles à préserver
  for (const arr of parNom.values()) {
    arr.sort((a, b) => Number(b.liee) - Number(a.liee) || Number(b.active) - Number(a.active));
  }

  const idsConnus = new Set(existantes.filter((f) => catalogue.some((a) => a.popina_id === f.popina_id)).map((f) => f.id));
  const utilisees = new Set<string>(idsConnus);
  const misesAJour: PlanSync["misesAJour"] = [];
  const insertions: PlanSync["insertions"] = [];
  let rapprochesParNom = 0;

  for (const article of catalogue) {
    const valeurs = { ...article, active: true as const };
    const parId = parPopinaId.get(article.popina_id);
    if (parId) {
      misesAJour.push({ id: parId.id, valeurs });
      continue;
    }
    const candidate = (parNom.get(cleNom(article.name)) ?? []).find((f) => !utilisees.has(f.id));
    if (candidate) {
      utilisees.add(candidate.id);
      rapprochesParNom++;
      misesAJour.push({ id: candidate.id, valeurs });
      continue;
    }
    insertions.push(valeurs);
  }

  const desactivations = existantes.filter((f) => f.active && !utilisees.has(f.id)).map((f) => f.id);
  const lieesDesactivees = existantes.filter((f) => f.active && f.liee && !utilisees.has(f.id)).length;

  const refus =
    lieesDesactivees > MAX_DESACTIVATION_LIEES
      ? `Synchro refusée : ${lieesDesactivees} fiches reliées à une recette ou un produit disparaîtraient du catalogue Popina (${catalogue.length} articles reçus). Vérifie la clé API et le catalogue Popina avant de relancer.`
      : null;

  return { misesAJour, insertions, desactivations, rapprochesParNom, lieesDesactivees, refus };
}
