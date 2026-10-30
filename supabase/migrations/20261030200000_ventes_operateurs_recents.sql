-- Fiche employé (30/10/2026) : les opérateurs Popina des 90 derniers jours, par une fonction au lieu de 2 000 lignes lues côté client.
create or replace function ventes_operateurs_recents(p_etab uuid, p_depuis date)
returns table (operateur text)
language sql stable security definer set search_path = public as $$
  select distinct trim(v.operateur) as operateur
  from ventes_lignes v
  where v.etablissement_id = p_etab and v.date_service >= p_depuis and v.operateur is not null and trim(v.operateur) <> ''
  order by 1
$$;
grant execute on function ventes_operateurs_recents(uuid, date) to authenticated, service_role;
