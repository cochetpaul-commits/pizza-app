/** Couleurs des catégories de la caisse, communes à la Carte, Par produit, la Cave et l'analyse */
const CAT_COLORS: Record<string, string> = {
  // Palette des catégories de la caisse Popina, celle de la Carte (29/10/2026) : une seule source pour toute l'app
  PIZZE: "#DD4124",
  ANTIPASTI: "#E2583E",
  CUCINA: "#0F4C81", CUISINE: "#0F4C81", PLATS: "#0F4C81",
  DOLCI: "#FFBE98", DESSERTS: "#FFBE98",
  VINI: "#955251", VINS: "#955251",
  DIGESTIVI: "#5F4B8B", DIGESTIFS: "#5F4B8B", SPIRITUEUX: "#5F4B8B",
  ALCOOL: "#B163A3",
  BEVANDE: "#7BC4C4", BOISSONS: "#7BC4C4",
  "BEVANDE CALDE": "#A47864", "BOISSONS CHAUDES": "#A47864",
  "MENU ANNIVERSAIRE": "#C9952C",
  MESSAGES: "#939597",
};

const FALLBACK_COLORS = [
  "#D4775A", "#4a6741", "#c9952c", "#6b8f71", "#b85c3a",
  "#8a6b3e", "#d4a03c", "#a8976b", "#7c5c3a", "#5e7a5e",
  "#c4885a", "#8b9b6b", "#d9a85c", "#5a7d6b",
];

/** Get a consistent color for a category name */
export function getCategoryColor(cat: string, index?: number): string {
  const upper = cat.toUpperCase();
  if (CAT_COLORS[upper]) return CAT_COLORS[upper];
  // Partial match
  for (const [key, color] of Object.entries(CAT_COLORS)) {
    if (upper.includes(key) || key.includes(upper)) return color;
  }
  // Fallback by index
  return FALLBACK_COLORS[(index ?? 0) % FALLBACK_COLORS.length];
}

/** Get colors for an array of categories */
export function getCategoryColors(cats: string[]): string[] {
  return cats.map((c, i) => getCategoryColor(c, i));
}

export { CAT_COLORS, FALLBACK_COLORS };
