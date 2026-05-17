-- Add ingredient_links JSONB column to store non-flour ingredient mappings
-- e.g. { "flour1": "uuid", "salt": "uuid", "water": "uuid", ... }
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS ingredient_links jsonb DEFAULT '{}';

-- Ensure total_cost exists (may already exist from dashboard)
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS total_cost numeric(10,4);
