/**
 * Toutes les dépenses (24/11/2026, demande de Paul) : les factures et prélèvements que Pennylane range par catégorie
 * (table charges_detail, remplie chaque nuit), regroupés par grand poste puis par catégorie, face à la période d'avant
 * de même longueur. Hors taxes, à la date de la facture : ce sont des dépenses, pas de la trésorerie. Logique pure.
 */
export type LigneDepense = { mois: string; date: string | null; poste: string; categorie: string; fournisseur: string | null; libelle: string | null; montant_ht: number; type: string };
export type CategorieDepense = { categorie: string; total: number; totalPrec: number; nb: number; lignes: Omit<LigneDepense, "poste" | "categorie">[] };
export type PosteDepense = { poste: string; libelle: string; total: number; totalPrec: number; categories: CategorieDepense[] };
export type Depenses = { mois: string[]; moisPrec: string[]; total: number; totalPrec: number; postes: PosteDepense[]; parMois: { mois: string; postes: Record<string, number> }[] };

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Les mois (AAAA-MM) d'une période en jours, et la période précédente de même nombre de mois */
export function moisDePeriode(from: string, to: string, max = 24): { mois: string[]; moisPrec: string[] } {
  const mois: string[] = [];
  const d = new Date(`${from.slice(0, 7)}-01T12:00:00Z`), fin = new Date(`${to.slice(0, 7)}-01T12:00:00Z`);
  while (d <= fin && mois.length < max) { mois.push(d.toISOString().slice(0, 7)); d.setUTCMonth(d.getUTCMonth() + 1); }
  const p = new Date(`${(mois[0] ?? from.slice(0, 7))}-01T12:00:00Z`);
  const moisPrec: string[] = [];
  for (let i = 0; i < mois.length; i++) { p.setUTCMonth(p.getUTCMonth() - 1); moisPrec.unshift(p.toISOString().slice(0, 7)); }
  return { mois, moisPrec };
}

export function regrouperDepenses(lignes: LigneDepense[], mois: string[], moisPrec: string[], libelles: Record<string, string>): Depenses {
  const dansPeriode = new Set(mois), dansPrec = new Set(moisPrec);
  const postes = new Map<string, PosteDepense>();
  const parMois = new Map(mois.map((m) => [m, {} as Record<string, number>]));
  for (const l of lignes) {
    const m = l.mois.slice(0, 7);
    const actuel = dansPeriode.has(m), avant = dansPrec.has(m);
    if (!actuel && !avant) continue;
    const p = postes.get(l.poste) ?? { poste: l.poste, libelle: libelles[l.poste] ?? l.poste, total: 0, totalPrec: 0, categories: [] };
    postes.set(l.poste, p);
    let c = p.categories.find((x) => x.categorie === l.categorie);
    if (!c) { c = { categorie: l.categorie, total: 0, totalPrec: 0, nb: 0, lignes: [] }; p.categories.push(c); }
    const v = Number(l.montant_ht) || 0;
    if (actuel) {
      p.total += v; c.total += v; c.nb++;
      c.lignes.push({ mois: m, date: l.date, fournisseur: l.fournisseur, libelle: l.libelle, montant_ht: r2(v), type: l.type });
      const pm = parMois.get(m)!; pm[l.poste] = r2((pm[l.poste] ?? 0) + v);
    } else { p.totalPrec += v; c.totalPrec += v; }
  }
  const liste = [...postes.values()].map((p) => ({
    ...p, total: r2(p.total), totalPrec: r2(p.totalPrec),
    categories: p.categories.map((c) => ({ ...c, total: r2(c.total), totalPrec: r2(c.totalPrec), lignes: c.lignes.sort((a, b) => (b.date ?? b.mois).localeCompare(a.date ?? a.mois) || b.montant_ht - a.montant_ht) }))
      // Classement par montant (explicite), à égalité par nom
      .sort((a, b) => b.total - a.total || a.categorie.localeCompare(b.categorie, "fr")),
  })).filter((p) => p.total !== 0 || p.totalPrec !== 0)
    .sort((a, b) => b.total - a.total || a.libelle.localeCompare(b.libelle, "fr"));
  return {
    mois, moisPrec,
    total: r2(liste.reduce((t, p) => t + p.total, 0)), totalPrec: r2(liste.reduce((t, p) => t + p.totalPrec, 0)),
    postes: liste, parMois: mois.map((m) => ({ mois: m, postes: parMois.get(m) ?? {} })),
  };
}
