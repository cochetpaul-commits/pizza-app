-- Ajout colonnes settings manquantes sur etablissements
ALTER TABLE etablissements ADD COLUMN IF NOT EXISTS taux_accident_travail NUMERIC DEFAULT 2.50;
ALTER TABLE etablissements ADD COLUMN IF NOT EXISTS taux_horaire_moyen NUMERIC DEFAULT 12.50;
