-- Pourboires de l'équipe (26/10/2026) : cagnotte espèces comptée le vendredi à la clôture, ajustements mensuels par personne
alter table clotures add column if not exists pourboires_especes numeric;
comment on column clotures.pourboires_especes is 'Pourboires espèces comptés ce soir (cagnotte vidée le vendredi), pour le pot du mois';
create table if not exists pourboires_ajustements (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references etablissements(id),
  employe_id uuid not null references employes(id),
  mois date not null,
  montant numeric not null,
  motif text not null,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists pourboires_ajustements_mois on pourboires_ajustements(etablissement_id, mois);
alter table pourboires_ajustements enable row level security;
alter table pourboires_ajustements add column if not exists type text not null default 'montant';
comment on column pourboires_ajustements.type is 'montant : ajustement en euros ; exclu : la personne ne compte pas ce mois (ni ses jours, ni de part)';
-- Complément du pot (27/10) : pourboires carte des jours sans clôture dans l'app (rapport TPE), employe_id null
alter table pourboires_ajustements alter column employe_id drop not null;
