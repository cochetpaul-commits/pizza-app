-- Rentabilité plats (10/10/2026) : la sous-catégorie Popina de chaque produit vendu,
-- pour afficher et filtrer catégories et sous-catégories du menu de la caisse.
-- Nouvelle fonction (ventes_par_produit garde sa signature : l'accueil et la Carte l'appellent).
create or replace function public.ventes_par_produit_sc(p_etab uuid, p_from date, p_to date)
 returns table(description text, categorie text, sous_categorie text, qty numeric, ca_ttc numeric, ca_ht numeric)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select description,
         min(coalesce(nullif(categorie, ''), 'Autre')) as categorie,
         min(coalesce(nullif(sous_categorie, ''), '')) as sous_categorie,
         sum(coalesce(quantite,1)) as qty, sum(ttc) as ca_ttc, sum(ht) as ca_ht
  from ventes_lignes
  where etablissement_id = p_etab and date_service between p_from and p_to
    and type_ligne = 'Produit' and annule = false and ttc > 0
    and upper(coalesce(categorie,'')) <> 'MESSAGES' and description is not null
  group by description;
$function$;
grant execute on function public.ventes_par_produit_sc(uuid, date, date) to authenticated, service_role;
