-- Make the etablissement_id <-> etablissements_ids sync bidirectional
-- so that legacy INSERTs that only set etablissement_id automatically
-- populate the new array column.

CREATE OR REPLACE FUNCTION public.sync_employes_primary_etab()
RETURNS TRIGGER AS $$
BEGIN
  -- Multi-etab array set ? -> sync the legacy single column
  IF NEW.etablissements_ids IS NOT NULL AND cardinality(NEW.etablissements_ids) > 0 THEN
    NEW.etablissement_id := NEW.etablissements_ids[1];
  -- Legacy column set but array empty ? -> populate the array
  ELSIF NEW.etablissement_id IS NOT NULL THEN
    NEW.etablissements_ids := ARRAY[NEW.etablissement_id]::uuid[];
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_employes_primary_etab ON public.employes;
CREATE TRIGGER trg_sync_employes_primary_etab
  BEFORE INSERT OR UPDATE ON public.employes
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_employes_primary_etab();
