-- Colonne repos compensateurs par établissement
ALTER TABLE etablissements
  ADD COLUMN IF NOT EXISTS repos_compensateurs_actif BOOLEAN DEFAULT false;
