/** Unified category color map — verts, jaunes, terracotta (palette iFratelli) */
const CAT_COLORS: Record<string, string> = {
  PIZZE: "#D4775A",              // terracotta
  CUCINA: "#4a6741",             // vert forêt
  CUISINE: "#4a6741",            // vert forêt (alias)
  DOLCI: "#c9952c",              // doré chaud
  DESSERTS: "#c9952c",           // doré chaud (alias)
  ALCOOL: "#b85c3a",             // terracotta foncé
  VINI: "#8a6b3e",               // brun doré
  ANTIPASTI: "#d4a03c",          // jaune miel
  BEVANDE: "#6b8f71",            // vert sauge
  BOISSONS: "#6b8f71",           // vert sauge (alias)
  "BEVANDE CALDE": "#a8976b",    // sable chaud
  "BOISSONS CHAUDES": "#a8976b", // sable chaud (alias)
  DIGESTIVI: "#7c5c3a",          // brun tabac
  SPIRITUEUX: "#7c5c3a",         // brun tabac (alias)
  MESSAGES: "#b0a894",           // gris sable
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
