-- Colonne pour masquer un employé du Registre Unique du Personnel
ALTER TABLE employes
  ADD COLUMN IF NOT EXISTS affichage_rup BOOLEAN DEFAULT true;
