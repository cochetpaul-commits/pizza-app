-- Link an employee to a "poste" (job position) preconfigured per
-- establishment in /settings/etablissements/[id].

ALTER TABLE public.employes
  ADD COLUMN IF NOT EXISTS poste_id uuid REFERENCES public.postes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS employes_poste_id_idx ON public.employes (poste_id);
