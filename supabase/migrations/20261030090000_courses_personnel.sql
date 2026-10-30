-- Courses du personnel (30/10/2026) : liste partagée (cochée par n'importe qui, vue par tous) et tri des fiches Metro.
alter table ingredients add column if not exists personnel_tri_at timestamptz;
comment on column ingredients.personnel_tri_at is 'Repas du personnel : date à laquelle la fiche a été triée (personnel ou restaurant) ; null = à trier';
create table if not exists courses_personnel (
  etablissement_id uuid not null references etablissements(id) on delete cascade,
  ingredient_id uuid not null references ingredients(id) on delete cascade,
  coche_par uuid,
  coche_at timestamptz not null default now(),
  primary key (etablissement_id, ingredient_id)
);
comment on table courses_personnel is 'Liste de courses du personnel partagée : un produit coché par quelqu''un est coché pour tout le monde';
alter table courses_personnel enable row level security;
create policy courses_personnel_lecture on courses_personnel for select to authenticated using (true);
create policy courses_personnel_ecriture on courses_personnel for all to authenticated using (true) with check (true);
