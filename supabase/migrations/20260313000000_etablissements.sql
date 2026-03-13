-- Migration: établissements + multi-site setup
-- Date: 2026-03-13
-- Appliquée manuellement via SQL Editor

-- Table etablissements
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

-- Colonnes etablissement_id sur toutes les tables recettes
ALTER TABLE ingredients
  ADD COLUMN IF NOT EXISTS etablissement_id UUID REFERENCES etablissements(id),
  ADD COLUMN IF NOT EXISTS shared BOOLEAN DEFAULT false;

ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS etablissement_id UUID REFERENCES etablissements(id);

ALTER TABLE pizza_recipes
  ADD COLUMN IF NOT EXISTS etablissement_id UUID REFERENCES etablissements(id);

ALTER TABLE kitchen_recipes
  ADD COLUMN IF NOT EXISTS etablissement_id UUID REFERENCES etablissements(id);

ALTER TABLE cocktails
  ADD COLUMN IF NOT EXISTS etablissement_id UUID REFERENCES etablissements(id);

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS etablissement_id UUID REFERENCES etablissements(id);

ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS etablissement_id UUID REFERENCES etablissements(id);

-- Profils multi-site
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_group_admin BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS etablissements_access UUID[] DEFAULT '{}';

-- Backfill tout vers Bello Mio
DO $$
DECLARE bello_id UUID;
BEGIN
  SELECT id INTO bello_id FROM etablissements WHERE slug = 'bello_mio';
  UPDATE ingredients SET etablissement_id = bello_id WHERE etablissement_id IS NULL;
  UPDATE recipes SET etablissement_id = bello_id WHERE etablissement_id IS NULL;
  UPDATE pizza_recipes SET etablissement_id = bello_id WHERE etablissement_id IS NULL;
  UPDATE kitchen_recipes SET etablissement_id = bello_id WHERE etablissement_id IS NULL;
  UPDATE cocktails SET etablissement_id = bello_id WHERE etablissement_id IS NULL;
  UPDATE events SET etablissement_id = bello_id WHERE etablissement_id IS NULL;
  UPDATE suppliers SET etablissement_id = bello_id WHERE etablissement_id IS NULL;
END $$;

-- Ingrédients partagés
UPDATE ingredients SET shared = true
  WHERE name ILIKE ANY(ARRAY[
    '%huile%', '%mozzarella%', '%parmesan%',
    '%sel%', '%poivre%', '%farine%', '%sucre%',
    '%levure%', '%beurre%', '%lait%', '%crème%',
    '%ail%', '%oignon%', '%basilic%', '%origan%',
    '%tomate%', '%vinaigre%'
  ]);

-- Commandes fournisseurs
CREATE TABLE IF NOT EXISTS commande_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID REFERENCES suppliers(id) NOT NULL,
  etablissement_id UUID REFERENCES etablissements(id),
  status TEXT DEFAULT 'brouillon' CHECK (status IN ('brouillon','validee','envoyee','recue','annulee')),
  notes TEXT,
  total_ht NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES profiles(id)
);

CREATE TABLE IF NOT EXISTS commande_lignes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES commande_sessions(id) ON DELETE CASCADE NOT NULL,
  ingredient_id UUID REFERENCES ingredients(id) NOT NULL,
  quantite NUMERIC(10,3) NOT NULL DEFAULT 0,
  unite TEXT,
  prix_unitaire_ht NUMERIC(10,4),
  total_ligne_ht NUMERIC(10,2),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Admin : accès groupe
UPDATE profiles SET
  is_group_admin = true,
  etablissements_access = ARRAY[
    (SELECT id FROM etablissements WHERE slug = 'bello_mio')
  ]
WHERE role = 'admin';
