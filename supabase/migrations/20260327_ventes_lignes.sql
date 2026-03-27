-- Table pour stocker les lignes brutes d'export Popina/caisse
CREATE TABLE IF NOT EXISTS ventes_lignes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  etablissement_id UUID NOT NULL REFERENCES etablissements(id) ON DELETE CASCADE,

  -- Temporel
  ouvert_a TIMESTAMPTZ NOT NULL,
  ferme_a TIMESTAMPTZ,
  date_service DATE NOT NULL, -- date du jour de service (extraite de ouvert_a)
  service TEXT, -- 'midi' ou 'soir' (déduit de l'heure)

  -- Commande
  salle TEXT, -- Salle, Pergolas, Terrasse, À emporter
  table_num TEXT,
  couverts INTEGER DEFAULT 0,
  num_fiscal TEXT,
  statut TEXT, -- Payé, Annulé, etc.
  client TEXT,
  operateur TEXT, -- serveur

  -- Produit
  categorie TEXT,
  sous_categorie TEXT,
  type_ligne TEXT, -- Produit, Menu, etc.
  description TEXT, -- nom du produit
  menu TEXT,
  quantite INTEGER DEFAULT 1,
  tarification TEXT,
  annule BOOLEAN DEFAULT FALSE,
  raison_annulation TEXT,
  perdu BOOLEAN DEFAULT FALSE,
  raison_perte TEXT,
  transfere BOOLEAN DEFAULT FALSE,

  -- Montants
  taux_tva TEXT,
  prix_unitaire NUMERIC(10,2) DEFAULT 0,
  remise_totale NUMERIC(10,2) DEFAULT 0,
  ttc NUMERIC(10,2) DEFAULT 0,
  tva NUMERIC(10,2) DEFAULT 0,
  ht NUMERIC(10,2) DEFAULT 0,

  -- Meta
  imported_at TIMESTAMPTZ DEFAULT NOW(),
  import_file TEXT -- nom du fichier source
);

-- Index pour les requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_ventes_lignes_date ON ventes_lignes(date_service);
CREATE INDEX IF NOT EXISTS idx_ventes_lignes_etab ON ventes_lignes(etablissement_id);
CREATE INDEX IF NOT EXISTS idx_ventes_lignes_etab_date ON ventes_lignes(etablissement_id, date_service);
CREATE INDEX IF NOT EXISTS idx_ventes_lignes_categorie ON ventes_lignes(categorie);

-- RLS
ALTER TABLE ventes_lignes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ventes_lignes_select" ON ventes_lignes FOR SELECT USING (true);
CREATE POLICY "ventes_lignes_insert" ON ventes_lignes FOR INSERT WITH CHECK (true);
CREATE POLICY "ventes_lignes_delete" ON ventes_lignes FOR DELETE USING (true);
