-- Table des unités de commande (gérées depuis les commandes)
CREATE TABLE IF NOT EXISTS order_units (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  etablissement_id uuid,
  display_order int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(name, etablissement_id)
);

-- Enable RLS
ALTER TABLE order_units ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users full access
CREATE POLICY "order_units_all" ON order_units
  FOR ALL USING (true) WITH CHECK (true);

-- Seed from existing ingredient order_unit_label values
INSERT INTO order_units (name, etablissement_id)
SELECT DISTINCT i.order_unit_label, i.etablissement_id
FROM ingredients i
WHERE i.order_unit_label IS NOT NULL AND i.order_unit_label != ''
ON CONFLICT DO NOTHING;
