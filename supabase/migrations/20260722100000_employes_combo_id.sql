ALTER TABLE employes ADD COLUMN IF NOT EXISTS combo_id text;
ALTER TABLE employes ADD COLUMN IF NOT EXISTS combo_contract_id text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_employes_combo_id ON employes(combo_id) WHERE combo_id IS NOT NULL;
