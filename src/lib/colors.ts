/**
 * Palette de couleurs partagée pour l'app.
 * Utilisée par le ColorPicker et comme référence partout.
 */

export type PaletteColor = { name: string; hex: string };

export const PALETTE: PaletteColor[] = [
  { name: "Grenat",     hex: "#6B1A2C" },
  { name: "Terracotta", hex: "#D4775A" },
  { name: "Vermillon",  hex: "#E83B2A" },
  { name: "Mandarine",  hex: "#F07030" },
  { name: "Ambre",      hex: "#F5A623" },
  { name: "Citron",     hex: "#E8D825" },
  { name: "Olive",      hex: "#8B9A3A" },
  { name: "Émeraude",   hex: "#2DAA6B" },
  { name: "Jade",       hex: "#1A7A5A" },
  { name: "Sarcelle",   hex: "#1A9AA0" },
  { name: "Bleu Ciel",  hex: "#4DB8D8" },
  { name: "Azur",       hex: "#2255CC" },
  { name: "Indigo",     hex: "#2C2A7A" },
  { name: "Mauve",      hex: "#7A3DB8" },
  { name: "Prune",      hex: "#8E1B6E" },
  { name: "Rose",       hex: "#E84B8A" },
  { name: "Pêche",      hex: "#F2A88C" },
  { name: "Corail",     hex: "#FF6B6B" },
  { name: "Lavande",    hex: "#9B8EC4" },
  { name: "Bordeaux",   hex: "#7A2E3A" },
  { name: "Forêt",      hex: "#2D5A3A" },
  { name: "Brun",       hex: "#5C3A1E" },
  { name: "Gris Ardoise", hex: "#6E7E8A" },
  { name: "Charbon",    hex: "#1C1C1E" },
];

/** Hex values only (for quick lookups) */
export const PALETTE_HEX = PALETTE.map((c) => c.hex);

/** Couleurs par défaut pour les catégories de recettes */
export const RECIPE_CATEGORY_COLORS: Record<string, string> = {
  pizza:           "#D4775A",
  entree:          "#2DAA6B",
  plat:            "#2255CC",
  dessert:         "#E84B8A",
  sauce:           "#E83B2A",
  preparation:     "#7A3DB8",
  empatement:      "#F5A623",
  cocktail:        "#1A9AA0",
  accompagnement:  "#8B9A3A",
};

/** Couleurs par défaut pour les établissements */
export const ESTABLISHMENT_COLORS: Record<string, string> = {
  bellomio: "#D4775A",
  piccola:  "#1A7A5A",
  groupe:   "#2C2A7A",
};
