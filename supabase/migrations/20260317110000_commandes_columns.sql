-- Colonnes pour la page commandes
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS franco_minimum NUMERIC DEFAULT NULL;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS order_unit_label TEXT DEFAULT NULL;
