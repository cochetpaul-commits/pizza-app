-- ============================================================
-- SEED EMPLOYÉS BELLO MIO + type TNS
-- (Idempotent — safe to re-run)
-- ============================================================

-- 1. Ajouter TNS au CHECK constraint de contrats
ALTER TABLE public.contrats DROP CONSTRAINT IF EXISTS contrats_type_check;
ALTER TABLE public.contrats ADD CONSTRAINT contrats_type_check
  CHECK (type IN ('CDI','CDD','extra','interim','apprenti','stagiaire','TNS'));

-- 2. Mettre à jour SIRET/APE/médecin sur Bello Mio
UPDATE public.etablissements SET
  siret = '91321738600014',
  code_ape = '5610A',
  medecin_travail = 'MT090'
WHERE slug = 'bello_mio';

-- 3. Insérer employés + contrats
DO $$
DECLARE
  bm UUID;
  emp_id UUID;
BEGIN
  SELECT id INTO bm FROM public.etablissements WHERE slug = 'bello_mio';
  IF bm IS NULL THEN RAISE EXCEPTION 'Bello Mio non trouvé'; END IF;

  -- ── Jacques TESSIER — Cuisine, CDI 43h, Agent de maîtrise ──
  IF NOT EXISTS (SELECT 1 FROM public.employes WHERE etablissement_id = bm AND nom = 'TESSIER' AND prenom = 'Jacques') THEN
    INSERT INTO public.employes (etablissement_id, prenom, nom, matricule, equipes_access, role, actif, date_anciennete)
    VALUES (bm, 'Jacques', 'TESSIER', '00001', '{"Cuisine"}', 'manager', true, '2025-10-01')
    RETURNING id INTO emp_id;
    INSERT INTO public.contrats (employe_id, type, date_debut, remuneration, emploi, qualification, heures_semaine, actif)
    VALUES (emp_id, 'CDI', '2025-10-01', 0, 'Agent de maîtrise', 'Agent de maîtrise', 43, true);
  END IF;

  -- ── Corentin BODIN — Cuisine, CDI 39h, Pizzaïolo ──
  IF NOT EXISTS (SELECT 1 FROM public.employes WHERE etablissement_id = bm AND nom = 'BODIN' AND prenom = 'Corentin') THEN
    INSERT INTO public.employes (etablissement_id, prenom, nom, matricule, equipes_access, role, actif, date_anciennete)
    VALUES (bm, 'Corentin', 'BODIN', '00013', '{"Cuisine"}', 'employe', true, '2025-10-01')
    RETURNING id INTO emp_id;
    INSERT INTO public.contrats (employe_id, type, date_debut, remuneration, emploi, heures_semaine, actif)
    VALUES (emp_id, 'CDI', '2025-10-01', 0, 'Pizzaïolo', 39, true);
  END IF;

  -- ── Gwendal BARBOT — Cuisine, CDI 39h, Cuisinier ──
  IF NOT EXISTS (SELECT 1 FROM public.employes WHERE etablissement_id = bm AND nom = 'BARBOT' AND prenom = 'Gwendal') THEN
    INSERT INTO public.employes (etablissement_id, prenom, nom, matricule, equipes_access, role, actif)
    VALUES (bm, 'Gwendal', 'BARBOT', '00046', '{"Cuisine"}', 'employe', true)
    RETURNING id INTO emp_id;
    INSERT INTO public.contrats (employe_id, type, date_debut, remuneration, emploi, heures_semaine, actif)
    VALUES (emp_id, 'CDI', '2025-10-01', 0, 'Cuisinier', 39, true);
  END IF;

  -- ── Ebrima JALLOW — Cuisine, CDI 39h, Plongeur ──
  IF NOT EXISTS (SELECT 1 FROM public.employes WHERE etablissement_id = bm AND nom = 'JALLOW' AND prenom = 'Ebrima') THEN
    INSERT INTO public.employes (etablissement_id, prenom, nom, matricule, equipes_access, role, actif, date_anciennete)
    VALUES (bm, 'Ebrima', 'JALLOW', '00043', '{"Cuisine"}', 'employe', true, '2025-10-30')
    RETURNING id INTO emp_id;
    INSERT INTO public.contrats (employe_id, type, date_debut, remuneration, emploi, heures_semaine, actif)
    VALUES (emp_id, 'CDI', '2025-10-30', 0, 'Plongeur', 39, true);
  END IF;

  -- ── Théo POULARD — Cuisine, CDI 39h, Cuisinier (entré 23/02/2026) ──
  IF NOT EXISTS (SELECT 1 FROM public.employes WHERE etablissement_id = bm AND nom = 'POULARD') THEN
    INSERT INTO public.employes (etablissement_id, prenom, nom, matricule, equipes_access, role, actif, date_anciennete)
    VALUES (bm, 'Théo', 'POULARD', '00045', '{"Cuisine"}', 'employe', true, '2026-02-23')
    RETURNING id INTO emp_id;
    INSERT INTO public.contrats (employe_id, type, date_debut, remuneration, emploi, heures_semaine, actif)
    VALUES (emp_id, 'CDI', '2026-02-23', 0, 'Cuisinier', 39, true);
  END IF;

  -- ── Alain MERCIER — Cuisine, Extra ──
  IF NOT EXISTS (SELECT 1 FROM public.employes WHERE etablissement_id = bm AND nom = 'MERCIER' AND prenom = 'Alain') THEN
    INSERT INTO public.employes (etablissement_id, prenom, nom, matricule, equipes_access, role, actif)
    VALUES (bm, 'Alain', 'MERCIER', '00041', '{"Cuisine"}', 'employe', true)
    RETURNING id INTO emp_id;
    INSERT INTO public.contrats (employe_id, type, date_debut, remuneration, emploi, heures_semaine, actif)
    VALUES (emp_id, 'extra', '2025-10-01', 0, 'Cuisinier', 0, true);
  END IF;

  -- ── Elise RONDEAU — Salle, CDI 35h, Chef de rang ──
  IF NOT EXISTS (SELECT 1 FROM public.employes WHERE etablissement_id = bm AND nom = 'RONDEAU') THEN
    INSERT INTO public.employes (etablissement_id, prenom, nom, matricule, equipes_access, role, actif, date_anciennete)
    VALUES (bm, 'Elise', 'RONDEAU', '00031', '{"Salle"}', 'employe', true, '2025-03-17')
    RETURNING id INTO emp_id;
    INSERT INTO public.contrats (employe_id, type, date_debut, remuneration, emploi, heures_semaine, actif)
    VALUES (emp_id, 'CDI', '2025-03-17', 0, 'Chef de rang', 35, true);
  END IF;

  -- ── Rémy GHESTIN — Salle, CDI 35h, Barman ──
  IF NOT EXISTS (SELECT 1 FROM public.employes WHERE etablissement_id = bm AND nom = 'GHESTIN') THEN
    INSERT INTO public.employes (etablissement_id, prenom, nom, matricule, equipes_access, role, actif, date_anciennete)
    VALUES (bm, 'Rémy', 'GHESTIN', '00032', '{"Salle"}', 'employe', true, '2025-04-14')
    RETURNING id INTO emp_id;
    INSERT INTO public.contrats (employe_id, type, date_debut, remuneration, emploi, heures_semaine, actif)
    VALUES (emp_id, 'CDI', '2025-04-14', 0, 'Barman', 35, true);
  END IF;

  -- ── Rémy BASSET — Salle, CDI 35h, Chef de rang ──
  IF NOT EXISTS (SELECT 1 FROM public.employes WHERE etablissement_id = bm AND nom = 'BASSET') THEN
    INSERT INTO public.employes (etablissement_id, prenom, nom, matricule, equipes_access, role, actif)
    VALUES (bm, 'Rémy', 'BASSET', '00047', '{"Salle"}', 'employe', true)
    RETURNING id INTO emp_id;
    INSERT INTO public.contrats (employe_id, type, date_debut, remuneration, emploi, heures_semaine, actif)
    VALUES (emp_id, 'CDI', '2026-01-01', 0, 'Chef de rang', 35, true);
  END IF;

  -- ── Paul COCHET — TNS Gérant, Cuisine+Salle ──
  IF NOT EXISTS (SELECT 1 FROM public.employes WHERE etablissement_id = bm AND nom = 'COCHET' AND prenom = 'Paul') THEN
    INSERT INTO public.employes (etablissement_id, prenom, nom, equipes_access, role, actif)
    VALUES (bm, 'Paul', 'COCHET', '{"Cuisine","Salle"}', 'proprietaire', true)
    RETURNING id INTO emp_id;
    INSERT INTO public.contrats (employe_id, type, date_debut, remuneration, emploi, heures_semaine, actif)
    VALUES (emp_id, 'TNS', '2025-01-01', 0, 'Gérant', 0, true);
  END IF;

  -- ── Pierre COCHET — TNS Gérant, Salle ──
  IF NOT EXISTS (SELECT 1 FROM public.employes WHERE etablissement_id = bm AND nom = 'COCHET' AND prenom = 'Pierre') THEN
    INSERT INTO public.employes (etablissement_id, prenom, nom, equipes_access, role, actif)
    VALUES (bm, 'Pierre', 'COCHET', '{"Salle"}', 'proprietaire', true)
    RETURNING id INTO emp_id;
    INSERT INTO public.contrats (employe_id, type, date_debut, remuneration, emploi, heures_semaine, actif)
    VALUES (emp_id, 'TNS', '2025-01-01', 0, 'Gérant', 0, true);
  END IF;

END;
$$;
