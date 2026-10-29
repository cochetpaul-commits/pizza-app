-- Paie exceptionnelle et pourboires (29/10/2026) : à sortir de la masse salariale courante.
-- PPV et soldes de tout compte = exceptionnel (coût réel, hors rythme de croisière).
-- Pourboires centralisés = argent des clients passé en paie, pas un coût du travail.
create table if not exists paie_ajustements (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references etablissements(id),
  mois date not null,
  type text not null check (type in ('ppv','solde','pourboires','autre')),
  montant numeric not null,
  libelle text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists paie_ajustements_etab_mois on paie_ajustements(etablissement_id, mois);
alter table paie_ajustements enable row level security;
create policy paie_ajustements_lecture on paie_ajustements for select to authenticated using (true);
