-- Par produit (30/10/2026) : ventes agrégées par jour, service, catégorie et produit, pour la tendance et le midi/soir.
create or replace function ventes_produits_periode(p_etab uuid, p_from date, p_to date)
returns table (date_service date, service text, categorie text, description text, qty bigint, ht numeric, ttc numeric)
language sql stable security definer set search_path = public as $$
  select v.date_service, coalesce(v.service, 'midi') as service, coalesce(nullif(v.categorie, ''), 'Autre') as categorie, v.description,
         sum(coalesce(v.quantite, 1))::bigint as qty, sum(coalesce(v.ht, 0)) as ht, sum(coalesce(v.ttc, 0)) as ttc
  from ventes_lignes v
  where v.etablissement_id = p_etab and v.date_service between p_from and p_to
    and v.type_ligne = 'Produit' and coalesce(v.annule, false) = false and v.description is not null
  group by 1, 2, 3, 4
$$;
revoke all on function ventes_produits_periode(uuid, date, date) from public, anon;
grant execute on function ventes_produits_periode(uuid, date, date) to authenticated, service_role;
