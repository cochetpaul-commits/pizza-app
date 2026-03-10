-- Fix: la policy "Admin full access" faisait un subquery récursif sur profiles
-- soumis à RLS → échec silencieux. On utilise user_role() (SECURITY DEFINER)
-- qui bypass RLS pour résoudre le rôle.

DROP POLICY IF EXISTS "Admin full access" ON public.profiles;

CREATE POLICY "Admin full access"
  ON public.profiles FOR ALL
  USING ( public.user_role() = 'admin' );
