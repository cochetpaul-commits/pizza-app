export const POLE_COLORS = {
  pizza:        "#8B1A1A",  // rouge
  cocktail:     "#0E7490",  // teal
  cuisine:      "#166534",  // vert
  "empâtement": "#B45309",  // ambre-brun
  pivot:        "#6D28D9",  // violet
} as const;

export type PoleKey = keyof typeof POLE_COLORS;
