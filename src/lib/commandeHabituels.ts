/**
 * « Habituels » d'un établissement chez un fournisseur en commande simplifiée :
 * produits achetés au moins une fois sur 90 jours, d'après les factures et les commandes envoyées.
 *
 * Les factures Maël n'ont pas d'unité fiable (une ligne « 2 pc » à 24,70 € = 2 colis de 20 burratas,
 * les légumes sont au poids réel) : la quantité est donc convertie en unités de commande par le MONTANT,
 * montant facturé ÷ prix actuel d'une unité de commande, puis arrondie au pas de commande.
 * (vérifié le 27/09 sur blanc d'œuf, taglio 2,5 kg, œufs × 90, burrata, crème, légumes)
 */

export type AchatBrut = {
  ingredient_id: string;
  date: string; // AAAA-MM-JJ
  /** Quantité déjà en unités de commande (commandes de l'appli) */
  quantite?: number;
  mode?: "uc" | "element";
  /** Montant HT facturé (factures) : converti par le prix d'une unité de commande */
  montant?: number;
};

export type RegleArticle = {
  /** Prix actuel d'une unité de commande (colis, pièce…) */
  prix_uc: number | null;
  /** Nombre d'éléments par unité de commande */
  contenu_nb: number;
  /** Commande à l'élément permise (ex. crème à la bouteille) */
  element_permis: boolean;
  /** Vendu au poids ou au volume (unite_commande kg ou litre) : pas de 0,5 */
  au_poids: boolean;
};

export type Habituel = { nb_achats: number; quantite: number; mode: "uc" | "element"; derniere: string };

/** Un produit est « habituel » à partir de 3 jours d'achat distincts sur 90 jours (factures et commandes envoyées) */
export const SEUIL_HABITUEL = 3;

const TOLERANCE = 0.15;

/** Convertit un achat en quantité de commande arrondie, dans l'unité la plus naturelle */
export function quantiteCommande(a: AchatBrut, r: RegleArticle): { quantite: number; mode: "uc" | "element" } | null {
  if (a.quantite != null && a.mode) return a.quantite > 0 ? { quantite: a.quantite, mode: a.mode } : null;
  if (a.montant == null || !(a.montant > 0)) return null;
  // Prix d'une unité de commande inconnu (charcuterie à poids variable facturée au kilo) :
  // l'achat compte quand même comme habituel, avec 1 unité proposée
  if (!r.prix_uc || !(r.prix_uc > 0)) return { quantite: 1, mode: "uc" };
  const n = a.montant / r.prix_uc;
  if (r.au_poids) return { quantite: Math.max(0.5, Math.round(n * 2) / 2), mode: "uc" };
  const entier = Math.round(n);
  // Fraction de colis (½ colis de crème = 6 bouteilles) : exprimée en éléments si c'est permis
  if (r.element_permis && r.contenu_nb > 1 && (entier === 0 || Math.abs(n - entier) > TOLERANCE)) {
    return { quantite: Math.max(1, Math.round(n * r.contenu_nb)), mode: "element" };
  }
  return { quantite: Math.max(1, entier), mode: "uc" };
}

/**
 * Habituels par produit : nombre de jours d'achat sur la période et quantité la plus fréquente
 * (à égalité, la plus récente). Plusieurs lignes d'un même jour sont additionnées.
 */
export function calculerHabituels(achats: AchatBrut[], regles: Map<string, RegleArticle>): Map<string, Habituel> {
  // 1. Cumul par produit × jour × unité
  const parJour = new Map<string, { ingredient_id: string; date: string; mode: "uc" | "element"; quantite: number }>();
  for (const a of achats) {
    const r = regles.get(a.ingredient_id);
    if (!r) continue;
    const q = quantiteCommande(a, r);
    if (!q) continue;
    const k = `${a.ingredient_id}|${a.date}|${q.mode}`;
    const cur = parJour.get(k);
    if (cur) cur.quantite += q.quantite;
    else parJour.set(k, { ingredient_id: a.ingredient_id, date: a.date, mode: q.mode, quantite: q.quantite });
  }
  // 2. Par produit : jours distincts et quantité la plus fréquente
  const parProduit = new Map<string, { jours: Set<string>; compte: Map<string, { n: number; derniere: string; quantite: number; mode: "uc" | "element" }> }>();
  for (const j of parJour.values()) {
    let p = parProduit.get(j.ingredient_id);
    if (!p) { p = { jours: new Set(), compte: new Map() }; parProduit.set(j.ingredient_id, p); }
    p.jours.add(j.date);
    const k = `${j.mode}|${j.quantite}`;
    const c = p.compte.get(k);
    if (c) { c.n += 1; if (j.date > c.derniere) c.derniere = j.date; }
    else p.compte.set(k, { n: 1, derniere: j.date, quantite: j.quantite, mode: j.mode });
  }
  const res = new Map<string, Habituel>();
  for (const [id, p] of parProduit) {
    let best: { n: number; derniere: string; quantite: number; mode: "uc" | "element" } | null = null;
    for (const c of p.compte.values()) {
      if (!best || c.n > best.n || (c.n === best.n && c.derniere > best.derniere)) best = c;
    }
    const derniere = [...p.jours].sort().pop()!;
    if (best) res.set(id, { nb_achats: p.jours.size, quantite: best.quantite, mode: best.mode, derniere });
  }
  return res;
}
