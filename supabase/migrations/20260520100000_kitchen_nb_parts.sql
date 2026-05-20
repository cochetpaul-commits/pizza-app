-- Add nb_parts column to kitchen_recipes for portion/kg pricing mode
-- 0 = kg mode, >= 1 = portion mode (number of portions)
ALTER TABLE kitchen_recipes ADD COLUMN IF NOT EXISTS nb_parts integer DEFAULT 1;
