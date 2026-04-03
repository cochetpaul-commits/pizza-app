-- Fix: DEFAULT role was still 'cuisine' but CHECK only allows ('group_admin','equipier')
-- This caused "Database error saving new user" on invite

-- 1. Update the DEFAULT to 'equipier'
ALTER TABLE profiles ALTER COLUMN role SET DEFAULT 'equipier';

-- 2. Recreate trigger function to explicitly set role = 'equipier'
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, role, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'role', 'equipier'),
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email)
  );
  RETURN NEW;
END;
$$;
