-- ============================================================
-- Multi-établissements : table principale + colonnes FK
-- ============================================================

-- 1. Table etablissements
CREATE TABLE IF NOT EXISTS public.etablissements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  nom TEXT NOT NULL,
  adresse TEXT,
  telephone TEXT,
  email TEXT,
  popina_location_id TEXT,
  couleur TEXT NOT NULL DEFAULT '#D4775A',
  logo_url TEXT,
  actif BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.etablissements ENABLE ROW LEVEL SECURITY;

-- Tout utilisateur authentifié peut lire les établissements
CREATE POLICY "etab_read_authenticated"
  ON public.etablissements FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Admin seul peut modifier
CREATE POLICY "etab_admin_write"
  ON public.etablissements FOR ALL
  USING (public.user_role() = 'admin');

-- 2. Insérer Bello Mio (on ne crée PAS Piccola Mia pour l'instant)
INSERT INTO public.etablissements (slug, nom, couleur, popina_location_id)
VALUES ('bello_mio', 'Bello Mio', '#D4775A', 'd7442cfe-0305-4885-be9c-4853b9a3a2c2')
ON CONFLICT (slug) DO NOTHING;

-- 3. Ajouter etablissement_id sur les tables existantes + backfill + NOT NULL

DO $$
DECLARE
  bm_id UUID;
BEGIN
  SELECT id INTO bm_id FROM public.etablissements WHERE slug = 'bello_mio';

  -- ingredients
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ingredients' AND column_name='etablissement_id') THEN
    ALTER TABLE public.ingredients ADD COLUMN etablissement_id UUID REFERENCES public.etablissements(id);
    UPDATE public.ingredients SET etablissement_id = bm_id WHERE etablissement_id IS NULL;
    ALTER TABLE public.ingredients ALTER COLUMN etablissement_id SET NOT NULL;
    ALTER TABLE public.ingredients ALTER COLUMN etablissement_id SET DEFAULT bm_id;
  END IF;

  -- ingredients: shared flag
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ingredients' AND column_name='shared') THEN
    ALTER TABLE public.ingredients ADD COLUMN shared BOOLEAN NOT NULL DEFAULT false;
  END IF;

  -- pizza_recipes
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pizza_recipes' AND column_name='etablissement_id') THEN
    ALTER TABLE public.pizza_recipes ADD COLUMN etablissement_id UUID REFERENCES public.etablissements(id);
    UPDATE public.pizza_recipes SET etablissement_id = bm_id WHERE etablissement_id IS NULL;
    ALTER TABLE public.pizza_recipes ALTER COLUMN etablissement_id SET NOT NULL;
    ALTER TABLE public.pizza_recipes ALTER COLUMN etablissement_id SET DEFAULT bm_id;
  END IF;

  -- kitchen_recipes
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='kitchen_recipes' AND column_name='etablissement_id') THEN
    ALTER TABLE public.kitchen_recipes ADD COLUMN etablissement_id UUID REFERENCES public.etablissements(id);
    UPDATE public.kitchen_recipes SET etablissement_id = bm_id WHERE etablissement_id IS NULL;
    ALTER TABLE public.kitchen_recipes ALTER COLUMN etablissement_id SET NOT NULL;
    ALTER TABLE public.kitchen_recipes ALTER COLUMN etablissement_id SET DEFAULT bm_id;
  END IF;

  -- prep_recipes
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='prep_recipes' AND column_name='etablissement_id') THEN
    ALTER TABLE public.prep_recipes ADD COLUMN etablissement_id UUID REFERENCES public.etablissements(id);
    UPDATE public.prep_recipes SET etablissement_id = bm_id WHERE etablissement_id IS NULL;
    ALTER TABLE public.prep_recipes ALTER COLUMN etablissement_id SET NOT NULL;
    ALTER TABLE public.prep_recipes ALTER COLUMN etablissement_id SET DEFAULT bm_id;
  END IF;

  -- cocktails
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='cocktails' AND column_name='etablissement_id') THEN
    ALTER TABLE public.cocktails ADD COLUMN etablissement_id UUID REFERENCES public.etablissements(id);
    UPDATE public.cocktails SET etablissement_id = bm_id WHERE etablissement_id IS NULL;
    ALTER TABLE public.cocktails ALTER COLUMN etablissement_id SET NOT NULL;
    ALTER TABLE public.cocktails ALTER COLUMN etablissement_id SET DEFAULT bm_id;
  END IF;

  -- recipes (empatement)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='recipes' AND column_name='etablissement_id') THEN
    ALTER TABLE public.recipes ADD COLUMN etablissement_id UUID REFERENCES public.etablissements(id);
    UPDATE public.recipes SET etablissement_id = bm_id WHERE etablissement_id IS NULL;
    ALTER TABLE public.recipes ALTER COLUMN etablissement_id SET NOT NULL;
    ALTER TABLE public.recipes ALTER COLUMN etablissement_id SET DEFAULT bm_id;
  END IF;

  -- events
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='events' AND column_name='etablissement_id') THEN
    ALTER TABLE public.events ADD COLUMN etablissement_id UUID REFERENCES public.etablissements(id);
    UPDATE public.events SET etablissement_id = bm_id WHERE etablissement_id IS NULL;
    ALTER TABLE public.events ALTER COLUMN etablissement_id SET NOT NULL;
    ALTER TABLE public.events ALTER COLUMN etablissement_id SET DEFAULT bm_id;
  END IF;

  -- commande_sessions
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='commande_sessions' AND column_name='etablissement_id') THEN
    ALTER TABLE public.commande_sessions ADD COLUMN etablissement_id UUID REFERENCES public.etablissements(id);
    UPDATE public.commande_sessions SET etablissement_id = bm_id WHERE etablissement_id IS NULL;
    ALTER TABLE public.commande_sessions ALTER COLUMN etablissement_id SET NOT NULL;
    ALTER TABLE public.commande_sessions ALTER COLUMN etablissement_id SET DEFAULT bm_id;
  END IF;

  -- suppliers
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='suppliers' AND column_name='etablissement_id') THEN
    ALTER TABLE public.suppliers ADD COLUMN etablissement_id UUID REFERENCES public.etablissements(id);
    UPDATE public.suppliers SET etablissement_id = bm_id WHERE etablissement_id IS NULL;
    ALTER TABLE public.suppliers ALTER COLUMN etablissement_id SET NOT NULL;
    ALTER TABLE public.suppliers ALTER COLUMN etablissement_id SET DEFAULT bm_id;
  END IF;

