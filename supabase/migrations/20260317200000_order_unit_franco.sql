-- Unité de commande personnalisée par ingrédient (ex: "pcs", "carton de 6")
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS order_unit_label TEXT;

-- Franco minimum par fournisseur (en euros HT)
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS franco_minimum NUMERIC(10,2);
