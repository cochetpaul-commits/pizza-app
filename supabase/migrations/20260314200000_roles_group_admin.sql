-- ============================================================
-- MIGRATION: Nouveaux rôles (group_admin / cuisine / salle)
-- Remplace admin/direction + is_group_admin
-- ============================================================

-- 1. Drop old CHECK constraint
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- 2. Convert existing roles BEFORE adding new constraint
UPDATE profiles SET role = 'group_admin' WHERE role IN ('admin', 'direction');
UPDATE profiles SET role = 'group_admin' WHERE is_group_admin = true AND role != 'group_admin';

-- 3. Add new CHECK constraint
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('group_admin', 'cuisine', 'salle'));