END $$;

-- 4. Profils : ajouter accès multi-établissements
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS etablissements_access UUID[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_group_admin BOOLEAN NOT NULL DEFAULT false;

-- Backfill : admin actuel → group admin avec accès Bello Mio
UPDATE public.profiles
SET is_group_admin = true,
    etablissements_access = ARRAY[(SELECT id FROM public.etablissements WHERE slug = 'bello_mio')]
WHERE role = 'admin' AND is_group_admin = false;

-- Non-admins : accès Bello Mio par défaut
UPDATE public.profiles
SET etablissements_access = ARRAY[(SELECT id FROM public.etablissements WHERE slug = 'bello_mio')]
WHERE etablissements_access = '{}' OR etablissements_access IS NULL;

-- 5. Index pour les requêtes filtrées par établissement
CREATE INDEX IF NOT EXISTS idx_ingredients_etab ON public.ingredients(etablissement_id);
CREATE INDEX IF NOT EXISTS idx_pizza_recipes_etab ON public.pizza_recipes(etablissement_id);
CREATE INDEX IF NOT EXISTS idx_kitchen_recipes_etab ON public.kitchen_recipes(etablissement_id);
CREATE INDEX IF NOT EXISTS idx_prep_recipes_etab ON public.prep_recipes(etablissement_id);
CREATE INDEX IF NOT EXISTS idx_cocktails_etab ON public.cocktails(etablissement_id);
CREATE INDEX IF NOT EXISTS idx_recipes_etab ON public.recipes(etablissement_id);
CREATE INDEX IF NOT EXISTS idx_events_etab ON public.events(etablissement_id);
CREATE INDEX IF NOT EXISTS idx_commande_sessions_etab ON public.commande_sessions(etablissement_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_etab ON public.suppliers(etablissement_id);

-- 6. Helper function : check if user has access to an establishment
CREATE OR REPLACE FUNCTION public.user_has_etab_access(etab_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND (is_group_admin = true OR etab_id = ANY(etablissements_access))
  );
$$;
