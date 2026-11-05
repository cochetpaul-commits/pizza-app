-- 05/11/2026 : quiz vins. Une ligne par série jouée, au nom de l'employé (tablette) ou du compte ; lue et écrite
-- par l'API (clé de service), aucun accès direct depuis le navigateur.
create table if not exists public.quiz_sessions (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid references public.etablissements(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  employe_id uuid references public.employes(id) on delete set null,
  employe_nom text not null,
  theme text not null default 'vins',
  filtre text,
  nb_questions integer not null,
  score integer not null,
  questions jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create index if not exists quiz_sessions_etab_idx on public.quiz_sessions(etablissement_id, created_at desc);
alter table public.quiz_sessions enable row level security;
