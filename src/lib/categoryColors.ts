/** Unified category color map — used across all ventes/marges pages for consistency */
const CAT_COLORS: Record<string, string> = {
  PIZZE: "#D4775A",           // terracotta
  CUISINE: "#46655a",         // dark green
  VINI: "#8B4513",            // saddle brown
  BOISSONS: "#5e8278",        // sage
  "BOISSONS CHAUDES": "#c4a882", // tan
  SPIRITUEUX: "#7c5c3a",      // brown
  DOLCI: "#d4a03c",           // gold
  ANTIPASTI: "#e09070",        // salmon
  DESSERTS: "#d4a03c",        // gold (alias)
  MESSAGES: "#999999",        // muted gray
};

const FALLBACK_COLORS = [
  "#D4775A", "#46655a", "#8B4513", "#5e8278", "#c4a882",
  "#7c5c3a", "#d4a03c", "#e09070", "#5e7a8a", "#a8b89c",
  "#3a7d44", "#e0b896",
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
