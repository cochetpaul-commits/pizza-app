-- À appliquer au merge du code qui connaît filet / botte / fut (sinon l'écran de commande plante).

-- Terre Azur : ail, citron vert, oignons jaune et rouge, orange → au filet ; origan → à la botte
update public.commande_articles set element = 'filet'
 where supplier_id = 'd8cbe7d1-b6bd-43c2-895e-231c81111f38' and element = 'sachet'
   and ingredient_id in ('f3525045-6dd0-48c6-9bfb-3e1635aa0e43', '080db0fd-50ec-4fdb-8860-99f3154be37b',
                         '9a62d6f1-1c99-45db-91cb-29e70c0c73c1', 'a9dcd05b-3387-4e8f-80bd-97e95cbde114',
                         'c0586121-8e5a-4359-905f-910037d77f5f');
update public.commande_articles set unite_commande = 'botte'
 where supplier_id = 'd8cbe7d1-b6bd-43c2-895e-231c81111f38' and ingredient_id = '9a35709d-3333-4963-bbce-ac2a05d77864';
-- Cozigou : fût Moretti 30 L
update public.commande_articles set unite_commande = 'fut'
 where supplier_id = 'eaaf8500-2fde-4f15-a2df-292a4485da14' and ingredient_id = '152ca66e-b8c2-4d74-aca7-70e95b567f6c';

-- Brouillons en cours : l'unité enregistrée sur la ligne suit le nouveau libellé (sinon la quantité n'apparaît plus)
update public.commande_lignes l set unite = regexp_replace(l.unite, '^sachet', 'filet')
  from public.commande_sessions s
 where s.id = l.session_id and s.status = 'brouillon' and l.unite like 'sachet%'
   and l.ingredient_id in ('f3525045-6dd0-48c6-9bfb-3e1635aa0e43', '080db0fd-50ec-4fdb-8860-99f3154be37b',
                           '9a62d6f1-1c99-45db-91cb-29e70c0c73c1', 'a9dcd05b-3387-4e8f-80bd-97e95cbde114',
                           'c0586121-8e5a-4359-905f-910037d77f5f');
update public.commande_lignes l set unite = 'botte'
  from public.commande_sessions s
 where s.id = l.session_id and s.status = 'brouillon' and l.unite = 'pièce' and l.ingredient_id = '9a35709d-3333-4963-bbce-ac2a05d77864';
update public.commande_lignes l set unite = 'fût'
  from public.commande_sessions s
 where s.id = l.session_id and s.status = 'brouillon' and l.unite = 'pièce' and l.ingredient_id = '152ca66e-b8c2-4d74-aca7-70e95b567f6c';
