-- =============================================
-- Tables devis (quotes) et factures (invoices)
-- =============================================

-- Table devis
CREATE TABLE IF NOT EXISTS devis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero TEXT NOT NULL,
  etablissement_id UUID REFERENCES etablissements(id),
  client_id UUID REFERENCES clients(id),
  event_id UUID REFERENCES events(id),
  status TEXT DEFAULT 'brouillon',
  date_emission DATE DEFAULT CURRENT_DATE,
  date_validite DATE,
  objet TEXT,
  conditions TEXT,
  notes TEXT,
  total_ht NUMERIC(10,2) DEFAULT 0,
  tva_rate NUMERIC(4,2) DEFAULT 10,
  total_ttc NUMERIC(10,2) DEFAULT 0,
  acompte_pct NUMERIC(4,2) DEFAULT 30,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id)
);

-- Lignes de devis
CREATE TABLE IF NOT EXISTS devis_lignes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  devis_id UUID REFERENCES devis(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantite NUMERIC(10,2) DEFAULT 1,
  unite TEXT DEFAULT 'unité',
  prix_unitaire_ht NUMERIC(10,2) DEFAULT 0,
  total_ht NUMERIC(10,2) DEFAULT 0,
  position INT DEFAULT 0
);

-- Table factures
CREATE TABLE IF NOT EXISTS factures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero TEXT NOT NULL,
  etablissement_id UUID REFERENCES etablissements(id),
  client_id UUID REFERENCES clients(id),
  event_id UUID REFERENCES events(id),
  devis_id UUID REFERENCES devis(id),
  status TEXT DEFAULT 'brouillon',
  date_emission DATE DEFAULT CURRENT_DATE,
  date_echeance DATE,
  objet TEXT,
  conditions TEXT,
  notes TEXT,
  total_ht NUMERIC(10,2) DEFAULT 0,
  tva_rate NUMERIC(4,2) DEFAULT 10,
  total_ttc NUMERIC(10,2) DEFAULT 0,
  montant_paye NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS facture_lignes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facture_id UUID REFERENCES factures(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantite NUMERIC(10,2) DEFAULT 1,
  unite TEXT DEFAULT 'unité',
  prix_unitaire_ht NUMERIC(10,2) DEFAULT 0,
  total_ht NUMERIC(10,2) DEFAULT 0,
  position INT DEFAULT 0
);

-- Auto-incrémentation numéros
CREATE OR REPLACE FUNCTION next_devis_numero(etab_id UUID) RETURNS TEXT AS $$
  SELECT 'DEV-' || EXTRACT(YEAR FROM NOW())::TEXT || '-' ||
    LPAD((COALESCE(MAX(SUBSTRING(numero FROM '[0-9]+$')::INT), 0) + 1)::TEXT, 3, '0')
  FROM devis WHERE etablissement_id = etab_id
    AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW());
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION next_facture_numero(etab_id UUID) RETURNS TEXT AS $$
  SELECT 'FAC-' || EXTRACT(YEAR FROM NOW())::TEXT || '-' ||
    LPAD((COALESCE(MAX(SUBSTRING(numero FROM '[0-9]+$')::INT), 0) + 1)::TEXT, 3, '0')
  FROM factures WHERE etablissement_id = etab_id
    AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW());
$$ LANGUAGE sql;

-- RLS
ALTER TABLE devis ENABLE ROW LEVEL SECURITY;
ALTER TABLE devis_lignes ENABLE ROW LEVEL SECURITY;
ALTER TABLE factures ENABLE ROW LEVEL SECURITY;
ALTER TABLE facture_lignes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all_devis" ON devis FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all_devis_lignes" ON devis_lignes FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all_factures" ON factures FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all_facture_lignes" ON facture_lignes FOR ALL USING (auth.role() = 'authenticated');
