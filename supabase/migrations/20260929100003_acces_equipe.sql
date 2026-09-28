-- Accès de l'équipe (écran admin) : désactivation de compte et journal des changements.

-- Désactivation : le compte est bloqué (connexion, sessions) sans être supprimé.
alter table public.profiles add column if not exists desactive_le timestamptz;

-- Journal : qui a changé quoi, et quand
create table if not exists public.acces_journal (
  id        uuid primary key default gen_random_uuid(),
  fait_le   timestamptz not null default now(),
  par       uuid references public.profiles(id),
  cible     uuid,
  cible_email text,
  action    text not null check (action in ('invitation', 'renvoi_invitation', 'role', 'etablissements', 'desactivation', 'reactivation')),
  avant     jsonb,
  apres     jsonb,
  note      text
);
create index if not exists idx_acces_journal_cible on public.acces_journal (cible, fait_le desc);
alter table public.acces_journal enable row level security;
drop policy if exists acces_journal_lecture_admin on public.acces_journal;
create policy acces_journal_lecture_admin on public.acces_journal for select to authenticated
  using ((select public.est_admin()));
-- Écriture : uniquement par le serveur (clé service)

-- Un compte désactivé n'a plus aucun droit, même avec une session encore valide
create or replace function public.est_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'group_admin' and desactive_le is null);
$$;
create or replace function public.est_manager_etab(etab uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.est_admin()
      or exists (select 1 from profiles where id = auth.uid() and role = 'manager' and desactive_le is null and etab = any(etablissements_access));
$$;
create or replace function public.user_has_etablissement_access(etab_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.est_admin()
      or exists (select 1 from profiles where id = auth.uid() and desactive_le is null and etab_id = any(etablissements_access));
$$;
create or replace function public.etabs_manager() returns uuid[]
language sql stable security definer set search_path = public as $$
  select case when public.est_admin() then array(select id from etablissements)
              else coalesce((select etablissements_access from profiles where id = auth.uid() and role = 'manager' and desactive_le is null), '{}') end;
$$;
create or replace function public.etabs_acces() returns uuid[]
language sql stable security definer set search_path = public as $$
  select case when public.est_admin() then array(select id from etablissements)
              else coalesce((select etablissements_access from profiles where id = auth.uid() and desactive_le is null), '{}') end;
$$;

-- Coupe les sessions en cours d'un compte (jetons de rafraîchissement supprimés). Serveur uniquement.
create or replace function public.couper_sessions(p_user uuid) returns void
language sql security definer set search_path = auth, public as $$
  delete from auth.sessions where user_id = p_user;
$$;
revoke execute on function public.couper_sessions(uuid) from public, anon, authenticated;
