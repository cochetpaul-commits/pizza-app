-- Ajouter colonne establishments sur ingredients (même pattern que kitchen_recipes)
ALTER TABLE ingredients
  ADD COLUMN IF NOT EXISTS establishments TEXT[] DEFAULT '{bellomio,piccola}';

-- Initialiser tous les ingrédients existants
UPDATE ingredients SET establishments = '{bellomio,piccola}' WHERE establishments IS NULL;
