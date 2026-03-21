-- Table des zones de stockage (gérées depuis l'inventaire)
CREATE TABLE IF NOT EXISTS storage_zones (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  etablissement_id uuid,
  display_order int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(name, etablissement_id)
);

-- Enable RLS
ALTER TABLE storage_zones ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users full access
CREATE POLICY "storage_zones_all" ON storage_zones
  FOR ALL USING (true) WITH CHECK (true);

-- Seed from existing ingredient storage_zone values
INSERT INTO storage_zones (name, etablissement_id)
SELECT DISTINCT i.storage_zone, i.etablissement_id
FROM ingredients i
WHERE i.storage_zone IS NOT NULL AND i.storage_zone != ''
ON CONFLICT DO NOTHING;
