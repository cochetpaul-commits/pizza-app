export const POLE_COLORS = {
  pizza:        "#8B1A1A",  // rouge
  cocktail:     "#D97706",  // ambre
  cuisine:      "#166534",  // vert
  "empâtement": "#EA580C",  // orange
  pivot:        "#6D28D9",  // violet
} as const;

export type PoleKey = keyof typeof POLE_COLORS;
