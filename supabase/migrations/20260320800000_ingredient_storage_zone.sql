-- Lieu de stockage libre (inventaire)
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS storage_zone TEXT;
