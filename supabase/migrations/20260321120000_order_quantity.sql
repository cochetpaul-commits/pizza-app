-- Contenu de l'unité de commande (ex: 2.5 pour "bac 2.5kg")
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS order_quantity numeric;

-- Table order_units inutile, on la supprime
DROP TABLE IF EXISTS order_units;
