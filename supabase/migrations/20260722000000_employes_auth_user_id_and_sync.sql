-- Add auth_user_id column to employes for reliable profile-employee link
ALTER TABLE employes ADD COLUMN IF NOT EXISTS auth_user_id uuid;

-- Link employes to auth users by email match
UPDATE employes e
SET auth_user_id = sub.auth_id
FROM (
  SELECT DISTINCT ON (au.id) e2.id as emp_id, au.id as auth_id
  FROM employes e2
  JOIN auth.users au ON LOWER(e2.email) = LOWER(au.email)
  WHERE e2.actif = true AND e2.auth_user_id IS NULL
  ORDER BY au.id, e2.created_at DESC
) sub
WHERE e.id = sub.emp_id;

-- Sync profiles.role from employes.role for all linked users
UPDATE profiles p
SET role = e.role
FROM employes e
WHERE e.auth_user_id = p.id
  AND e.actif = true
  AND p.role IS DISTINCT FROM e.role;

-- Update profiles.display_name to match employes
UPDATE profiles p
SET display_name = e.prenom || ' ' || e.nom
FROM employes e
WHERE e.auth_user_id = p.id
  AND e.actif = true;
