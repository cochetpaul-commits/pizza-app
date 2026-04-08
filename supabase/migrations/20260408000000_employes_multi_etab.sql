-- Multi-establishment support for employees
-- Adds an array column "etablissements_ids" so an employee can be
-- assigned to one or several establishments at the same time. The
-- legacy single-FK column "etablissement_id" is kept and treated as
-- the primary establishment (first item of the array).

-- 1. Add the array column
ALTER TABLE public.employes
  ADD COLUMN IF NOT EXISTS etablissements_ids uuid[] NOT NULL DEFAULT '{}';

-- 2. Backfill from existing single etablissement_id values
UPDATE public.employes
SET    etablissements_ids = ARRAY[etablissement_id]::uuid[]
WHERE  etablissement_id IS NOT NULL
  AND  (etablissements_ids IS NULL OR cardinality(etablissements_ids) = 0);

-- 3. Index for fast filtering by etablissement (GIN on the array)
CREATE INDEX IF NOT EXISTS employes_etablissements_ids_gin
  ON public.employes
  USING GIN (etablissements_ids);

-- 4. Trigger: keep etablissement_id in sync with the first item of
--    etablissements_ids so existing code that reads etablissement_id
--    keeps working.
CREATE OR REPLACE FUNCTION public.sync_employes_primary_etab()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.etablissements_ids IS NOT NULL AND cardinality(NEW.etablissements_ids) > 0 THEN
    NEW.etablissement_id := NEW.etablissements_ids[1];
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_employes_primary_etab ON public.employes;
CREATE TRIGGER trg_sync_employes_primary_etab
  BEFORE INSERT OR UPDATE OF etablissements_ids ON public.employes
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_employes_primary_etab();
