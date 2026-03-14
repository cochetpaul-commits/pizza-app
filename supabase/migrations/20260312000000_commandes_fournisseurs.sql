-- ============================================================
-- Commandes fournisseurs : tables, colonnes, RLS
-- ============================================================

-- 1. Table commande_sessions
CREATE TABLE public.commande_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fournisseur TEXT NOT NULL CHECK (fournisseur IN ('mael', 'metro')),
  statut TEXT NOT NULL DEFAULT 'brouillon'
    CHECK (statut IN ('brouillon', 'en_attente', 'valide', 'commande', 'recu')),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  validated_by UUID REFERENCES auth.users(id),
  semaine TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  validated_at TIMESTAMPTZ,
  ordered_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ
);

ALTER TABLE public.commande_sessions ENABLE ROW LEVEL SECURITY;

-- 2. Table commande_lignes
CREATE TABLE public.commande_lignes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.commande_sessions(id) ON DELETE CASCADE,
  ingredient_id UUID REFERENCES public.ingredients(id),
  nom_libre TEXT,
  categorie TEXT NOT NULL,
  quantite NUMERIC NOT NULL,
  unite TEXT NOT NULL,
  urgent BOOLEAN NOT NULL DEFAULT false,
  ajoute_par UUID NOT NULL REFERENCES auth.users(id),
  notes TEXT
);

ALTER TABLE public.commande_lignes ENABLE ROW LEVEL SECURITY;

-- 3. Table commande_historique
CREATE TABLE public.commande_historique (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fournisseur TEXT NOT NULL,
  ingredient_id UUID REFERENCES public.ingredients(id),
  nom_libre TEXT,
  quantite_habituelle NUMERIC NOT NULL,
  unite TEXT NOT NULL,
  frequence TEXT NOT NULL CHECK (frequence IN ('hebdo', 'bihebdo'))
);

ALTER TABLE public.commande_historique ENABLE ROW LEVEL SECURITY;

-- 4. Ajouter colonne fournisseurs sur ingredients
ALTER TABLE public.ingredients ADD COLUMN IF NOT EXISTS fournisseurs TEXT[];

-- ============================================================
-- RLS policies
-- ============================================================

-- commande_sessions --

-- Cuisine : lecture si brouillon
CREATE POLICY "cuisine_read_brouillon_sessions"
  ON public.commande_sessions FOR SELECT
  USING (
    statut = 'brouillon' AND public.user_role() = 'cuisine'
  );

-- Cuisine : insert brouillon
CREATE POLICY "cuisine_insert_brouillon_sessions"
  ON public.commande_sessions FOR INSERT
  WITH CHECK (
    statut = 'brouillon' AND public.user_role() = 'cuisine'
  );

-- Cuisine : update si brouillon
CREATE POLICY "cuisine_update_brouillon_sessions"
  ON public.commande_sessions FOR UPDATE
  USING (
    statut = 'brouillon' AND public.user_role() = 'cuisine'
  )
  WITH CHECK (
    statut = 'brouillon' AND public.user_role() = 'cuisine'
  );

-- Direction : accès complet
CREATE POLICY "direction_full_sessions"
  ON public.commande_sessions FOR ALL
  USING (public.user_role() IN ('direction', 'admin'));

-- commande_lignes --

-- Cuisine : lecture si session brouillon
CREATE POLICY "cuisine_read_brouillon_lignes"
  ON public.commande_lignes FOR SELECT
  USING (
    public.user_role() = 'cuisine'
    AND EXISTS (
      SELECT 1 FROM public.commande_sessions s
      WHERE s.id = session_id AND s.statut = 'brouillon'
    )
  );

-- Cuisine : insert si session brouillon
CREATE POLICY "cuisine_insert_brouillon_lignes"
  ON public.commande_lignes FOR INSERT
  WITH CHECK (
    public.user_role() = 'cuisine'
    AND EXISTS (
      SELECT 1 FROM public.commande_sessions s
      WHERE s.id = session_id AND s.statut = 'brouillon'
    )
  );

-- Cuisine : update si session brouillon
CREATE POLICY "cuisine_update_brouillon_lignes"
  ON public.commande_lignes FOR UPDATE
  USING (
    public.user_role() = 'cuisine'
    AND EXISTS (
      SELECT 1 FROM public.commande_sessions s
      WHERE s.id = session_id AND s.statut = 'brouillon'
    )
  )
  WITH CHECK (
    public.user_role() = 'cuisine'
    AND EXISTS (
      SELECT 1 FROM public.commande_sessions s
      WHERE s.id = session_id AND s.statut = 'brouillon'
    )
  );

-- Cuisine : delete si session brouillon
CREATE POLICY "cuisine_delete_brouillon_lignes"
  ON public.commande_lignes FOR DELETE
  USING (
    public.user_role() = 'cuisine'
    AND EXISTS (
      SELECT 1 FROM public.commande_sessions s
      WHERE s.id = session_id AND s.statut = 'brouillon'
    )
  );

-- Direction : accès complet
CREATE POLICY "direction_full_lignes"
  ON public.commande_lignes FOR ALL
  USING (public.user_role() IN ('direction', 'admin'));

-- commande_historique --

-- Lecture pour tous les rôles authentifiés
CREATE POLICY "authenticated_read_historique"
  ON public.commande_historique FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Direction/admin : écriture
CREATE POLICY "direction_write_historique"
  ON public.commande_historique FOR ALL
  USING (public.user_role() IN ('direction', 'admin'));
