-- ============================================================
-- S'assurer que tous les admins sont group_admin
-- et ont accès à Bello Mio (safety net)
-- ============================================================

UPDATE public.profiles
SET is_group_admin = true,
    etablissements_access = ARRAY[(SELECT id FROM public.etablissements WHERE slug = 'bello_mio')]
WHERE role = 'admin'
  AND (is_group_admin = false OR etablissements_access = '{}' OR etablissements_access IS NULL);

-- Direction : accès Bello Mio si pas encore configuré
UPDATE public.profiles
SET etablissements_access = ARRAY[(SELECT id FROM public.etablissements WHERE slug = 'bello_mio')]
WHERE role = 'direction'
  AND (etablissements_access = '{}' OR etablissements_access IS NULL);

-- Cuisine : accès Bello Mio si pas encore configuré
UPDATE public.profiles
SET etablissements_access = ARRAY[(SELECT id FROM public.etablissements WHERE slug = 'bello_mio')]
WHERE role = 'cuisine'
  AND (etablissements_access = '{}' OR etablissements_access IS NULL);
