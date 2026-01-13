export type UnitType = "g" | "ml" | "pcs" | "pinch" | "dash";
export type IngredientStage = "pre" | "post";

export type Ingredient = {
  id: string;
  name: string;
  category: string | null;
  default_unit: UnitType;
  allergens: string[];
  is_active: boolean;
};

export type Dough = {
  id: string;
  name: string;
  hydration: number | null;
  salt: number | null;
  yeast: number | null;
  notes: string | null;
  is_active: boolean;
};

export type Pizza = {
  id: string;
  name: string;
  dough_id: string | null;
  photo_url: string | null;
  procedure: string | null;
};

export type PizzaIngredientRow = {
  id?: string; // présent si row déjà en DB
  ingredient_id: string | null;
  qty: number | "";
  unit: UnitType;
  stage: IngredientStage;
  sort_order: number;
};
