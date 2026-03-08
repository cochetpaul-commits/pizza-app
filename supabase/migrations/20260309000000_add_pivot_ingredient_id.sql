-- Mode Production: add pivot_ingredient_id to all recipe tables
ALTER TABLE public.kitchen_recipes ADD COLUMN IF NOT EXISTS pivot_ingredient_id UUID REFERENCES ingredients(id) ON DELETE SET NULL;
ALTER TABLE public.pizza_recipes   ADD COLUMN IF NOT EXISTS pivot_ingredient_id UUID REFERENCES ingredients(id) ON DELETE SET NULL;
ALTER TABLE public.cocktails        ADD COLUMN IF NOT EXISTS pivot_ingredient_id UUID REFERENCES ingredients(id) ON DELETE SET NULL;
-- recipes (empâtement) uses virtual IDs ("flour","water"…) — stored as TEXT
ALTER TABLE public.recipes          ADD COLUMN IF NOT EXISTS pivot_ingredient_id TEXT;
