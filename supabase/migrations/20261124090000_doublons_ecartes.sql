-- 24/11/2026 : les paires « pas un doublon » étaient gardées dans le navigateur (localStorage) : écartées sur
-- un appareil, elles revenaient sur tous les autres. Une table partagée, clé = les deux identifiants triés « a|b ».
create table if not exists public.doublons_ecartes (
  pair_key text primary key,
  ecarte_par uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.doublons_ecartes enable row level security;
create policy doublons_ecartes_lecture on public.doublons_ecartes for select to authenticated using (true);
create policy doublons_ecartes_ajout on public.doublons_ecartes for insert to authenticated with check (true);
create policy doublons_ecartes_retrait on public.doublons_ecartes for delete to authenticated using (true);
grant select, insert, delete on public.doublons_ecartes to authenticated;
