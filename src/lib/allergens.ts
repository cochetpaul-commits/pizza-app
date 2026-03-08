/**
 * 14 allergènes réglementaires européens — constantes partagées.
 * Source : Règlement UE 1169/2011 (INCO).
 *
 * ⚠ Ces noms doivent correspondre exactement à ceux retournés par
 *    detectAllergensFromName() dans allergenDetector.ts.
 */

export const ALLERGENS = [
  "Gluten",
  "Crustacés",
  "Œufs",
  "Poisson",
  "Arachides",
  "Soja",
  "Lait",
  "Fruits à coque",
  "Céleri",
  "Moutarde",
  "Sésame",
  "Sulfites",
  "Lupin",
  "Mollusques",
] as const;

export type Allergen = (typeof ALLERGENS)[number];

/** Abréviation affichée dans les badges de l'index ingrédients */
export const ALLERGEN_SHORT: Record<Allergen, string> = {
  "Gluten":        "G",
  "Crustacés":     "Cr",
  "Œufs":          "Oe",
  "Poisson":       "Po",
  "Arachides":     "Ar",
  "Soja":          "So",
  "Lait":          "La",
  "Fruits à coque":"Fc",
  "Céleri":        "Ce",
  "Moutarde":      "Mo",
  "Sésame":        "Sé",
  "Sulfites":      "Su",
  "Lupin":         "Lu",
  "Mollusques":    "Ml",
};

/** Parse la valeur DB (JSON array ou string) en string[] */
export function parseAllergens(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === "string");
  if (typeof raw === "string") {
    try { return JSON.parse(raw) as string[]; } catch { return []; }
  }
  return [];
}

/** Union de plusieurs listes d'allergènes, dans l'ordre canonical */
export function mergeAllergens(lists: string[][]): string[] {
  const set = new Set<string>();
  for (const list of lists) for (const a of list) set.add(a);
  return ALLERGENS.filter(a => set.has(a));
}
