-- ============================================================
-- HR MODULE — Étape 1 : Tables, RLS, Seed postes
-- ============================================================

-- ============================================================
-- 0. Enrichir la table etablissements existante (colonnes HR)
-- ============================================================
ALTER TABLE public.etablissements
  ADD COLUMN IF NOT EXISTS convention TEXT DEFAULT 'HCR_1979',
  ADD COLUMN IF NOT EXISTS code_ape TEXT,
  ADD COLUMN IF NOT EXISTS siret TEXT,
  ADD COLUMN IF NOT EXISTS medecin_travail TEXT,
  ADD COLUMN IF NOT EXISTS pause_defaut_minutes INT DEFAULT 30,
  ADD COLUMN IF NOT EXISTS duree_min_shift_pause INTERVAL DEFAULT '3 hours',
  ADD COLUMN IF NOT EXISTS objectif_cout_ventes NUMERIC DEFAULT 37,
  ADD COLUMN IF NOT EXISTS objectif_productivite NUMERIC DEFAULT 50,
  ADD COLUMN IF NOT EXISTS cotisations_patronales NUMERIC DEFAULT 35,
  ADD COLUMN IF NOT EXISTS ajouter_cp_taux_horaire BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS base_calcul_cp NUMERIC DEFAULT 6,
  ADD COLUMN IF NOT EXISTS acquisition_mensuelle_cp NUMERIC DEFAULT 2.5,
  ADD COLUMN IF NOT EXISTS type_indemnisation_repas TEXT DEFAULT 'AN',
  ADD COLUMN IF NOT EXISTS valeur_avantage_nature NUMERIC DEFAULT 3.57;

-- Contrainte convention
DO $$ BEGIN
  ALTER TABLE public.etablissements
    ADD CONSTRAINT chk_convention CHECK (convention IN ('HCR_1979', 'RAPIDE_1501'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.etablissements ENABLE ROW LEVEL SECURITY;

-- Seed Piccola Mia si absente
INSERT INTO public.etablissements (nom, slug, convention)
VALUES ('Piccola Mia', 'piccola', 'RAPIDE_1501')
ON CONFLICT (slug) DO NOTHING;

-- Mettre à jour Bello Mio avec la convention HCR
UPDATE public.etablissements SET convention = 'HCR_1979' WHERE slug = 'bello_mio';

-- Ajouter etablissements_access au profil (array d'UUIDs)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS etablissements_access UUID[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_group_admin BOOLEAN DEFAULT FALSE;

-- ============================================================
-- Helper : vérifier accès établissement
-- ============================================================
CREATE OR REPLACE FUNCTION public.user_has_etablissement_access(etab_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND (
      is_group_admin = TRUE
      OR etab_id = ANY(etablissements_access)
    )
  );
$$;

-- ============================================================
-- RLS etablissements : lecture si accès ou group_admin
-- ============================================================
CREATE POLICY "etablissements: select with access"
  ON public.etablissements FOR SELECT
  USING (public.user_has_etablissement_access(id));

CREATE POLICY "etablissements: admin full access"
  ON public.etablissements FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_group_admin = TRUE
    )
  );

-- ============================================================
-- 1. Table employes
-- ============================================================
CREATE TABLE public.employes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  etablissement_id UUID REFERENCES public.etablissements(id) NOT NULL,
  prenom TEXT NOT NULL,
  nom TEXT NOT NULL,
  initiales TEXT,
  email TEXT,
  tel_mobile TEXT,
  tel_fixe TEXT,
  adresse TEXT,
  code_postal TEXT,
  ville TEXT,
  genre TEXT,
  date_naissance DATE,
  lieu_naissance TEXT,
  departement_naissance TEXT,
  nationalite TEXT DEFAULT 'France',
  situation_familiale TEXT,
  nb_personnes_charge INT DEFAULT 0,
  contact_urgence_prenom TEXT,
  contact_urgence_nom TEXT,
  contact_urgence_lien TEXT,
  contact_urgence_tel TEXT,
  numero_secu TEXT,
  handicap BOOLEAN DEFAULT FALSE,
  type_handicap TEXT,
  date_visite_medicale DATE,
  visite_renforcee BOOLEAN DEFAULT FALSE,
  prochaine_visite_medicale DATE,
  iban TEXT,
  bic TEXT,
  titulaire_compte TEXT,
  matricule TEXT, -- format '00001', 5 chiffres zéro-padded
  date_anciennete DATE,
  travailleur_etranger BOOLEAN DEFAULT FALSE,
  avatar_url TEXT,
  actif BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.employes ENABLE ROW LEVEL SECURITY;

-- Auto-générer les initiales
CREATE OR REPLACE FUNCTION public.generate_initiales()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.initiales IS NULL OR NEW.initiales = '' THEN
    NEW.initiales := UPPER(LEFT(NEW.prenom, 1) || LEFT(NEW.nom, 1));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_employes_initiales
  BEFORE INSERT OR UPDATE ON public.employes
  FOR EACH ROW EXECUTE FUNCTION public.generate_initiales();

-- RLS employes
CREATE POLICY "employes: select with access"
  ON public.employes FOR SELECT
  USING (public.user_has_etablissement_access(etablissement_id));

CREATE POLICY "employes: insert with access"
  ON public.employes FOR INSERT
  WITH CHECK (public.user_has_etablissement_access(etablissement_id));

CREATE POLICY "employes: update with access"
  ON public.employes FOR UPDATE
  USING (public.user_has_etablissement_access(etablissement_id));

CREATE POLICY "employes: delete admin only"
  ON public.employes FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_group_admin = TRUE
    )
  );

