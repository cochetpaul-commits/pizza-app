-- ============================================================
-- HR MODULE — Étape 3 : Colonnes manquantes employes + seed employés
-- ============================================================

-- Colonnes dénormalisées pour affichage rapide dans la liste
ALTER TABLE public.employes
  ADD COLUMN IF NOT EXISTS equipe_access TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'employe'
    CHECK (role IN ('employe','manager','proprietaire')),
  ADD COLUMN IF NOT EXISTS poste_rh TEXT,
  ADD COLUMN IF NOT EXISTS contrat_type TEXT
    CHECK (contrat_type IN ('CDI','CDD','extra','interim','apprenti','stagiaire','TNS')),
  ADD COLUMN IF NOT EXISTS heures_semaine NUMERIC,
  ADD COLUMN IF NOT EXISTS nom_usage TEXT,
  ADD COLUMN IF NOT EXISTS civilite TEXT
    CHECK (civilite IN ('M','Mme'));

-- ============================================================
-- Seed employés Bello Mio
-- ============================================================
DO $$
DECLARE
  bello_mio_id UUID;
BEGIN
  SELECT id INTO bello_mio_id FROM public.etablissements WHERE slug = 'bellomio';

  INSERT INTO public.employes (
    etablissement_id, prenom, nom, matricule, equipe_access,
    role, actif, poste_rh, contrat_type, heures_semaine, date_anciennete
  ) VALUES
    (bello_mio_id, 'Jacques', 'TESSIER', '00001', ARRAY['Cuisine'],
      'manager', true, 'Agent de maîtrise', 'CDI', 43, '2025-10-01'),

    (bello_mio_id, 'Gwendal', 'BARBOT', '00046', ARRAY['Cuisine'],
      'employe', true, 'Cuisinier', 'CDI', 39, NULL),

    (bello_mio_id, 'Corentin', 'BODIN', '00013', ARRAY['Cuisine'],
      'employe', true, 'Pizzaïolo', 'CDI', 39, '2025-10-01'),

    (bello_mio_id, 'Ebrima', 'JALLOW', '00043', ARRAY['Cuisine'],
      'employe', true, 'Plongeur', 'CDI', 39, '2025-10-30'),

    (bello_mio_id, 'Théo', 'POULARD', '00045', ARRAY['Cuisine'],
      'employe', true, 'Cuisinier', 'CDI', 39, '2026-02-23'),

    (bello_mio_id, 'Alain', 'MERCIER', '00041', ARRAY['Cuisine'],
      'employe', false, 'Cuisinier', 'extra', NULL, NULL),

    (bello_mio_id, 'Elise', 'RONDEAU', '00031', ARRAY['Salle'],
      'employe', true, 'Chef de rang', 'CDI', 35, '2025-03-17'),

    (bello_mio_id, 'Rémy', 'GHESTIN', '00032', ARRAY['Salle'],
      'employe', true, 'Barman', 'CDI', 35, '2025-04-14'),

    (bello_mio_id, 'Rémy', 'BASSET', '00047', ARRAY['Salle'],
      'employe', true, 'Chef de rang', 'CDI', 35, NULL),

    -- TNS — sans matricule, sans contrat salarié
    (bello_mio_id, 'Paul', 'COCHET', NULL, ARRAY['Cuisine','Salle'],
      'proprietaire', true, 'Gérant', 'TNS', NULL, NULL),

    (bello_mio_id, 'Pierre', 'COCHET', NULL, ARRAY['Salle'],
      'proprietaire', true, 'Gérant', 'TNS', NULL, NULL);
END;
$$;
