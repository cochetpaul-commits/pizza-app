-- Objectifs et services type (30/10/2026) : les journaux Kezia (Piccola Mia) comptent comme une « journee » par jour
-- quand il n'y a pas de lignes de caisse ce jour-là ; les tickets tiennent lieu de couverts.
create or replace function ventes_services_periode(p_etab uuid, p_from date, p_to date)
returns table(date_service date, service text, ca_ht numeric, ca_ttc numeric, couverts bigint, tickets bigint)
language sql stable security definer set search_path to 'public' as $$
  with t as (
    select date_service, coalesce(service, 'soir') as service, num_fiscal,
      max(couverts) as cov,
      sum(case when type_ligne = 'Produit' and annule = false then ht else 0 end) as ht,
      sum(case when type_ligne = 'Produit' and annule = false then ttc else 0 end) as ttc
    from ventes_lignes
    where etablissement_id = p_etab and date_service between p_from and p_to
    group by 1, 2, 3
  ), popina as (
    select date_service, service, coalesce(sum(ht), 0)::numeric as ca_ht, coalesce(sum(ttc), 0)::numeric as ca_ttc,
      coalesce(sum(cov), 0)::bigint as couverts, count(*)::bigint as tickets
    from t group by 1, 2
  ), kezia as (
    select d.date as date_service, 'journee'::text as service, coalesce(d.ca_ht, 0)::numeric, coalesce(d.ca_ttc, 0)::numeric,
      coalesce(nullif(d.couverts, 0), d.tickets, 0)::bigint as couverts, coalesce(d.tickets, 0)::bigint as tickets
    from daily_sales d
    where d.etablissement_id = p_etab and d.date between p_from and p_to
      and coalesce(d.source, '') not in ('kezia_products', 'kezia_article_stats')
      and d.date not in (select distinct t.date_service from t)
  )
  select * from popina union all select * from kezia order by 1, 2;
$$;
