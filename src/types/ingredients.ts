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
] as const;

export type Category = (typeof CATEGORIES)[number];

export type PriceKind = "unit" | "pack_simple" | "pack_composed";
export type IngredientStatus = "to_check" | "validated" | "unknown";
export type Tab = IngredientStatus | "all";

export const CAT_COLORS: Record<Category, string> = {
  cremerie:    "#D97706", // ambre chaud
  fromage:     "#B45309", // orange brun
  charcuterie: "#DC2626", // rouge vif
  viande:      "#991B1B", // rouge sombre
  maree:       "#0284C7", // bleu ocean
  boisson:     "#0D9488", // teal
  alcool:      "#7C3AED", // violet
  epicerie:    "#6D28D9", // indigo
  legume:      "#16A34A", // vert vif
  fruit:       "#EA580C", // orange vif
  herbe:       "#15803D", // vert herbe
  preparation: "#F97316", // orange
  autre:       "#6B7280", // gris neutre
  recette:     "#475569", // gris bleu
  sauce:       "#E11D48", // rose rouge
  surgele:     "#2563EB", // bleu vif
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
