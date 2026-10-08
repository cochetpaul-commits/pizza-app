-- Page Ventes (08/10/2026) : les tendances sont calculées en base, et les indicateurs d'une période
-- sont mis en cache côté serveur tant que ses lignes de vente n'ont pas changé.

-- Tendance par jour (et par catégorie si demandé) : mêmes filtres que l'ancienne route
-- /api/ventes/marges/trend (lignes Produit, non annulées, TTC > 0).
create or replace function public.ventes_tendance_jour(
  p_etab uuid, p_from date, p_to date,
  p_product text default null, p_category text default null, p_service text default null,
  p_par_categorie boolean default false)
returns table(categorie text, date_service text, qty numeric, ca_ttc numeric, ca_ht numeric)
language sql stable
as $fn$
  select case when p_par_categorie then coalesce(nullif(v.categorie, ''), 'Autre') else null end as categorie,
         to_char(v.date_service, 'YYYY-MM-DD') as date_service,
         round(sum(coalesce(nullif(v.quantite, 0), 1))::numeric, 2) as qty,
         round(sum(v.ttc)::numeric, 2) as ca_ttc,
         round(sum(v.ht)::numeric, 2) as ca_ht
    from public.ventes_lignes v
   where v.etablissement_id = p_etab
     and v.type_ligne = 'Produit' and v.annule = false and v.ttc > 0
     and v.date_service >= p_from and v.date_service <= p_to
     and (p_product is null or v.description = p_product)
     and (p_product is not null or p_category is null or v.categorie = p_category)
     and (p_service is null or v.service = p_service)
   group by 1, 2
   order by 1, 2
$fn$;

-- Totaux par produit sur la période (classés par HT décroissant).
create or replace function public.ventes_tendance_produits(
  p_etab uuid, p_from date, p_to date,
  p_product text default null, p_category text default null, p_service text default null)
returns table(name text, qty numeric, ca_ttc numeric, ca_ht numeric)
language sql stable
as $fn$
  select coalesce(nullif(v.description, ''), 'Autre') as name,
         round(sum(coalesce(nullif(v.quantite, 0), 1))::numeric) as qty,
         round(sum(v.ttc)::numeric, 2) as ca_ttc,
         round(sum(v.ht)::numeric, 2) as ca_ht
    from public.ventes_lignes v
   where v.etablissement_id = p_etab
     and v.type_ligne = 'Produit' and v.annule = false and v.ttc > 0
     and v.date_service >= p_from and v.date_service <= p_to
     and (p_product is null or v.description = p_product)
     and (p_product is not null or p_category is null or v.categorie = p_category)
     and (p_service is null or v.service = p_service)
   group by 1
   order by ca_ht desc
$fn$;

-- Cache des indicateurs d'une période (résultat de aggregate() dans /api/ventes/stats).
-- Lu et écrit par le serveur uniquement (RLS sans politique : seule la clé service y accède).
create table if not exists public.ventes_stats_cache (
  etablissement_id uuid not null,
  du date not null,
  au date not null,
  version text not null,
  stats jsonb not null,
  calcule_le timestamptz not null default now(),
  primary key (etablissement_id, du, au)
);
alter table public.ventes_stats_cache enable row level security;

-- Empreinte des lignes de vente d'une période : nombre de lignes, dernier import, nombre de produits
-- Popina actifs (les sous-catégories en dépendent). Si elle change, le cache est recalculé.
create or replace function public.ventes_version(p_etab uuid, p_from date, p_to date)
returns text language sql stable as $fn$
  select (select count(*)::text || '-' || coalesce(max(v.imported_at)::text, '')
            from public.ventes_lignes v
           where v.etablissement_id = p_etab and v.date_service >= p_from and v.date_service <= p_to)
         || '-' || (select count(*)::text from public.popina_products p where p.active)
$fn$;

-- Accueil « point du jour » (étape 2 de la refonte) : ventes par jour et service, et compteurs.
create or replace function public.accueil_ventes_jour(p_etab uuid, p_from date, p_to date)
returns table(jour text, service text, ca_ttc numeric, tickets bigint, couverts bigint)
language sql stable as $fn$
  with t as (
    select v.date_service, coalesce(v.service, 'autre') as service, v.num_fiscal,
           sum(case when v.type_ligne = 'Produit' and v.annule = false then v.ttc else 0 end) as ttc,
           max(coalesce(v.couverts, 0)) as couverts
      from public.ventes_lignes v
     where v.etablissement_id = p_etab and v.date_service >= p_from and v.date_service <= p_to
     group by 1, 2, 3)
  select to_char(t.date_service, 'YYYY-MM-DD') as jour, t.service,
         round(sum(t.ttc)::numeric, 2) as ca_ttc, count(*) as tickets, sum(t.couverts)::bigint as couverts
    from t group by 1, 2 order by 1, 2
$fn$;

create or replace function public.accueil_compteurs(p_etab uuid, p_debut_mois date)
returns table(produits_actifs bigint, produits_sans_prix bigint, fiches bigint, employes bigint,
              commandes_brouillon bigint, commandes_envoyees bigint, factures_mois bigint, factures_mois_ht numeric)
language sql stable as $fn$
  select (select count(*) from public.ingredients i where i.is_active),
         (select count(*) from public.ingredients i where i.is_active
             and not exists (select 1 from public.supplier_offers o where o.ingredient_id = i.id and o.is_active)),
         (select count(*) from public.kitchen_recipes k where k.is_active),
         (select count(*) from public.employes e where e.actif and e.etablissement_id = p_etab),
         (select count(*) from public.commande_sessions c where c.etablissement_id = p_etab and c.status in ('brouillon', 'en_attente')),
         (select count(*) from public.commande_sessions c where c.etablissement_id = p_etab and c.status in ('validee', 'envoyee')),
         (select count(*) from public.supplier_invoices f where f.etablissement_id = p_etab and f.invoice_date >= p_debut_mois),
         (select coalesce(round(sum(f.total_ht)::numeric), 0) from public.supplier_invoices f where f.etablissement_id = p_etab and f.invoice_date >= p_debut_mois)
$fn$;
