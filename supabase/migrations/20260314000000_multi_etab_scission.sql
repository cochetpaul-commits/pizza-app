-- ============================================================
-- SCISSION MULTI-ÉTABLISSEMENTS
-- Chaque établissement est totalement indépendant.
-- Aucune donnée ne se partage entre Bello Mio et Piccola Mia.
-- ============================================================

-- ── 0. Récupérer l'UUID de Bello Mio ──
DO $$
DECLARE bm_id UUID;
BEGIN
  SELECT id INTO bm_id FROM etablissements WHERE slug = 'bello_mio';

  -- ── 1. Piccola Mia : couleur + adresse ──
  UPDATE etablissements
  SET couleur = '#4a6741', adresse = 'Saint-Malo'
  WHERE slug = 'piccola';

  -- ── 2. Supprimer la colonne shared sur ingredients ──
  -- Plus de partage entre établissements
  ALTER TABLE ingredients DROP COLUMN IF EXISTS shared;

  -- ── 3. Backfill ingrédients orphelins vers Bello Mio ──
  UPDATE ingredients SET etablissement_id = bm_id WHERE etablissement_id IS NULL;

  -- ── 4. Backfill supplier_invoices orphelins vers Bello Mio ──
  -- (supplier_invoices hérite de supplier via supplier_id → suppliers.etablissement_id)
  -- On ajoute la colonne directement pour faciliter le filtrage
  ALTER TABLE supplier_invoices
    ADD COLUMN IF NOT EXISTS etablissement_id UUID REFERENCES etablissements(id);
  UPDATE supplier_invoices SET etablissement_id = bm_id WHERE etablissement_id IS NULL;

  -- ── 5. Backfill supplier_offers → etablissement_id UUID ──
  -- Remplace le TEXT 'establishment' par un vrai FK UUID
  ALTER TABLE supplier_offers
    ADD COLUMN IF NOT EXISTS etablissement_id UUID REFERENCES etablissements(id);
  UPDATE supplier_offers SET etablissement_id = bm_id WHERE etablissement_id IS NULL;

END $$;

-- ── 6. NOT NULL sur toutes les tables à etablissement_id ──
-- ingredients
ALTER TABLE ingredients ALTER COLUMN etablissement_id SET NOT NULL;

-- supplier_invoices
ALTER TABLE supplier_invoices ALTER COLUMN etablissement_id SET NOT NULL;

-- supplier_offers
ALTER TABLE supplier_offers ALTER COLUMN etablissement_id SET NOT NULL;

-- ── 7. Index pour performance ──
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_etab ON supplier_invoices(etablissement_id);
CREATE INDEX IF NOT EXISTS idx_supplier_offers_etab ON supplier_offers(etablissement_id);
