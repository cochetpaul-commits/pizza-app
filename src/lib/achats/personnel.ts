/**
 * Repas du personnel (29/10/2026) : les produits cochés « pour le personnel » dans la Base produits
 * sont des avantages en nature, pas des achats matières. Les lignes de factures fournisseurs n'ont pas
 * de lien direct vers la fiche produit : on les reconnaît par le nom (nom d'import ou nom de la fiche),
 * normalisé (sans accents, ni ponctuation, ni doubles espaces).
 */
export type ProduitPersonnel = { id: string; name: string; import_name?: string | null; supplier_id?: string | null };

export function normaliserNom(s: string | null | undefined): string {
  return (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Ensemble des noms normalisés des produits du personnel (fiche + nom d'import) */
export function clesPersonnel(produits: ProduitPersonnel[]): Set<string> {
  const s = new Set<string>();
  for (const p of produits) {
    const a = normaliserNom(p.name), b = normaliserNom(p.import_name);
    if (a) s.add(a);
    if (b) s.add(b);
  }
  return s;
}

/** Une ligne de facture est « personnel » si son nom normalisé est celui d'un produit du personnel */
export function estLignePersonnel(nomLigne: string | null | undefined, cles: Set<string>): boolean {
  const n = normaliserNom(nomLigne);
  return n.length > 0 && cles.has(n);
}
