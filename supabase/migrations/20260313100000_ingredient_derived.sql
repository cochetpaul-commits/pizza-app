-- Migration: ingrédients dérivés avec rendement
-- Date: 2026-03-13
-- Appliquée manuellement via SQL Editor

ALTER TABLE ingredients
  ADD COLUMN IF NOT EXISTS parent_ingredient_id UUID REFERENCES ingredients(id),
  ADD COLUMN IF NOT EXISTS rendement NUMERIC,
  ADD COLUMN IF NOT EXISTS is_derived BOOLEAN DEFAULT false;

-- Index pour recherche rapide des dérivés d'un parent
CREATE INDEX IF NOT EXISTS idx_ingredients_parent ON ingredients(parent_ingredient_id)
  WHERE parent_ingredient_id IS NOT NULL;
