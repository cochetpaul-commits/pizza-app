-- Périodes de modulation / lissage par établissement
create table if not exists periodes_modulation (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references etablissements(id) on delete cascade,
  mode text not null default 'modulation' check (mode in ('modulation', 'lissage')),
  date_debut date not null,
  date_fin date not null,
  heures_annuelles int not null default 1607,
  -- Temps plein
  temps_plein_actif boolean not null default true,
  plafond_hebdo_h numeric not null default 42,
  plancher_hebdo_h numeric not null default 0,
  -- Temps partiel
  temps_partiel_actif boolean not null default false,
  plafond_partiel_h numeric not null default 34,
  plancher_partiel_h numeric not null default 0,
  -- Equipes concernées (array d'ids equipes)
  equipe_ids uuid[] not null default '{}',
  actif boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_periodes_mod_etab on periodes_modulation(etablissement_id);

alter table periodes_modulation enable row level security;
create policy "periodes_mod_select" on periodes_modulation for select using (true);
create policy "periodes_mod_insert" on periodes_modulation for insert with check (true);
create policy "periodes_mod_update" on periodes_modulation for update using (true);
create policy "periodes_mod_delete" on periodes_modulation for delete using (true);
