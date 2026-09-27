-- Commandes Maël — étape 3 : validation, envoi, droits.

-- 1. Statut « envoyee » (mail parti). Élargissement de la liste existante, aucune donnée modifiée.
--    (accord du 28/09 : seule modification d'une règle existante de cette étape)
alter table public.commande_sessions drop constraint if exists commande_sessions_status_check;
alter table public.commande_sessions add constraint commande_sessions_status_check
  check (status in ('brouillon', 'en_attente', 'validee', 'envoyee', 'recue', 'annulee'));

-- 2. Journal de tous les envois (réussis ou non), pas seulement du dernier
create table if not exists public.commande_envois (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null references public.commande_sessions(id) on delete cascade,
  envoye_le         timestamptz not null default now(),
  envoye_par        uuid references public.profiles(id),
  destinataires     text[] not null default '{}',
  sujet             text,
  livraison_prevue  date,
  resend_id         text,
  succes            boolean not null,
  erreur            text
);
create index if not exists idx_commande_envois_session on public.commande_envois (session_id, envoye_le desc);

alter table public.commande_envois enable row level security;
drop policy if exists commande_envois_lecture on public.commande_envois;
create policy commande_envois_lecture on public.commande_envois
  for select to authenticated using (true);
-- Écriture uniquement par le serveur (service role)

-- 3. Adresses de livraison des établissements (communiquées par Paul le 28/09)
update public.etablissements set adresse = '3 place du Poncel, 35400 Saint-Malo' where slug ilike '%bello%';
update public.etablissements set adresse = '57 rue Ville Pépin, 35400 Saint-Malo' where slug ilike '%piccola%';