-- ============================================================
-- 2. Table contrats
-- ============================================================
CREATE TABLE public.contrats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id UUID REFERENCES public.employes(id) NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('CDI','CDD','extra','interim','apprenti','stagiaire')),
  date_debut DATE NOT NULL,
  date_fin DATE, -- nullable pour CDI
  remuneration NUMERIC NOT NULL, -- salaire brut mensuel
  emploi TEXT,
  qualification TEXT,
  heures_semaine NUMERIC NOT NULL,
  jours_semaine INT DEFAULT 5,
  actif BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.contrats ENABLE ROW LEVEL SECURITY;

-- RLS contrats : accès via employe_id → employes.etablissement_id
CREATE POLICY "contrats: select via employe"
  ON public.contrats FOR SELECT
  USING (
    employe_id IN (
      SELECT id FROM public.employes
      WHERE public.user_has_etablissement_access(etablissement_id)
    )
  );

CREATE POLICY "contrats: insert via employe"
  ON public.contrats FOR INSERT
  WITH CHECK (
    employe_id IN (
      SELECT id FROM public.employes
      WHERE public.user_has_etablissement_access(etablissement_id)
    )
  );

CREATE POLICY "contrats: update via employe"
  ON public.contrats FOR UPDATE
  USING (
    employe_id IN (
      SELECT id FROM public.employes
      WHERE public.user_has_etablissement_access(etablissement_id)
    )
  );

CREATE POLICY "contrats: delete admin only"
  ON public.contrats FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_group_admin = TRUE
    )
  );

-- ============================================================
-- 3. Table contrat_elements
-- ============================================================
CREATE TABLE public.contrat_elements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrat_id UUID REFERENCES public.contrats(id) NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('prime','transport','acompte','mutuelle_dispense')),
  libelle TEXT NOT NULL,
  montant NUMERIC,
  code_silae TEXT,
  date_debut DATE,
  date_fin DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.contrat_elements ENABLE ROW LEVEL SECURITY;

-- RLS contrat_elements : accès via contrat → employe → etablissement
CREATE POLICY "contrat_elements: select via contrat"
  ON public.contrat_elements FOR SELECT
  USING (
    contrat_id IN (
      SELECT c.id FROM public.contrats c
      JOIN public.employes e ON e.id = c.employe_id
      WHERE public.user_has_etablissement_access(e.etablissement_id)
    )
  );

CREATE POLICY "contrat_elements: insert via contrat"
  ON public.contrat_elements FOR INSERT
  WITH CHECK (
    contrat_id IN (
      SELECT c.id FROM public.contrats c
      JOIN public.employes e ON e.id = c.employe_id
      WHERE public.user_has_etablissement_access(e.etablissement_id)
    )
  );

CREATE POLICY "contrat_elements: update via contrat"
  ON public.contrat_elements FOR UPDATE
  USING (
    contrat_id IN (
      SELECT c.id FROM public.contrats c
      JOIN public.employes e ON e.id = c.employe_id
      WHERE public.user_has_etablissement_access(e.etablissement_id)
    )
  );

