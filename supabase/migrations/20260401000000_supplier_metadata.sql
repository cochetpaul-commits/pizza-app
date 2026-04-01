-- Enrichissement fiches fournisseurs : adresse, SIRET, catégorie, conditions
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS postal_code TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS siret TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS category TEXT;           -- ex: 'cremerie', 'boissons', 'viande', 'emballage'
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS payment_terms TEXT;      -- ex: '30 jours fin de mois'
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS delivery_days TEXT[];    -- ex: '{lundi,mercredi,vendredi}'
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS tva_intra TEXT;          -- N° TVA intracommunautaire
