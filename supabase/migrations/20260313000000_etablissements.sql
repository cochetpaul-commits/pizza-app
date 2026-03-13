-- Migration: établissements + multi-site setup
-- Date: 2026-03-13

CREATE TABLE IF NOT EXISTS etablissements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  nom TEXT NOT NULL,
  adresse TEXT,
  telephone TEXT,
  email TEXT,
  popina_location_id TEXT,
  couleur TEXT DEFAULT '#D4775A',
  actif BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO etablissements (slug, nom, popina_location_id, couleur)
VALUES ('bello_mio', 'Bello Mio',
  'd7442cfe-0305-4885-be9c-4853b9a3a2c2', '#D4775A')
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE ingredients
  ADD COLUMN IF NOT EXISTS etablissement_id UUID REFERENCES etablissements(id),
  ADD COLUMN IF NOT EXISTS shared BOOLEAN DEFAULT false;

ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS etablissement_id UUID REFERENCES etablissements(id);

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS etablissement_id UUID REFERENCES etablissements(id);

ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS etablissement_id UUID REFERENCES etablissements(id);

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_group_admin BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS etablissements_access UUID[] DEFAULT '{}';

-- Backfill
UPDATE ingredients SET etablissement_id =
  (SELECT id FROM etablissements WHERE slug = 'bello_mio')
  WHERE etablissement_id IS NULL;

UPDATE recipes SET etablissement_id =
  (SELECT id FROM etablissements WHERE slug = 'bello_mio')
  WHERE etablissement_id IS NULL;

UPDATE events SET etablissement_id =
  (SELECT id FROM etablissements WHERE slug = 'bello_mio')
  WHERE etablissement_id IS NULL;

UPDATE suppliers SET etablissement_id =
  (SELECT id FROM etablissements WHERE slug = 'bello_mio')
  WHERE etablissement_id IS NULL;

-- Ingrédients partagés
UPDATE ingredients SET shared = true
  WHERE name ILIKE ANY(ARRAY[
    '%huile%', '%mozzarella%', '%parmesan%',
    '%sel%', '%poivre%', '%farine%', '%sucre%',
    '%levure%', '%beurre%', '%lait%', '%crème%',
    '%ail%', '%oignon%', '%basilic%', '%origan%',
    '%tomate%', '%vinaigre%'
  ]);

-- Admin Paul
UPDATE profiles SET
  is_group_admin = true,
  etablissements_access = ARRAY[
    (SELECT id FROM etablissements WHERE slug = 'bello_mio')
  ]
WHERE role = 'admin';
