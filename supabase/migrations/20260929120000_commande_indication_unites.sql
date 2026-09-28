-- Écran de commande : indication de quantité par fournisseur, nouvelles unités (filet, botte, fût).

-- 5. Indication affichée sous chaque produit : médiane habituelle, ou quantité de la dernière commande envoyée
alter table public.suppliers add column if not exists indication_quantite text not null default 'habitude';
alter table public.suppliers drop constraint if exists suppliers_indication_quantite_check;
alter table public.suppliers add constraint suppliers_indication_quantite_check
  check (indication_quantite in ('habitude', 'derniere_commande'));
update public.suppliers set indication_quantite = 'derniere_commande'
 where id in ('5d99bebc-658d-4dbe-a8dd-c2efd32f9421', 'eaaf8500-2fde-4f15-a2df-292a4485da14'); -- Carniato, Cozigou

-- 7. Unités permises : + filet, botte, fut
alter table public.commande_articles drop constraint if exists commande_articles_unite_commande_check;
alter table public.commande_articles add constraint commande_articles_unite_commande_check check (unite_commande = any (array[
  'piece','colis','carton','seau','pochette','barquette','bouteille','sachet','boite','bac','pot','plateau','filet','botte','fut','kg','litre']));
alter table public.commande_articles drop constraint if exists commande_articles_element_check;
alter table public.commande_articles add constraint commande_articles_element_check check (element = any (array[
  'piece','colis','carton','seau','pochette','barquette','bouteille','sachet','boite','bac','pot','plateau','filet','botte','fut']));
