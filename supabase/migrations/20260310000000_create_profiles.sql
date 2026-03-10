-- ============================================================
-- RBAC: table profiles + helper user_role() + trigger auto-create
-- ============================================================

-- Table profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'cuisine' CHECK (role IN ('admin','direction','cuisine')),
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- RLS : chaque user lit son profil
CREATE POLICY "Users read own profile"
  ON public.profiles FOR SELECT
  USING (id = auth.uid());

-- RLS : admin full access (lecture + écriture tous profils)
CREATE POLICY "Admin full access"
  ON public.profiles FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Fonction helper SECURITY DEFINER (utilisable dans RLS d'autres tables)
CREATE OR REPLACE FUNCTION public.user_role()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- Trigger auto-création profil à l'inscription
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
