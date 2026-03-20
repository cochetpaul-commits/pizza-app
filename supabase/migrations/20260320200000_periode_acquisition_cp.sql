-- Colonnes période d'acquisition des congés payés
ALTER TABLE etablissements
  ADD COLUMN IF NOT EXISTS cp_periode_jour INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS cp_periode_mois INT DEFAULT 6;
