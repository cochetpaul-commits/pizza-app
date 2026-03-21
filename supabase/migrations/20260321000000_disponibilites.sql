-- Disponibilites par employé (JSON: {0: true, 1: true, ...} pour lundi-dimanche)
ALTER TABLE employes
  ADD COLUMN IF NOT EXISTS disponibilites JSONB DEFAULT '{"0":true,"1":true,"2":true,"3":true,"4":true,"5":true,"6":true}';
