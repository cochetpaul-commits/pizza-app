-- Migration: Combo presence imports (feuilles d'émargement)
-- Tables pour stocker les imports hebdomadaires depuis Combo

-- Table: combo_imports (métadonnées de chaque fichier importé)
CREATE TABLE IF NOT EXISTS public.combo_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  etablissement_id UUID REFERENCES public.etablissements(id) NOT NULL,
  uploaded_by UUID NOT NULL,
  periode_debut DATE NOT NULL,
  periode_fin DATE NOT NULL,
  equipe TEXT,
  source_file_name TEXT NOT NULL,
  raw_text TEXT,
  nb_employes INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(etablissement_id, periode_debut, periode_fin, equipe)
);

ALTER TABLE public.combo_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "combo_imports: select with access"
  ON public.combo_imports FOR SELECT
  USING (public.user_has_etablissement_access(etablissement_id));

CREATE POLICY "combo_imports: insert with access"
  ON public.combo_imports FOR INSERT
  WITH CHECK (public.user_has_etablissement_access(etablissement_id));

CREATE POLICY "combo_imports: delete admin"
  ON public.combo_imports FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_group_admin = TRUE));

-- Table: combo_presences (une ligne par employé par semaine)
CREATE TABLE IF NOT EXISTS public.combo_presences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  combo_import_id UUID REFERENCES public.combo_imports(id) ON DELETE CASCADE NOT NULL,
  etablissement_id UUID REFERENCES public.etablissements(id) NOT NULL,
  employe_id UUID REFERENCES public.employes(id),
  combo_nom TEXT NOT NULL,
  equipe TEXT,
  periode_debut DATE NOT NULL,
  periode_fin DATE NOT NULL,
  heures_planifiees NUMERIC NOT NULL DEFAULT 0,
  heures_travaillees NUMERIC NOT NULL DEFAULT 0,
  heures_contrat NUMERIC NOT NULL DEFAULT 0,
  nb_repas INT NOT NULL DEFAULT 0,
  nb_jours_travailles INT NOT NULL DEFAULT 0,
  ecart_total NUMERIC DEFAULT 0,
  detail_jours JSONB,
  matched BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(combo_import_id, combo_nom)
);

ALTER TABLE public.combo_presences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "combo_presences: select with access"
  ON public.combo_presences FOR SELECT
  USING (public.user_has_etablissement_access(etablissement_id));

CREATE POLICY "combo_presences: insert with access"
  ON public.combo_presences FOR INSERT
  WITH CHECK (public.user_has_etablissement_access(etablissement_id));

CREATE POLICY "combo_presences: update with access"
  ON public.combo_presences FOR UPDATE
  USING (public.user_has_etablissement_access(etablissement_id));

CREATE POLICY "combo_presences: delete via import"
  ON public.combo_presences FOR DELETE
  USING (public.user_has_etablissement_access(etablissement_id));

CREATE INDEX IF NOT EXISTS idx_combo_presences_employe ON public.combo_presences(employe_id);
CREATE INDEX IF NOT EXISTS idx_combo_presences_periode ON public.combo_presences(periode_debut, periode_fin);
CREATE INDEX IF NOT EXISTS idx_combo_presences_import ON public.combo_presences(combo_import_id);
