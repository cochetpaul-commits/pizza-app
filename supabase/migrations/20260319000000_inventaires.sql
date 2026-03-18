-- Inventaire sessions + lines
CREATE TABLE IF NOT EXISTS public.inventaires (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  etablissement_id UUID NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  statut TEXT NOT NULL DEFAULT 'en_cours' CHECK (statut IN ('en_cours', 'cloture')),
  created_by UUID NOT NULL,
  cloture_par UUID,
  notes TEXT,
  total_valeur NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cloture_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.inventaire_lignes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventaire_id UUID NOT NULL REFERENCES public.inventaires(id) ON DELETE CASCADE,
  ingredient_id UUID NOT NULL,
  quantite NUMERIC NOT NULL DEFAULT 0,
  unite TEXT,
  cout_unitaire NUMERIC,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_inventaire_lignes_upsert
  ON public.inventaire_lignes(inventaire_id, ingredient_id);

ALTER TABLE public.inventaires ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventaire_lignes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_inventaires" ON public.inventaires FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_inventaire_lignes" ON public.inventaire_lignes FOR ALL USING (true) WITH CHECK (true);
