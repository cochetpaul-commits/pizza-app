export const CATEGORIES = [
  "antipasti",
  "autre",
  "biere",
  "cafeteria",
  "charcuterie_viande",
  "cremerie_fromage",
  "emballage",
  "epicerie_salee",
  "epicerie_sucree",
  "fruit",
  "legumes_herbes",
  "liqueurs",
  "maree",
  "preparation",
  "sauce",
  "sirops",
  "soft",
  "spiritueux",
  "surgele",
  "vins",
] as const;

export type Category = (typeof CATEGORIES)[number];

export type PriceKind = "unit" | "pack_simple" | "pack_composed";
export type IngredientStatus = "to_check" | "validated";
export type Tab = IngredientStatus | "all";

export const CAT_LABELS: Record<Category, string> = {
  cremerie_fromage:   "Crémerie / Fromage",
  charcuterie_viande: "Charcuterie / Viande",
  maree:              "Marée",
  vins:               "Vins",
  spiritueux:         "Spiritueux",
  biere:              "Bière",
  soft:               "Softs",
  cafeteria:          "Cafétéria",
  liqueurs:           "Liqueurs",
  sirops:             "Sirops",
  legumes_herbes:     "Légumes / Herbes",
  fruit:              "Fruits",
  epicerie_salee:     "Épicerie Salée",
  epicerie_sucree:    "Épicerie Sucrée",
  preparation:        "Préparation",
  sauce:              "Sauce",
  antipasti:          "Antipasti",
  emballage:          "Emballage",
  surgele:            "Surgelé",
  autre:              "Autre",
};

export const CAT_COLORS: Record<Category, string> = {
  cremerie_fromage:   "#D97706", // ambre doré
  charcuterie_viande: "#b85c3a", // terracotta foncé
  maree:              "#5e8278", // vert sauge
  vins:               "#8a6b3e", // brun doré
  spiritueux:         "#7C3AED", // violet
  biere:              "#D4A017", // doré bière
  soft:               "#6b8f71", // vert sauge clair
  cafeteria:          "#8B6914", // brun café
  liqueurs:           "#9B59B6", // violet clair
  sirops:             "#E67E22", // orange
  legumes_herbes:     "#4a6741", // vert forêt
  fruit:              "#D4775A", // terracotta
  epicerie_salee:     "#7c5c3a", // brun tabac
  epicerie_sucree:    "#c9952c", // doré chaud
  preparation:        "#5e7a5e", // vert mousse
  sauce:              "#9D6B4D", // brun cuivré
  antipasti:          "#d4a03c", // jaune miel
  emballage:          "#a8976b", // sable chaud
  surgele:            "#5b8fa8", // bleu glacé
  autre:              "#b0a894", // gris sable
};

export type Supplier = {
  id: string;
  name: string;
  is_active: boolean;
  email?: string | null;
  phone?: string | null;
  contact_name?: string | null;
  notes?: string | null;
  franco_minimum?: number | null;
  address?: string | null;
  city?: string | null;
  postal_code?: string | null;
  siret?: string | null;
  category?: string | null;
  payment_terms?: string | null;
  delivery_days?: string[] | null;
  website?: string | null;
  tva_intra?: string | null;
};

export type Ingredient = {
  id: string;
  name: string;
  /** Clé stable utilisée pour le matching lors des imports de factures.
   *  Ne jamais modifier automatiquement. Fallback sur `name` si null. */
  import_name?: string | null;
  /** Nom du produit dans Popina (caisse) pour le matching ventes → food cost */
  popina_name?: string | null;
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
  order_quantity?: number | null;

  // Établissements qui utilisent cet ingrédient
  establishments?: string[] | null;

  // Lieu de stockage (inventaire)
  storage_zone?: string | null;

  // Niveaux de stock
  stock_min?: number | null;
  stock_objectif?: number | null;
  stock_max?: number | null;

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
  popina_name?: string | null;
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
