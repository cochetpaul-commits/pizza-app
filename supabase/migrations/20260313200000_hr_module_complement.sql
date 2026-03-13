-- ============================================================
-- HR MODULE — Complément : colonnes manquantes + emojis postes
-- (Idempotent — safe to re-run)
-- ============================================================

-- 1. Colonnes manquantes sur employes
ALTER TABLE public.employes
  ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'employe',
  ADD COLUMN IF NOT EXISTS equipes_access TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS affichage_planning BOOLEAN DEFAULT TRUE;

-- 2. Colonne signature_url sur shifts
ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS signature_url TEXT;

-- 3. Table signatures (pour Yousign)
CREATE TABLE IF NOT EXISTS public.signatures (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_ids     UUID[],
  employe_id    UUID REFERENCES public.employes(id),
  periode_debut DATE,
  periode_fin   DATE,
  yousign_id    TEXT,
  statut        TEXT DEFAULT 'en_attente'
    CHECK (statut IN ('en_attente','signe','refuse','expire')),
  pdf_url       TEXT,
  pdf_signe_url TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.signatures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "signatures: select via employe" ON public.signatures;
CREATE POLICY "signatures: select via employe"
  ON public.signatures FOR SELECT
  USING (
    employe_id IN (
      SELECT id FROM public.employes
      WHERE public.user_has_etablissement_access(etablissement_id)
    )
  );

DROP POLICY IF EXISTS "signatures: insert with access" ON public.signatures;
CREATE POLICY "signatures: insert with access"
  ON public.signatures FOR INSERT
  WITH CHECK (
    employe_id IN (
      SELECT id FROM public.employes
      WHERE public.user_has_etablissement_access(etablissement_id)
    )
  );

DROP POLICY IF EXISTS "signatures: update with access" ON public.signatures;
CREATE POLICY "signatures: update with access"
  ON public.signatures FOR UPDATE
  USING (
    employe_id IN (
      SELECT id FROM public.employes
      WHERE public.user_has_etablissement_access(etablissement_id)
    )
  );

-- 4. Corriger emojis + couleurs sur les postes existants
DO $$
DECLARE
  bellomio_id UUID;
BEGIN
  SELECT id INTO bellomio_id FROM public.etablissements WHERE slug = 'bello_mio';

  -- Cuisine
  UPDATE public.postes SET emoji = '✏️'  WHERE etablissement_id = bellomio_id AND equipe = 'Cuisine' AND nom = 'Bureau';
  UPDATE public.postes SET emoji = '🔥'  WHERE etablissement_id = bellomio_id AND equipe = 'Cuisine' AND nom = 'Chaud';
  UPDATE public.postes SET emoji = '🧊'  WHERE etablissement_id = bellomio_id AND equipe = 'Cuisine' AND nom = 'Froid';
  UPDATE public.postes SET emoji = '🔬'  WHERE etablissement_id = bellomio_id AND equipe = 'Cuisine' AND nom = 'Labo';
  UPDATE public.postes SET emoji = '🍝'  WHERE etablissement_id = bellomio_id AND equipe = 'Cuisine' AND nom = 'Pasta';
  UPDATE public.postes SET emoji = '🍕', couleur = '#E07070' WHERE etablissement_id = bellomio_id AND equipe = 'Cuisine' AND nom = 'Pizza';
  UPDATE public.postes SET emoji = '🧹'  WHERE etablissement_id = bellomio_id AND equipe = 'Cuisine' AND nom = 'Plonge';

  -- Ajouter Salle en Cuisine s'il n'existe pas
  INSERT INTO public.postes (etablissement_id, equipe, nom, couleur, emoji)
  SELECT bellomio_id, 'Cuisine', 'Salle', '#A9CCE3', '🪑'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.postes WHERE etablissement_id = bellomio_id AND equipe = 'Cuisine' AND nom = 'Salle'
  );

  -- Salle
  UPDATE public.postes SET emoji = '🧑‍🤝‍🧑' WHERE etablissement_id = bellomio_id AND equipe = 'Salle' AND nom = 'Floor';
  UPDATE public.postes SET emoji = '🍸'  WHERE etablissement_id = bellomio_id AND equipe = 'Salle' AND nom = 'Bar';
  UPDATE public.postes SET emoji = '✏️'  WHERE etablissement_id = bellomio_id AND equipe = 'Salle' AND nom = 'Bureau';
  UPDATE public.postes SET emoji = '🧊'  WHERE etablissement_id = bellomio_id AND equipe = 'Salle' AND nom = 'Froid';
  UPDATE public.postes SET emoji = '🍕', couleur = '#E07070' WHERE etablissement_id = bellomio_id AND equipe = 'Salle' AND nom = 'Pizza';
  UPDATE public.postes SET emoji = '🧹'  WHERE etablissement_id = bellomio_id AND equipe = 'Salle' AND nom = 'Plonge';
  UPDATE public.postes SET emoji = '🏃'  WHERE etablissement_id = bellomio_id AND equipe = 'Salle' AND nom = 'Run C.';
  UPDATE public.postes SET emoji = '🏃'  WHERE etablissement_id = bellomio_id AND equipe = 'Salle' AND nom = 'Run O.';
  UPDATE public.postes SET emoji = '🪑'  WHERE etablissement_id = bellomio_id AND equipe = 'Salle' AND nom = 'Salle';
END;
$$;
