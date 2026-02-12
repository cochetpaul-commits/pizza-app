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
  cremerie: "#A16207",
  fromage: "#92400E",
  charcuterie: "#9A3412",
  viande: "#7F1D1D",
  maree: "#075985",
  boisson: "#0F766E",
  alcool: "#0E7490",
  epicerie: "#4C1D95",
  legume: "#3F6212",
  fruit: "#B45309",
  herbe: "#166534",
  preparation: "#d5835f",
  autre: "#111827",
  recette: "#334155",
  sauce: "#9F1239",
  surgele: "#1D4ED8",
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
