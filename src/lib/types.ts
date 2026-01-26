export type UnitType = "g" | "ml" | "pcs" | "pinch" | "dash";

export type Ingredient = {
  id: string;
  name: string;
  category: string;
  allergens?: string | null;
  is_active: boolean;
  cost_per_unit?: number | null;
  density_g_per_ml?: number | null;
};

export type PizzaIngredientRow = {
  id?: string;
  ingredient_id: string;
  qty: number | "";
  unit: UnitType;
  stage: "pre" | "post";
  sort_order?: number;
};

