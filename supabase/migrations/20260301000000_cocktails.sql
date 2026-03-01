-- Migration: tables cocktails et cocktail_ingredients
-- Created: 2026-03-01

CREATE TABLE IF NOT EXISTS public.cocktails (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name           text        NOT NULL,
  type           text        CHECK (type IN ('long_drink','short_drink','shot','mocktail','signature')),
  glass          text        CHECK (glass IN ('tumbler','coupe','flute','highball','martini','autre')),
  steps          text,
  garnish        text,
  sell_price     numeric(10,2),
  image_url      text,
  total_cost     numeric(10,4),
  is_draft       boolean     NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cocktails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cocktails: select own"  ON public.cocktails FOR SELECT  USING (user_id = auth.uid());
CREATE POLICY "cocktails: insert own"  ON public.cocktails FOR INSERT  WITH CHECK (user_id = auth.uid());
CREATE POLICY "cocktails: update own"  ON public.cocktails FOR UPDATE  USING (user_id = auth.uid());
CREATE POLICY "cocktails: delete own"  ON public.cocktails FOR DELETE  USING (user_id = auth.uid());


CREATE TABLE IF NOT EXISTS public.cocktail_ingredients (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cocktail_id   uuid        NOT NULL REFERENCES public.cocktails(id) ON DELETE CASCADE,
  ingredient_id uuid        NOT NULL REFERENCES public.ingredients(id) ON DELETE RESTRICT,
  qty           numeric(10,3) NOT NULL DEFAULT 0,
  unit          text        NOT NULL DEFAULT 'cl' CHECK (unit IN ('cl','ml','pc','g')),
  sort_order    integer     NOT NULL DEFAULT 0
);

ALTER TABLE public.cocktail_ingredients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cocktail_ingredients: select via cocktail"  ON public.cocktail_ingredients
  FOR SELECT  USING (cocktail_id IN (SELECT id FROM public.cocktails WHERE user_id = auth.uid()));

CREATE POLICY "cocktail_ingredients: insert via cocktail"  ON public.cocktail_ingredients
  FOR INSERT  WITH CHECK (cocktail_id IN (SELECT id FROM public.cocktails WHERE user_id = auth.uid()));

CREATE POLICY "cocktail_ingredients: update via cocktail"  ON public.cocktail_ingredients
  FOR UPDATE  USING (cocktail_id IN (SELECT id FROM public.cocktails WHERE user_id = auth.uid()));

CREATE POLICY "cocktail_ingredients: delete via cocktail"  ON public.cocktail_ingredients
  FOR DELETE  USING (cocktail_id IN (SELECT id FROM public.cocktails WHERE user_id = auth.uid()));
