-- Couleur identitaire par entité (fournisseurs, établissements, catégories recettes)
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS color TEXT;
ALTER TABLE public.etablissements ADD COLUMN IF NOT EXISTS color TEXT;

-- Table pour les couleurs de catégories de recettes (pizza, entrée, plat, etc.)
CREATE TABLE IF NOT EXISTS public.recipe_category_colors (
  category TEXT PRIMARY KEY,
  color TEXT NOT NULL
);

-- Valeurs par défaut
INSERT INTO public.recipe_category_colors (category, color) VALUES
  ('pizza',          '#D4775A'),
  ('entree',         '#2DAA6B'),
  ('plat',           '#2255CC'),
  ('dessert',        '#E84B8A'),
  ('sauce',          '#E83B2A'),
  ('preparation',    '#7A3DB8'),
  ('empatement',     '#F5A623'),
  ('cocktail',       '#1A9AA0'),
  ('accompagnement', '#8B9A3A')
ON CONFLICT (category) DO NOTHING;

-- RLS : authenticated access (comme les autres tables partagées)
ALTER TABLE public.recipe_category_colors ENABLE ROW LEVEL SECURITY;
CREATE POLICY recipe_category_colors_authenticated_all
  ON public.recipe_category_colors FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
