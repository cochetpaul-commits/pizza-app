-- Table des équipes (plannings) par établissement
create table if not exists equipes (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references etablissements(id) on delete cascade,
  nom text not null,
  actif boolean not null default true,
  ordre int not null default 0,
  created_at timestamptz not null default now(),
  unique(etablissement_id, nom)
);

create index if not exists idx_equipes_etab on equipes(etablissement_id);

alter table equipes enable row level security;
create policy "equipes_select" on equipes for select using (true);
create policy "equipes_insert" on equipes for insert with check (true);
create policy "equipes_update" on equipes for update using (true);
create policy "equipes_delete" on equipes for delete using (true);

-- Seed: créer les équipes existantes à partir des postes
INSERT INTO equipes (etablissement_id, nom)
SELECT DISTINCT etablissement_id, equipe FROM postes WHERE actif = true
ON CONFLICT (etablissement_id, nom) DO NOTHING;
