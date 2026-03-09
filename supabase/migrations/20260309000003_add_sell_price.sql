-- Add sell_price column to recipe tables that don't have it yet.
-- cocktails already has sell_price; pizza_recipes, kitchen_recipes, recipes need it.

ALTER TABLE pizza_recipes
  ADD COLUMN IF NOT EXISTS sell_price numeric;

ALTER TABLE kitchen_recipes
  ADD COLUMN IF NOT EXISTS sell_price numeric;

ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS sell_price numeric;
