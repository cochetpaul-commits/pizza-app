-- Ajoute le champ import_name sur les ingrédients
-- Sert de clé stable pour le matching lors des imports de factures.
-- N'est jamais mis à jour automatiquement quand l'utilisateur renomme un produit.

ALTER TABLE public.ingredients
  ADD COLUMN IF NOT EXISTS import_name TEXT;

-- Initialisation : copie le nom actuel dans import_name pour tous les enregistrements existants
UPDATE public.ingredients
SET import_name = name
WHERE import_name IS NULL;

-- Index pour accélérer les lookups à l'import
CREATE INDEX IF NOT EXISTS idx_ingredients_import_name
  ON public.ingredients (import_name);
