-- Add ball_weight_g and empatement to kitchen_recipes for pizza fiches
ALTER TABLE kitchen_recipes ADD COLUMN IF NOT EXISTS ball_weight_g integer;
ALTER TABLE kitchen_recipes ADD COLUMN IF NOT EXISTS empatement text;

-- Add missing beverage categories (Mocktail, Spritz, Soft)
INSERT INTO categories (nom, slug, couleur, famille_id, sous_categories, sort_order)
VALUES
  ('Mocktail', 'mocktail', '#6B8E6B', 'soft', '{}', 10),
  ('Spritz', 'spritz', '#E8A04C', 'cocktail', '{}', 11),
  ('Soft', 'soft', '#5B9BD5', 'soft', '{}', 12)
ON CONFLICT DO NOTHING;

-- Enable RLS policies for familles and categories
ALTER TABLE familles ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'familles' AND policyname = 'familles_read_authenticated') THEN
    CREATE POLICY familles_read_authenticated ON familles FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'categories' AND policyname = 'categories_read_authenticated') THEN
    CREATE POLICY categories_read_authenticated ON categories FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'categories' AND policyname = 'categories_write_authenticated') THEN
    CREATE POLICY categories_write_authenticated ON categories FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
