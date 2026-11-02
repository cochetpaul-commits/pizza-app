-- Module pâte, phase 2, blocs 2.1 à 2.4 (02/11/2026) : fabrication par lot.
-- Décisions de Paul : TB manuelle de départ 56 ; fenêtre des bacs par type de recette (biga 24 à 48 h, directe 72 à 100 h) ;
-- lancer et clôturer un lot réservé aux pizzaiolos formés (employes.pate_autorise) et aux responsables.

alter table public.recipes
  add column if not exists tb_manuelle numeric not null default 56,
  add column if not exists etapes_fournee jsonb,
  add column if not exists fenetre_bacs_min_h integer,
  add column if not exists fenetre_bacs_max_h integer;
update public.recipes set fenetre_bacs_min_h = 24, fenetre_bacs_max_h = 48 where type = 'biga' and fenetre_bacs_min_h is null;
update public.recipes set fenetre_bacs_min_h = 72, fenetre_bacs_max_h = 100 where type = 'direct' and fenetre_bacs_min_h is null;

alter table public.employes add column if not exists pate_autorise boolean not null default false;

create table if not exists public.pate_lots (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete cascade,
  numero text not null,
  recipe_id uuid references public.recipes(id) on delete set null,
  recette_nom text not null,
  type text not null check (type in ('biga', 'direct')),
  nb_patons integer not null,
  poids_paton integer not null,
  poids_calcule integer not null,
  recette_figee jsonb not null default '{}'::jsonb,
  operateur_id uuid references public.employes(id) on delete set null,
  operateur_nom text,
  statut text not null default 'petrissage' check (statut in ('biga_en_cours', 'biga_au_froid', 'petrissage', 'cloture', 'annule')),
  essai boolean not null default false,
  essai_variable text,
  essai_valeur text,
  essai_evaluation jsonb,
  commentaire text,
  biga_debut_at timestamptz,
  biga_froid_at timestamptz,
  petrissage_debut_at timestamptz,
  boulage_at timestamptz,
  cloture_at timestamptz,
  t_farine_biga numeric, t_cuisine_biga numeric, t_eau_biga_calc numeric, t_eau_biga_utilisee numeric, t_biga_sortie numeric,
  t_farine numeric, t_cuisine numeric, t_biga numeric, t_eau_calc numeric, t_eau_utilisee numeric,
  tb_utilisee numeric, tb_source text,
  t_pate_sortie numeric, voile_ok boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (etablissement_id, numero)
);
create index if not exists pate_lots_etab_statut_idx on public.pate_lots (etablissement_id, statut, created_at desc);
create index if not exists pate_lots_recipe_idx on public.pate_lots (recipe_id, created_at desc);

create table if not exists public.pate_lot_etapes (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.pate_lots(id) on delete cascade,
  phase text not null check (phase in ('biga', 'final')),
  ordre integer not null,
  libelle text not null,
  duree_prevue_s integer,
  demarre_at timestamptz,
  termine_at timestamptz,
  valide_par uuid references public.employes(id) on delete set null,
  valide_par_nom text,
  unique (lot_id, ordre)
);

-- Lecture et écriture par les routes API (clé de service) seulement
alter table public.pate_lots enable row level security;
alter table public.pate_lot_etapes enable row level security;
