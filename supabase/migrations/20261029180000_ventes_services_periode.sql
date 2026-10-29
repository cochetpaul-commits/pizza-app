-- Objectifs (29/10/2026) : CA HT/TTC et couverts par date de service et service (midi/soir),
-- couverts dédoublonnés par ticket (max des lignes d'un même num_fiscal), comme /api/ventes/stats.
create or replace function public.ventes_services_periode(p_etab uuid, p_from date, p_to date)
returns table(date_service date, service text, ca_ht numeric, ca_ttc numeric, couverts bigint, tickets bigint)
language sql stable security definer set search_path = public as $$
  with t as (
    select date_service, coalesce(service, 'soir') as service, num_fiscal,
      max(couverts) as cov,
      sum(case when type_ligne = 'Produit' and annule = false then ht else 0 end) as ht,
      sum(case when type_ligne = 'Produit' and annule = false then ttc else 0 end) as ttc
    from ventes_lignes
    where etablissement_id = p_etab and date_service between p_from and p_to
    group by 1, 2, 3
  )
  select date_service, service, coalesce(sum(ht), 0)::numeric, coalesce(sum(ttc), 0)::numeric,
    coalesce(sum(cov), 0)::bigint, count(*)::bigint
  from t group by 1, 2 order by 1, 2;
$$;
revoke all on function public.ventes_services_periode(uuid, date, date) from public;
grant execute on function public.ventes_services_periode(uuid, date, date) to service_role;
