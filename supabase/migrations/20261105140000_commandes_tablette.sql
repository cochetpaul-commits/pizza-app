-- 05/11/2026 : commandes et réceptions signées par l'employé de la tablette (code à 4 chiffres), pas par le compte partagé.
-- Commande simplifiée : chaque employé de la tablette a sa propre quantité (clé auteur = « e:<employe_id> »,
-- vide pour un compte personnel), elles s'additionnent au lieu de s'écraser.
alter table public.commande_ligne_apports add column if not exists auteur text not null default '',
  add column if not exists auteur_nom text, add column if not exists employe_id uuid references public.employes(id) on delete set null;
alter table public.commande_ligne_apports drop constraint if exists commande_ligne_apports_personne;
alter table public.commande_ligne_apports add constraint commande_ligne_apports_personne unique (ligne_id, user_id, auteur);
alter table public.commande_sessions add column if not exists created_by_nom text, add column if not exists modifie_par_nom text,
  add column if not exists valide_par_nom text, add column if not exists recu_par_nom text;
alter table public.commande_lignes add column if not exists modifie_par_nom text, add column if not exists controle_par_nom text;
alter table public.commande_envois add column if not exists envoye_par_nom text;
-- Mise à jour en direct : un écran qui affiche une commande se recharge quand quelqu'un d'autre la modifie
alter publication supabase_realtime add table public.commande_sessions;
