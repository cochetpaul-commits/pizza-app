-- Fiche produit (08/10/2026) : le menu des sous-catégories se remplit depuis la base, et non plus depuis
-- les produits affichés à l'écran (après une recherche, il ne proposait plus que la sous-catégorie du
-- produit trouvé). Sous-catégories distinctes par catégorie, pour l'établissement demandé.
create or replace function public.sous_categories_produits(p_etab text default null)
returns table(category text, sub_category text)
language sql stable
as $fn$
  select distinct i.category::text, i.sub_category
    from public.ingredients i
   where i.sub_category is not null and i.is_active
     and (p_etab is null or i.establishments is null or i.establishments::text[] @> array[p_etab]::text[])
   order by 1, 2
$fn$;
