-- Add nb_parts column to pizza_recipes for slice-based pricing
ALTER TABLE pizza_recipes ADD COLUMN IF NOT EXISTS nb_parts integer DEFAULT 1;
