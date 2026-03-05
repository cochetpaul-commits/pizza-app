export const CATEGORIES = [
  "cremerie",
  "fromage",
  "charcuterie",
  "viande",
  "maree",
  "boisson",
  "alcool",
  "epicerie",
  "legume",
  "fruit",
  "herbe",
  "preparation",
  "autre",
  "recette",
  "sauce",
  "surgele",
  "emballage",
] as const;

export type Category = (typeof CATEGORIES)[number];

export type PriceKind = "unit" | "pack_simple" | "pack_composed";
export type IngredientStatus = "to_check" | "validated" | "unknown";
export type Tab = IngredientStatus | "all";

export const CAT_COLORS: Record<Category, string> = {
  cremerie:    "#D97706", // ambre orange
  fromage:     "#CA8A04", // jaune doré (distinct de l'ambre)
  charcuterie: "#DC2626", // rouge vif
  viande:      "#991B1B", // rouge sombre/marron
  maree:       "#0284C7", // bleu ciel
  boisson:     "#0D9488", // teal
  alcool:      "#7C3AED", // violet
  epicerie:    "#1E40AF", // bleu marine (distinct du violet et du bleu ciel)
  legume:      "#16A34A", // vert vif
  fruit:       "#EA580C", // orange vif (distinct de l'ambre)
  herbe:       "#4D7C0F", // vert olive (distinct du vert vif)
  preparation: "#C026D3", // magenta/fuchsia
  sauce:       "#9D174D", // rose foncé/bordeaux
  surgele:     "#0891B2", // cyan (distinct du bleu ciel et marine)
  recette:     "#1E293B", // ardoise très sombre
  emballage:   "#78716C", // gris chaud
  autre:       "#6B7280", // gris neutre
};

export type Supplier = {
  id: string;
  name: string;
  is_active: boolean;
};

export type Ingredient = {
  id: string;
  name: string;
  category: Category;
    allergens: unknown | null;
  is_active: boolean;
  default_unit: string | null;

  purchase_price: number | null;
  purchase_unit: number | null;
  purchase_unit_label: string | null;
  purchase_unit_name: string | null;

  density_g_per_ml: number | null;
  piece_weight_g: number | null;
  piece_volume_ml: number | null;

  supplier_id: string | null;
  source_prep_recipe_name?: string | null;

  status?: IngredientStatus | null;
  status_note?: string | null;
  validated_at?: string | null;
  validated_by?: string | null;

  cost_per_unit?: number | null;
  cost_per_kg?: number | null;
};

export type LatestOffer = {
  id?: string;
  ingredient_id: string;
  supplier_id: string;

  price_kind: PriceKind;

  unit: "kg" | "l" | "pc" | null;
  unit_price: number | null;

  pack_price: number | null;
  pack_total_qty: number | null;
  pack_unit: "kg" | "l" | null;

  pack_count: number | null;
  pack_each_qty: number | null;
  pack_each_unit: "kg" | "l" | "pc" | null;

  density_kg_per_l: number | null;
  piece_weight_g: number | null;

  updated_at?: string | null;
  establishment?: "bellomio" | "piccola" | "both" | null;
};

export type IngredientUpsert = {
  name: string;
  category: Category;
    allergens: unknown | null;
  is_active: boolean;
  default_unit: string | null;

  purchase_price: number | null;
  purchase_unit: number | null;
  purchase_unit_label: string | null;
  purchase_unit_name: string | null;

  density_g_per_ml: number | null;
  piece_weight_g: number | null;
  piece_volume_ml: number | null;

  supplier_id: string | null;
};
