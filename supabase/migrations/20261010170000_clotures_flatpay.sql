-- Module Clôture de caisse (10/10/2026), Bello Mio.
-- clotures : la saisie du soir (ticket Z du TPE + écran Popina + tiroir), le verdict calculé,
-- les corrections notées par l'équipe, puis le contrôle de la nuit (étape 2).
create table if not exists public.clotures (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id),
  jour date not null,
  saisie jsonb not null default '{}'::jsonb,
  resultat jsonb,
  niveau text,
  corrections jsonb not null default '[]'::jsonb,
  notes text,
  pourboires_paie numeric,
  statut text not null default 'en_cours' check (statut in ('en_cours', 'validee')),
  validee_at timestamptz,
  controle jsonb,
  controle_at timestamptz,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (etablissement_id, jour)
);
alter table public.clotures enable row level security;

-- flatpay_transactions : lignes des exports Flatpay (Carte et Titre restaurant). Jamais de numéro de carte.
create table if not exists public.flatpay_transactions (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id),
  cle text not null,
  horodatage timestamptz not null,
  jour date not null,
  mode text not null check (mode in ('cb', 'amex', 'conecs')),
  type_carte text,
  montant_centimes integer not null,
  statut text,
  operation text,
  terminal text,
  emetteur text,
  source text not null check (source in ('carte', 'titre_restaurant')),
  lot_id uuid,
  imported_by uuid references auth.users(id),
  imported_at timestamptz not null default now(),
  unique (etablissement_id, cle)
);
create index if not exists idx_flatpay_transactions_jour on public.flatpay_transactions (etablissement_id, jour);
alter table public.flatpay_transactions enable row level security;
