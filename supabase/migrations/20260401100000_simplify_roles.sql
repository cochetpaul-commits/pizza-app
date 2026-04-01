-- Simplification des rôles : manager/cuisine/salle/plonge → equipier
-- Seuls 2 rôles : group_admin et equipier

-- 1. Drop old constraint first
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- 2. Migrate existing roles
UPDATE profiles SET role = 'equipier' WHERE role NOT IN ('group_admin', 'equipier');
UPDATE employes SET role = 'equipier' WHERE role IN ('manager', 'cuisine', 'salle', 'plonge', 'employe');

-- 3. Add new constraint
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('group_admin', 'equipier'));

-- 4. Update the default in user_role() function
CREATE OR REPLACE FUNCTION public.user_role()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (SELECT role FROM public.profiles WHERE id = auth.uid()),
    'equipier'
  );
$$;
