-- Événementiel Piccola Mia (30/10/2026) : devis et factures clients lus dans Pennylane (SARL I Fratelli), comptés dans le CA.
-- Lecture seule : rien n'est écrit dans Pennylane.
create table if not exists evenementiel_pennylane (
  type text not null check (type in ('devis','facture')),
  id bigint not null,
  etablissement_id uuid not null references etablissements(id) on delete cascade,
  numero text,
  client_id bigint,
  client_nom text,
  date date,
  echeance date,
  montant_ht numeric,
  montant_ttc numeric,
  statut text,
  paye boolean not null default false,
  reste_ttc numeric,
  objet text,
  description text,
  texte_libre text,
  url_pdf text,
  devis_id bigint,
  avoir_de bigint,
  archive boolean not null default false,
  synchro_at timestamptz not null default now(),
  primary key (type, id)
);
comment on table evenementiel_pennylane is 'Devis et factures clients lus dans Pennylane (SARL I Fratelli) : l''événementiel de Piccola Mia, compté dans le CA. Lecture seule, rien n''est écrit dans Pennylane.';
create index if not exists evenementiel_pennylane_etab_date on evenementiel_pennylane (etablissement_id, date);
alter table evenementiel_pennylane enable row level security;
create policy evenementiel_pennylane_lecture on evenementiel_pennylane for select to authenticated using (true);
