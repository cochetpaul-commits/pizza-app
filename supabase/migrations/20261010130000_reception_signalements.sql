-- Contrôle de réception (10/10/2026, sur le modèle ComandR) : état de chaque ligne à la livraison,
-- quantité réellement reçue, prix facturé différent, « facturé sur le bon », montant à réclamer
-- au fournisseur et suivi du litige. Tout reste sur commande_lignes : la liste « À réclamer »
-- (étape 3) lit les lignes dont montant_reclame > 0.
alter table public.commande_lignes
  add column if not exists etat_reception text
    check (etat_reception in ('recu', 'manquant', 'partiel', 'abime', 'refuse', 'prix')),
  add column if not exists prix_recu numeric,
  add column if not exists facture_sur_bon boolean not null default true,
  add column if not exists montant_reclame numeric,
  add column if not exists litige_statut text
    check (litige_statut in ('a_reclamer', 'reclame', 'avoir_recu', 'abandonne')),
  add column if not exists controle_at timestamptz,
  add column if not exists controle_par uuid references auth.users(id);
create index if not exists idx_commande_lignes_litige on public.commande_lignes (litige_statut) where litige_statut is not null;
