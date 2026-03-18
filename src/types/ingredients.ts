export const CATEGORIES = [
  "cremerie_fromage",
  "charcuterie_viande",
  "maree",
  "legumes_herbes",
  "fruit",
  "epicerie_salee",
  "epicerie_sucree",
  "alcool_spiritueux",
  "boisson",
  "sauce",
  "autre",
  "preparation",
  "antipasti",
  "emballage",
] as const;

export type Category = (typeof CATEGORIES)[number];

export type PriceKind = "unit" | "pack_simple" | "pack_composed";
export type IngredientStatus = "to_check" | "validated";
export type Tab = IngredientStatus | "all";

export const CAT_LABELS: Record<Category, string> = {
  cremerie_fromage:   "Crémerie / Fromage",
  charcuterie_viande: "Charcuterie / Viande",
  maree:              "Marée",
  alcool_spiritueux:  "Vins / Spiritueux",
  boisson:            "Boissons",
  legumes_herbes:     "Légumes / Herbes",
  fruit:              "Fruits",
  epicerie_salee:     "Épicerie Salée",
  epicerie_sucree:    "Épicerie Sucrée",
  preparation:        "Préparation",
  sauce:              "Sauce",
  antipasti:          "Antipasti",
  emballage:          "Emballage",
  autre:              "Autre",
};

export const CAT_COLORS: Record<Category, string> = {
  cremerie_fromage:   "#D97706", // ambre orange
  charcuterie_viande: "#DC2626", // rouge vif
  maree:              "#0284C7", // bleu ciel
  alcool_spiritueux:  "#7C3AED", // violet
  boisson:            "#0D9488", // teal
  legumes_herbes:     "#16A34A", // vert vif
  fruit:              "#EA580C", // orange vif
  epicerie_salee:     "#1E40AF", // bleu marine
  epicerie_sucree:    "#92400E", // brun
  preparation:        "#C026D3", // magenta/fuchsia
  sauce:              "#9D174D", // rose foncé/bordeaux
  antipasti:          "#CA8A04", // jaune doré
  emballage:          "#78716C", // gris chaud
  autre:              "#6B7280", // gris neutre
};

export type Supplier = {
  id: string;
  name: string;
  is_active: boolean;
  email?: string | null;
  phone?: string | null;
  contact_name?: string | null;
  notes?: string | null;
};

export type Ingredient = {
  id: string;
  name: string;
  /** Clé stable utilisée pour le matching lors des imports de factures.
   *  Ne jamais modifier automatiquement. Fallback sur `name` si null. */
  import_name?: string | null;
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
  source?: string | null;
  recipe_id?: string | null;

  status?: IngredientStatus | null;
  status_note?: string | null;
  validated_at?: string | null;
  validated_by?: string | null;

  etablissement_id?: string | null;

  cost_per_unit?: number | null;
  cost_per_kg?: number | null;

  order_unit_label?: string | null;

  // Ingrédients dérivés (rendement)
  parent_ingredient_id?: string | null;
  rendement?: number | null;
  is_derived?: boolean;
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
  import_name?: string | null;
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
  order_unit_label?: string | null;
};
