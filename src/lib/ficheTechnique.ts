/**
 * Fiche technique PDF, nouveau modèle (25/11/2026, brief de Paul) : logique pure, testée.
 * - Couleur par catégorie, appliquée partout sur la fiche.
 * - Procédé : une étape qui commence par un mot en capitales suivi de « : » ouvre une phase (« PESTO : Mettre… »).
 * - Ingrédients : séparés « avant / après cuisson » seulement quand la recette a les deux (les lignes ne disent
 *   pas à quelle phase du procédé elles appartiennent).
 */
export const COULEURS_CATEGORIE: Record<string, string> = {
  entree: "#c49a3c", antipasti: "#c49a3c",
  plat_cuisine: "#a63d2f", pizza: "#a63d2f", accompagnement: "#a63d2f",
  dessert: "#8b4572",
  preparation: "#2d5c4f", sauce: "#2d5c4f",
};
export const COULEUR_DEFAUT = "#2d5c4f";
/** Teinte claire (fond alterné des tableaux, badge portions, onglets de phase) — brief du 26/11/2026 */
const CLAIRS: Record<string, string> = { "#c49a3c": "#faf5eb", "#a63d2f": "#faf0ee", "#8b4572": "#f9f0f5", "#2d5c4f": "#e8f0ed" };
export const clairCategorie = (c: string | null | undefined) => CLAIRS[couleurCategorie(c)] ?? "#e8f0ed";
export const LIBELLES_CATEGORIE: Record<string, string> = {
  entree: "Entrée", antipasti: "Antipasti", plat_cuisine: "Plat", pizza: "Pizza", accompagnement: "Accompagnement",
  dessert: "Dessert", preparation: "Préparation", sauce: "Sauce", cocktail: "Cocktail", mocktail: "Mocktail",
};
export const couleurCategorie = (c: string | null | undefined) => COULEURS_CATEGORIE[c ?? ""] ?? COULEUR_DEFAUT;

export type PhaseProcede = { phase: string | null; etapes: { n: number; texte: string }[] };
/** « PESTO : Mettre basilic… » → phase « Pesto », étape « Mettre basilic… ». Numérotation continue sur toute la fiche. */
export function decouperProcede(etapes: string[]): PhaseProcede[] {
  const out: PhaseProcede[] = [];
  let n = 0;
  for (const brut of etapes) {
    const t = brut.trim();
    if (!t) continue;
    const m = t.match(/^([A-ZÀ-ÖØ-Þ][A-ZÀ-ÖØ-Þ' -]{1,40}?)\s*:\s+([\s\S]+)$/);
    if (m && m[1] === m[1].toUpperCase() && /[A-ZÀ-Þ]{2}/.test(m[1])) {
      const nom = m[1].trim().toLowerCase();
      out.push({ phase: nom.charAt(0).toUpperCase() + nom.slice(1), etapes: [] });
      out[out.length - 1].etapes.push({ n: ++n, texte: m[2].trim() });
    } else {
      if (!out.length) out.push({ phase: null, etapes: [] });
      out[out.length - 1].etapes.push({ n: ++n, texte: t });
    }
  }
  return out;
}

export type LigneFiche = { nom: string; qte: number | null; unite: string; stage?: string | null };
export type GroupeIngredients = { titre: string | null; lignes: LigneFiche[] };
export function grouperIngredients(lignes: LigneFiche[]): GroupeIngredients[] {
  const avant = lignes.filter((l) => l.stage !== "post"), apres = lignes.filter((l) => l.stage === "post");
  if (!avant.length || !apres.length) return [{ titre: null, lignes }];
  return [{ titre: "Avant cuisson", lignes: avant }, { titre: "Après cuisson", lignes: apres }];
}

/** Quantité lisible : 5000 g → 5 kg, 250 cl → 2,5 l ; virgule décimale */
export function quantite(qte: number | null, unite: string): { q: string; u: string } {
  if (qte == null) return { q: "—", u: unite };
  let v = qte, u = unite;
  if (u.toLowerCase() === "g" && v >= 1000) { v = v / 1000; u = "kg"; }
  else if (u.toLowerCase() === "cl" && v >= 100) { v = v / 100; u = "l"; }
  else if (u.toLowerCase() === "ml" && v >= 1000) { v = v / 1000; u = "l"; }
  const arrondi = Math.round(v * 100) / 100;
  // Pièces en toutes lettres (brief V3 : « 28 pièces »)
  if (/^(pc|pcs|piece|pièce)s?$/i.test(u)) u = arrondi > 1 ? "pièces" : "pièce";
  return { q: arrondi.toLocaleString("fr-FR", { maximumFractionDigits: 2 }), u };
}
export const moisAnnee = (d: Date) => d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

/** Titre de fiche (brief V3) : sans le préfixe de travail « PM Nov24 - » */
export const titreFiche = (nom: string) => nom.replace(/^PM\s*Nov24\s*-?\s*/i, "").trim() || nom;

/**
 * Nom d'ingrédient lisible (brief V3) : sans codes, poids d'emballage ni calibres, en casse normale.
 * « EPINARD BRANCHE600G ROCHAMBEAU » → « Epinard branche rochambeau » ; « MASCARPONE DE VACHE 41% 500 G » → « Mascarpone de vache 41% ».
 */
export function nomLisible(nom: string): string {
  let t = ` ${nom} `;
  t = t.replace(/\([^)]*\)/g, " ");                                         // (COLIS 5 KG)
  t = t.replace(/(\d)\s*X\s*\d+/gi, "$1 ");                                   // 42G*12, 6 X 1L
  t = t.replace(/~?\s*\d+(?:[.,]\d+)?\s*(?:KG|GR|G|CL|ML|L|LT|LTR|LITRES?|PCS?|PIECES?)\b/gi, " "); // 500 G, 1 KG, 5 L, BRANCHE600G
  t = t.replace(/\b\d+\s*\/\s*\d+\b/g, " ");                                   // 4/4, 50/80
  t = t.replace(/\b(?:C1|CAT\s*1|CAT1|X\d+|BQ\d+|ART\d+|MC|VP|PET|BTE|SAC|BTL)\b/gi, " ");
  t = t.replace(/[*~]/g, " ").replace(/\s+/g, " ").trim().replace(/[,;:\-–]+$/g, "").trim();
  if (!t) return nom;
  const bas = t.toLocaleLowerCase("fr-FR");
  return bas.charAt(0).toLocaleUpperCase("fr-FR") + bas.slice(1);
}
