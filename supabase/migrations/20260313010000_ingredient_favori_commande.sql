-- ============================================================
-- Ajout colonne favori_commande sur ingredients
-- Permet de marquer les ingrédients habituels par fournisseur
-- ============================================================

ALTER TABLE public.ingredients
  ADD COLUMN IF NOT EXISTS favori_commande BOOLEAN NOT NULL DEFAULT false;
