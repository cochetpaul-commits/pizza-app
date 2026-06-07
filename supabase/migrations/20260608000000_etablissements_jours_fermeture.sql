-- Jours de fermeture par établissement (0=dim, 1=lun, … 6=sam)
ALTER TABLE etablissements
  ADD COLUMN IF NOT EXISTS jours_fermeture int[] DEFAULT '{}';

-- Bello Mio : fermé samedi (6) et dimanche (0)
UPDATE etablissements SET jours_fermeture = '{0,6}' WHERE slug = 'bello_mio' AND (jours_fermeture IS NULL OR jours_fermeture = '{}');
