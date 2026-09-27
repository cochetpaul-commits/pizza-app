-- Commandes Maël — étape 4 : précommande du mercredi (sans rappels).
-- Ajout uniquement : type de commande, « jour » par défaut (toutes les commandes existantes restent « jour »).
alter table public.commande_sessions
  add column if not exists type text not null default 'jour'
  check (type in ('jour', 'precommande'));

create index if not exists idx_commande_sessions_fournisseur_type
  on public.commande_sessions (supplier_id, etablissement_id, type, status);
