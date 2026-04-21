-- Add fiche_type and metadata to kitchen_recipes
-- fiche_type: determines which sections to show in the catalogue
-- metadata: JSON for type-specific fields (domaine, cépage, région, etc.)

ALTER TABLE kitchen_recipes
  ADD COLUMN IF NOT EXISTS fiche_type text NOT NULL DEFAULT 'recette',
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}';

-- Add check constraint for valid fiche_type values
ALTER TABLE kitchen_recipes
  ADD CONSTRAINT kitchen_recipes_fiche_type_check
  CHECK (fiche_type IN ('recette', 'cocktail', 'vin', 'boisson', 'empatement'));

-- Update existing records based on category
UPDATE kitchen_recipes SET fiche_type = 'recette' WHERE fiche_type = 'recette';

-- Index for filtering by fiche_type
CREATE INDEX IF NOT EXISTS idx_kitchen_recipes_fiche_type ON kitchen_recipes(fiche_type);

COMMENT ON COLUMN kitchen_recipes.fiche_type IS 'Type de fiche: recette, cocktail, vin, boisson, empatement';
COMMENT ON COLUMN kitchen_recipes.metadata IS 'Champs spécifiques au type (domaine, cépage, région, accords, descriptif, anecdote, verre, température...)';
