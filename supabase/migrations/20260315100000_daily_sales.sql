-- Table pour stocker les synthèses journalières (Kezia PDF, Popina API, saisie manuelle)
CREATE TABLE IF NOT EXISTS daily_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  etablissement_id uuid NOT NULL REFERENCES etablissements(id),
  date date NOT NULL,
  source text NOT NULL DEFAULT 'kezia_pdf', -- kezia_pdf | popina_api | manual

  -- Chiffre d'affaires
  ca_ttc numeric(12,2),
  ca_ht numeric(12,2),
  tva_total numeric(10,2),

  -- Tickets / couverts
  tickets integer,
  couverts integer,
  panier_moyen numeric(8,2),

  -- Moyens de paiement
  especes numeric(10,2),
  cartes numeric(10,2),
  cheques numeric(10,2),
  virements numeric(10,2),

  -- Marge
  marge_total numeric(10,2),
  taux_marque numeric(5,4), -- ex: 0.2989

  -- Ventilation par rayon (JSONB)
  rayons jsonb,

  -- Détail TVA (JSONB)
  tva_details jsonb,

  -- Métadonnées
  raw_text text,
  user_id uuid,
  created_at timestamptz DEFAULT now(),

  UNIQUE (etablissement_id, date, source)
);

-- Index pour requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_daily_sales_etab_date ON daily_sales (etablissement_id, date DESC);
