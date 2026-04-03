-- Fix absences table: normalize statuts, add missing types, add workflow columns

-- Remove old CHECK constraints and add corrected ones
ALTER TABLE absences DROP CONSTRAINT IF EXISTS absences_type_check;
ALTER TABLE absences DROP CONSTRAINT IF EXISTS absences_statut_check;

-- Add new types + normalize existing
ALTER TABLE absences ADD CONSTRAINT absences_type_check CHECK (type IN (
  'CP', 'RTT', 'maladie', 'sans_solde', 'conge_special',
  'absence_injustifiee', 'ferie', 'repos_compensateur',
  'formation', 'evenement_familial', 'accident_travail', 'maternite'
));

-- Normalize statut values (no accents, consistent)
UPDATE absences SET statut = 'en_attente' WHERE statut IN ('demande', 'approuvé');
UPDATE absences SET statut = 'valide' WHERE statut IN ('approuve', 'approuvé');
UPDATE absences SET statut = 'refuse' WHERE statut IN ('refusé');

ALTER TABLE absences ADD CONSTRAINT absences_statut_check CHECK (statut IN ('en_attente', 'valide', 'refuse'));
ALTER TABLE absences ALTER COLUMN statut SET DEFAULT 'en_attente';

-- Add workflow columns
ALTER TABLE absences ADD COLUMN IF NOT EXISTS demandeur_id UUID REFERENCES auth.users(id);
ALTER TABLE absences ADD COLUMN IF NOT EXISTS valideur_id UUID REFERENCES auth.users(id);
ALTER TABLE absences ADD COLUMN IF NOT EXISTS validated_at TIMESTAMPTZ;
ALTER TABLE absences ADD COLUMN IF NOT EXISTS motif_refus TEXT;
