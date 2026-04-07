-- Add margin_rate and sell_price to recipes (empâtement) table
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS margin_rate NUMERIC(5,2) DEFAULT 0;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS sell_price NUMERIC(10,2);
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(4,2) DEFAULT 10;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS yield_grams NUMERIC(10,2);
