-- Stabilisation : tables manquantes utilisées par le code front
-- pointages, clients, taches

-- ── pointages ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pointages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id UUID NOT NULL REFERENCES employes(id) ON DELETE CASCADE,
  etablissement_id UUID NOT NULL REFERENCES etablissements(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  heure_arrivee TIME,
  heure_depart TIME,
  heure_arrivee_reelle TIME,
  heure_depart_reelle TIME,
  statut TEXT DEFAULT 'en_attente', -- en_attente | traitee | validee
  photo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (employe_id, date)
);

CREATE INDEX IF NOT EXISTS idx_pointages_etab_date
  ON pointages (etablissement_id, date);

ALTER TABLE pointages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read pointages"
  ON pointages FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage pointages"
  ON pointages FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'direction', 'group_admin')
    )
  );

-- ── clients ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  etablissement_id UUID REFERENCES etablissements(id) ON DELETE CASCADE,
  nom TEXT NOT NULL,
  prenom TEXT,
  email TEXT,
  telephone TEXT,
  notes TEXT,
  type TEXT DEFAULT 'particulier', -- particulier | entreprise
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clients_nom
  ON clients (nom);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read clients"
  ON clients FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage clients"
  ON clients FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'direction', 'group_admin')
    )
  );

-- ── taches (checklist dashboard) ────────────────────────────────
CREATE TABLE IF NOT EXISTS taches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  etablissement_id UUID REFERENCES etablissements(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  zone TEXT NOT NULL DEFAULT 'cuisine', -- cuisine | salle | sanitaires
  active BOOLEAN NOT NULL DEFAULT true,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_taches_zone
  ON taches (zone, position);

ALTER TABLE taches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read taches"
  ON taches FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage taches"
  ON taches FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'direction', 'group_admin')
    )
  );
