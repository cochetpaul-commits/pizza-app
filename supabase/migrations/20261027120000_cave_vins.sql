-- Cave Bello Mio (27/10/2026) : fiches vin pour la salle et accords avec la carte
create table if not exists vins (
  id uuid primary key default gen_random_uuid(),
  cle text unique not null,
  nom text not null,
  couleur text not null,
  nom_complet text, domaine text, region text, appellation text, cepages text, vinification text, degre text, millesime text,
  profil jsonb, oeil text, nez text, bouche text, garde text, service text, carafage text,
  histoire text, anecdote text, accords_generiques text, pitch text, astuce text, note text,
  sources jsonb not null default '[]'::jsonb,
  statut text not null default 'a_valider',
  sur_carte boolean not null default false,
  carte_popina text,
  ingredient_id uuid references ingredients(id),
  prix jsonb,
  recherche text,
  valide_par uuid, valide_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
comment on table vins is 'Cave Bello Mio (27/10/2026) : fiches vin pour la salle (pitch, profil, accords), reliées à la touche Popina et au produit (stock, prix d''achat)';
create table if not exists vins_accords (
  id uuid primary key default gen_random_uuid(),
  vin_id uuid not null references vins(id) on delete cascade,
  plat_nom text not null,
  plat_popina_id uuid references popina_products(id),
  raison text,
  ordre int not null default 1,
  source text not null default 'main',
  created_at timestamptz not null default now()
);
create index if not exists vins_accords_vin on vins_accords(vin_id);
create index if not exists vins_accords_plat on vins_accords(plat_popina_id);
alter table vins enable row level security;
alter table vins_accords enable row level security;
