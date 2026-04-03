-- Add stock level columns to ingredients for inventory management
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS stock_min NUMERIC DEFAULT NULL;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS stock_objectif NUMERIC DEFAULT NULL;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS stock_max NUMERIC DEFAULT NULL;
