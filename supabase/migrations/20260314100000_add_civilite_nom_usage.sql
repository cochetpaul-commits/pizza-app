-- Add civilite + nom_usage columns to employes
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS civilite TEXT;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS nom_usage TEXT;
