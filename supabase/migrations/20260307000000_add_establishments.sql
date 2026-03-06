-- Ajout du champ establishments sur toutes les tables de recettes
-- Ces colonnes ont été ajoutées directement en dashboard — migration pour historique propre.
-- Utilisation de IF NOT EXISTS pour être idempotent.

-- pizza_recipes
ALTER TABLE public.pizza_recipes
  ADD COLUMN IF NOT EXISTS establishments TEXT[]
  DEFAULT ARRAY['bellomio'::text, 'piccola'::text];

-- kitchen_recipes
ALTER TABLE public.kitchen_recipes
  ADD COLUMN IF NOT EXISTS establishments TEXT[]
  DEFAULT ARRAY['bellomio'::text, 'piccola'::text];

-- prep_recipes
ALTER TABLE public.prep_recipes
  ADD COLUMN IF NOT EXISTS establishments TEXT[]
  DEFAULT ARRAY['bellomio'::text, 'piccola'::text];

-- supplier_offers (singulier, TEXT simple, valeur par défaut 'both')
ALTER TABLE public.supplier_offers
  ADD COLUMN IF NOT EXISTS establishment TEXT
  DEFAULT 'both'::text;
