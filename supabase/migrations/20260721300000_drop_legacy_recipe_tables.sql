-- Drop FK constraints on popina_products pointing to old tables
ALTER TABLE popina_products DROP CONSTRAINT IF EXISTS popina_products_pizza_recipe_id_fkey;
ALTER TABLE popina_products DROP CONSTRAINT IF EXISTS popina_products_cocktail_id_fkey;

-- Drop the now-unused columns on popina_products
ALTER TABLE popina_products DROP COLUMN IF EXISTS pizza_recipe_id;
ALTER TABLE popina_products DROP COLUMN IF EXISTS cocktail_id;

-- Drop legacy tables (children first, CASCADE for remaining FK)
DROP TABLE IF EXISTS pizza_ingredients CASCADE;
DROP TABLE IF EXISTS cocktail_ingredients CASCADE;
DROP TABLE IF EXISTS pizza_recipes CASCADE;
DROP TABLE IF EXISTS cocktails CASCADE;
