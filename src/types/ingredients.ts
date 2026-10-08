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
/** Vue de la Base produits : tous, à contrôler, validés (statut en base) ou sans prix d'achat (calculé) */
export type Tab = IngredientStatus | "all" | "sans_prix";

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

/**
 * Palette des catégories : une couleur Pantone de l'année par catégorie (validée le 01/10/2026).
 * Les teintes claires (Mimosa, Peach Fuzz, Sand Dollar, Illuminating) s'écrivent en foncé sur leur barre
 * et en version assombrie sur fond blanc : voir couleurTexte / couleurTexteSur dans src/lib/styleCategories.ts.
 */
export const CAT_COLORS: Record<Category, string> = {
  cremerie_fromage:   "#F0C05A", // Mimosa 2009
  charcuterie_viande: "#9B1B30", // Chili Pepper 2007
  maree:              "#53B0AE", // Blue Turquoise 2005
  vins:               "#955251", // Marsala 2015
  spiritueux:         "#5F4B8B", // Ultra Violet 2018
  biere:              "#F5DF4D", // Illuminating 2021
  soft:               "#7BC4C4", // Aqua Sky 2003
  cafeteria:          "#A47864", // Mocha Mousse 2025
  liqueurs:           "#B163A3", // Radiant Orchid 2014
  sirops:             "#BB2649", // Viva Magenta 2023
  legumes_herbes:     "#88B04B", // Greenery 2017
  fruit:              "#DD4124", // Tangerine Tango 2012
  epicerie_salee:     "#0F4C81", // Classic Blue 2020
  epicerie_sucree:    "#FFBE98", // Peach Fuzz 2024
  preparation:        "#009473", // Emerald 2013
  sauce:              "#BF1932", // True Red 2002
  antipasti:          "#E2583E", // Tigerlily 2004
  emballage:          "#DECDBE", // Sand Dollar 2006
  surgele:            "#92A8D1", // Serenity 2016
  autre:              "#939597", // Ultimate Gray 2021
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
  /** Dose servie en cl (ex: 5cl pour un verre de liqueur) — null = produit vendu entier */
  popina_dose_cl?: number | null;
  category: Category;
  sub_category?: string | null;
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

  // Conditionnement de commande (la commande en est dérivée pour tous les fournisseurs)
  order_element?: string | null;
  order_element_permis?: boolean | null;

  // Lieux de stockage POUR L'ÉTABLISSEMENT COURANT (voir src/lib/zonesEtablissement.ts) ;
  // en base, ingredients.storage_zone n'est que le miroir de l'établissement de rattachement
  storage_zone?: string | null;
  storage_zone_2?: string | null;

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
  popina_dose_cl?: number | null;
  category: Category;
  sub_category?: string | null;
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
