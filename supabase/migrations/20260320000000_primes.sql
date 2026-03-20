-- Table des modèles de primes, acomptes et indemnités par établissement
create table if not exists primes (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references etablissements(id) on delete cascade,
  libelle text not null,
  code text not null default '',
  type text not null default 'prime' check (type in ('prime', 'acompte', 'indemnite')),
  montant numeric,
  recurrence text default 'ponctuel' check (recurrence in ('ponctuel', 'mensuel', 'annuel')),
  actif boolean not null default true,
  created_at timestamptz not null default now()
);

-- Index pour lookups rapides
create index if not exists idx_primes_etab on primes(etablissement_id);

-- RLS
alter table primes enable row level security;

create policy "primes_select" on primes for select using (true);
create policy "primes_insert" on primes for insert with check (true);
create policy "primes_update" on primes for update using (true);
create policy "primes_delete" on primes for delete using (true);