CREATE POLICY "contrat_elements: delete admin only"
  ON public.contrat_elements FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_group_admin = TRUE
    )
  );

-- ============================================================
-- 4. Table postes (étiquettes de planning)
-- ============================================================
CREATE TABLE public.postes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  etablissement_id UUID REFERENCES public.etablissements(id) NOT NULL,
  equipe TEXT NOT NULL CHECK (equipe IN ('Cuisine','Salle','Shop')),
  nom TEXT NOT NULL,
  couleur TEXT NOT NULL, -- hex
  emoji TEXT,
  actif BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.postes ENABLE ROW LEVEL SECURITY;

-- RLS postes
CREATE POLICY "postes: select with access"
  ON public.postes FOR SELECT
  USING (public.user_has_etablissement_access(etablissement_id));

CREATE POLICY "postes: insert with access"
  ON public.postes FOR INSERT
  WITH CHECK (public.user_has_etablissement_access(etablissement_id));

CREATE POLICY "postes: update with access"
  ON public.postes FOR UPDATE
  USING (public.user_has_etablissement_access(etablissement_id));

CREATE POLICY "postes: delete admin only"
  ON public.postes FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_group_admin = TRUE
    )
  );

-- ============================================================
-- 5. Table shifts
-- ============================================================
CREATE TABLE public.shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id UUID REFERENCES public.employes(id) NOT NULL,
  etablissement_id UUID REFERENCES public.etablissements(id) NOT NULL,
  poste_id UUID REFERENCES public.postes(id),
  date DATE NOT NULL,
  heure_debut TIME NOT NULL,
  heure_fin TIME NOT NULL,
  pause_minutes INT DEFAULT 30,
  note TEXT,
  statut TEXT DEFAULT 'brouillon' CHECK (statut IN ('brouillon','publié','validé')),
  heures_reelles_debut TIME,
  heures_reelles_fin TIME,
  pause_reelle_minutes INT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;

-- RLS shifts
CREATE POLICY "shifts: select with access"
  ON public.shifts FOR SELECT
  USING (public.user_has_etablissement_access(etablissement_id));

CREATE POLICY "shifts: insert with access"
  ON public.shifts FOR INSERT
  WITH CHECK (public.user_has_etablissement_access(etablissement_id));

CREATE POLICY "shifts: update with access"
  ON public.shifts FOR UPDATE
  USING (public.user_has_etablissement_access(etablissement_id));

CREATE POLICY "shifts: delete with access"
  ON public.shifts FOR DELETE
  USING (public.user_has_etablissement_access(etablissement_id));

-- Index pour requêtes planning
CREATE INDEX idx_shifts_date ON public.shifts(date);
CREATE INDEX idx_shifts_employe_date ON public.shifts(employe_id, date);
CREATE INDEX idx_shifts_etablissement_date ON public.shifts(etablissement_id, date);

-- ============================================================
-- 6. Table absences
-- ============================================================
CREATE TABLE public.absences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id UUID REFERENCES public.employes(id) NOT NULL,
  etablissement_id UUID REFERENCES public.etablissements(id) NOT NULL,
  date_debut DATE NOT NULL,
  date_fin DATE NOT NULL,
  type TEXT NOT NULL CHECK (type IN (
    'CP','maladie','RTT','absence_injustifiee','ferie',
    'repos_compensateur','formation','evenement_familial'
  )),
  nb_jours NUMERIC,
  statut TEXT DEFAULT 'approuvé' CHECK (statut IN ('demande','approuvé','refusé')),
  code_silae TEXT,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.absences ENABLE ROW LEVEL SECURITY;

-- RLS absences
CREATE POLICY "absences: select with access"
  ON public.absences FOR SELECT
  USING (public.user_has_etablissement_access(etablissement_id));

CREATE POLICY "absences: insert with access"
  ON public.absences FOR INSERT
  WITH CHECK (public.user_has_etablissement_access(etablissement_id));

CREATE POLICY "absences: update with access"
  ON public.absences FOR UPDATE
  USING (public.user_has_etablissement_access(etablissement_id));

