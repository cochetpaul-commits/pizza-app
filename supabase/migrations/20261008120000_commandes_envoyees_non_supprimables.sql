-- Vécu 08/10/2026 : quatre commandes (dont une Carniato déjà envoyée au fournisseur) supprimées depuis
-- la liste « commandes en cours » parce que l'entrée restait affichée après l'envoi. La suppression est
-- en cascade (lignes, journal des envois) : il ne reste aucune trace.
-- Règle : une commande envoyée ou reçue ne se supprime pas. Pour la retirer, on la passe en « annulee »
-- (elle reste dans l'historique). Les lignes d'une commande envoyée ou reçue ne se suppriment pas non plus
-- (le client efface les lignes avant la session) ; pour modifier, on repasse d'abord la commande en brouillon.

create or replace function public.commande_session_interdire_suppression()
returns trigger
language plpgsql
as $$
begin
  if old.status in ('envoyee', 'recue') then
    raise exception 'Commande deja envoyee : elle ne peut pas etre supprimee (passez-la en annulee).'
      using errcode = 'P0001';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_commande_session_interdire_suppression on public.commande_sessions;
create trigger trg_commande_session_interdire_suppression
  before delete on public.commande_sessions
  for each row execute function public.commande_session_interdire_suppression();

create or replace function public.commande_ligne_interdire_suppression()
returns trigger
language plpgsql
as $$
declare
  statut text;
begin
  select status into statut from public.commande_sessions where id = old.session_id;
  if statut in ('envoyee', 'recue') then
    raise exception 'Commande deja envoyee : ses lignes ne peuvent pas etre supprimees.'
      using errcode = 'P0001';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_commande_ligne_interdire_suppression on public.commande_lignes;
create trigger trg_commande_ligne_interdire_suppression
  before delete on public.commande_lignes
  for each row execute function public.commande_ligne_interdire_suppression();
