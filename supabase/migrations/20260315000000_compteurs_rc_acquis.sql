-- Add rc_acquis and etablissement_id to compteurs_employe
-- rc_acquis = RC earned in the period
-- solde_rc = cumulative balance (previous solde + rc_acquis - rc_pris)

ALTER TABLE public.compteurs_employe
  ADD COLUMN IF NOT EXISTS rc_acquis NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS etablissement_id UUID REFERENCES public.etablissements(id);

-- Backfill etablissement_id from employes
UPDATE public.compteurs_employe ce
SET etablissement_id = e.etablissement_id
FROM public.employes e
WHERE ce.employe_id = e.id
  AND ce.etablissement_id IS NULL;