CREATE POLICY "absences: delete with access"
  ON public.absences FOR DELETE
  USING (public.user_has_etablissement_access(etablissement_id));

-- ============================================================
-- 7. Table compteurs_employe
-- ============================================================
CREATE TABLE public.compteurs_employe (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id UUID REFERENCES public.employes(id) NOT NULL,
  periode TEXT NOT NULL, -- 'YYYY-MM'
  heures_contractuelles NUMERIC,
  heures_travaillees NUMERIC,
  heures_normales NUMERIC,
  heures_comp_10 NUMERIC DEFAULT 0,
  heures_comp_25 NUMERIC DEFAULT 0,
  heures_supp_10 NUMERIC DEFAULT 0,
  heures_supp_20 NUMERIC DEFAULT 0,
  heures_supp_25 NUMERIC DEFAULT 0,
  heures_supp_50 NUMERIC DEFAULT 0,
  jours_feries_travailles NUMERIC DEFAULT 0,
  jours_travailles INT DEFAULT 0,
  solde_rc NUMERIC DEFAULT 0,
  nb_repas INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(employe_id, periode)
);

ALTER TABLE public.compteurs_employe ENABLE ROW LEVEL SECURITY;

-- RLS compteurs_employe : accès via employe → etablissement
CREATE POLICY "compteurs_employe: select via employe"
  ON public.compteurs_employe FOR SELECT
  USING (
    employe_id IN (
      SELECT id FROM public.employes
      WHERE public.user_has_etablissement_access(etablissement_id)
    )
  );

CREATE POLICY "compteurs_employe: insert via employe"
  ON public.compteurs_employe FOR INSERT
  WITH CHECK (
    employe_id IN (
      SELECT id FROM public.employes
      WHERE public.user_has_etablissement_access(etablissement_id)
    )
  );

CREATE POLICY "compteurs_employe: update via employe"
  ON public.compteurs_employe FOR UPDATE
  USING (
    employe_id IN (
      SELECT id FROM public.employes
      WHERE public.user_has_etablissement_access(etablissement_id)
    )
  );

CREATE POLICY "compteurs_employe: delete admin only"
  ON public.compteurs_employe FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_group_admin = TRUE
    )
  );

-- ============================================================
-- SEED : Postes Bello Mio (Cuisine + Salle)
-- ============================================================
DO $$
DECLARE
  bellomio_id UUID;
BEGIN
  SELECT id INTO bellomio_id FROM public.etablissements WHERE slug = 'bello_mio';

  -- Cuisine
  INSERT INTO public.postes (etablissement_id, equipe, nom, couleur, emoji) VALUES
    (bellomio_id, 'Cuisine', 'Bureau',  '#9B8EC4', NULL),
    (bellomio_id, 'Cuisine', 'Chaud',   '#E8A87C', '🔥'),
    (bellomio_id, 'Cuisine', 'Froid',   '#7EC8A4', '🧊'),
    (bellomio_id, 'Cuisine', 'Labo',    '#B8D4E8', NULL),
    (bellomio_id, 'Cuisine', 'Pasta',   '#F4D03F', '🍝'),
    (bellomio_id, 'Cuisine', 'Pizza',   '#E74C3C', '🍕'),
    (bellomio_id, 'Cuisine', 'Plonge',  '#95A5A6', '🧹');

  -- Salle
  INSERT INTO public.postes (etablissement_id, equipe, nom, couleur, emoji) VALUES
    (bellomio_id, 'Salle', 'Bar',     '#F1948A', '🍸'),
    (bellomio_id, 'Salle', 'Bureau',  '#9B8EC4', NULL),
    (bellomio_id, 'Salle', 'Floor',   '#A8D8EA', '🧑‍🤝‍🧑'),
    (bellomio_id, 'Salle', 'Froid',   '#7EC8A4', NULL),
    (bellomio_id, 'Salle', 'Pizza',   '#E74C3C', NULL),
    (bellomio_id, 'Salle', 'Plonge',  '#95A5A6', NULL),
    (bellomio_id, 'Salle', 'Run C.',  '#FAD7A0', NULL),
    (bellomio_id, 'Salle', 'Run O.',  '#FDEBD0', NULL),
    (bellomio_id, 'Salle', 'Salle',   '#A9CCE3', '🪑');
END;
$$;
