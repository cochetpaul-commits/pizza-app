-- Colonnes de préférences planning par établissement
ALTER TABLE etablissements
  ADD COLUMN IF NOT EXISTS employes_heures_reelles BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS pause_auto_creation BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS pause_unite TEXT DEFAULT 'minutes' CHECK (pause_unite IN ('minutes', 'heures'));
