/**
 * Poste EBE d'une catégorie Pennylane par le numéro de compte du cabinet (29/10/2026).
 * Depuis le plan validé par Paul, chaque catégorie Pennylane porte son compte en préfixe
 * (« 601120 · Achats cuisine », « 6451 · URSSAF et charges sociales ») : on rattache par le
 * compte, le nom peut changer sans casser la synchronisation. Le préfixe le plus long gagne.
 * null = hors EBE (investissements, emprunts, intérêts) ; undefined = pas de compte en préfixe.
 */
const POSTE_PAR_COMPTE: [string, string | null][] = [
  // Achats matières (cuisine, softs, boissons, café, packaging)
  ["601", "achats_matieres"], ["6026", "achats_matieres"], ["607", "achats_matieres"],
  // Hygiène, entretien et maintenance
  ["6022", "entretien"], ["611", "entretien"], ["615", "entretien"],
  // Personnel
  ["641", "masse_salariale"], ["645", "masse_salariale"], ["647", "masse_salariale"], ["6186", "masse_salariale"], ["631", "masse_salariale"], ["633", "masse_salariale"],
  // Direction (holding)
  ["6228", "remuneration_gerants"],
  // Loyers et redevances
  ["6132", "loyer"], ["6358", "loyer"],
  // Énergie et fluides (le carburant 60613 reste dans les autres charges)
  ["60611", "energie"], ["60612", "energie"], ["60614", "energie"],
  // Banque, commissions CB, titres restaurant
  ["627", "commissions_cb"],
  // Assurances
  ["616", "assurances"],
  // Honoraires
  ["622", "honoraires"],
  // Locations et crédits-bails
  ["612", "locations"], ["6135", "locations"],
  // Hors EBE : immobilisations, emprunts, intérêts, TVA, impôts
  ["2", null], ["16", null], ["661", null], ["44", null], ["695", null],
  // Tout autre compte de charge
  ["6", "autres_charges"],
];
const TRIE = [...POSTE_PAR_COMPTE].sort((a, b) => b[0].length - a[0].length);

/** Numéro de compte en préfixe du libellé (« 601120 · … » → « 601120 »), sinon null */
export function compteDuLibelle(label: string): string | null {
  const m = /^\s*(\d{1,9})\s*[·.\-–:]/.exec(label);
  return m ? m[1] : null;
}

export function posteParCompte(label: string): string | null | undefined {
  const compte = compteDuLibelle(label);
  if (!compte) return undefined;
  const hit = TRIE.find(([prefixe]) => compte.startsWith(prefixe));
  return hit ? hit[1] : "autres_charges";
}
