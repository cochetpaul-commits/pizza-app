-- 26/11/2026 : après la séparation des fiches par restaurant, la recopie des prix entre restaurants avait ajouté
-- chaque copie à la liste de commande du fournisseur de l'autre restaurant (déclencheur sur supplier_offers) :
-- doublons dans la commande simplifiée (« Aperitivo Aspide » deux fois chez Cozigou Bello Mio).
-- Nettoyage des 152 articles croisés et garde dans le déclencheur.

DELETE FROM commande_articles a USING suppliers s, ingredients i
WHERE s.id = a.supplier_id AND i.id = a.ingredient_id AND s.etablissement_id IS NOT NULL
  AND coalesce(array_length(i.establishments, 1), 0) = 1 AND i.etablissement_id IS NOT NULL AND s.etablissement_id <> i.etablissement_id;

CREATE OR REPLACE FUNCTION public.supplier_offers_cmd_article_trigger()
 RETURNS trigger LANGUAGE plpgsql AS $function$
declare i public.ingredients; d record;
begin
  if not coalesce(new.is_active, false) then return null; end if;
  if not exists (select 1 from suppliers s where s.id = new.supplier_id and coalesce(s.commande_simplifiee, false)) then return null; end if;
  if exists (select 1 from commande_articles where supplier_id = new.supplier_id and ingredient_id = new.ingredient_id) then return null; end if;
  select * into i from ingredients where id = new.ingredient_id;
  -- Une fiche d'un seul restaurant n'entre pas dans la liste de commande du fournisseur de l'autre
  if coalesce(array_length(i.establishments, 1), 0) = 1 and i.etablissement_id is not null
     and exists (select 1 from suppliers s where s.id = new.supplier_id and s.etablissement_id is not null and s.etablissement_id <> i.etablissement_id) then
    return null;
  end if;
  select * into d from public.cmd_conditionnement_fiche(i);
  if not found or d.unite_commande is null then
    insert into commande_articles (supplier_id, ingredient_id, unite_commande, contenu_nb) values (new.supplier_id, new.ingredient_id, 'piece', 1);
  else
    insert into commande_articles (supplier_id, ingredient_id, unite_commande, contenu_nb, element, element_qte, element_unite, commande_element_permise)
    values (new.supplier_id, new.ingredient_id, d.unite_commande, d.contenu_nb, d.element, d.element_qte, d.element_unite, d.commande_element_permise);
  end if;
  return null;
end $function$;
