-- Écran de commande : unité « paquet » (café Cafés Celtik : « paquet de 1 kg », affiché « sachet » faute d'unité).
alter table public.commande_articles drop constraint if exists commande_articles_unite_commande_check;
alter table public.commande_articles add constraint commande_articles_unite_commande_check check (unite_commande = any (array[
  'piece','colis','carton','seau','pochette','barquette','bouteille','sachet','paquet','boite','bac','pot','plateau','filet','botte','fut','kg','litre']));
alter table public.commande_articles drop constraint if exists commande_articles_element_check;
alter table public.commande_articles add constraint commande_articles_element_check check (element = any (array[
  'piece','colis','carton','seau','pochette','barquette','bouteille','sachet','paquet','boite','bac','pot','plateau','filet','botte','fut']));

-- Fiches dont la fiche produit dit « paquet » mais dont la ligne de commande disait « sachet » (unité absente à l'époque)
update public.commande_articles ca set unite_commande = 'paquet', updated_at = now()
from public.ingredients i
where ca.ingredient_id = i.id and ca.unite_commande = 'sachet' and lower(coalesce(i.order_unit_label, '')) like 'paquet%';
