-- Synchronisation recettes cuisine → catalogue ingrédients
-- Permet de créer/mettre à jour un ingrédient lié à chaque recette kitchen

ALTER TABLE public.ingredients
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS recipe_id UUID REFERENCES kitchen_recipes(id) ON DELETE CASCADE;

-- Index pour les lookups by recipe_id
CREATE INDEX IF NOT EXISTS idx_ingredients_recipe_id ON public.ingredients(recipe_id);
CREATE INDEX IF NOT EXISTS idx_ingredients_source ON public.ingredients(source);
