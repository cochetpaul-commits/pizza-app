-- Commandes Maël — étape 3 (retours du 28/09) : numéro client et pied de page par fiche fournisseur.
-- Le numéro client utilise la colonne existante suppliers.client_code (« Code client » de la page Fournisseurs).

-- Texte en pied du bon de commande et du mail (ex. « Rupture ou question : groupe WhatsApp Bello Mio – Maël »)
alter table public.suppliers add column if not exists pied_commande text;

-- Valeurs communiquées par Paul le 28/09 (une fiche Maël par établissement)
update public.suppliers s
   set client_code = '177',
       pied_commande = 'Rupture ou question : groupe WhatsApp Bello Mio – Maël'
  from public.etablissements e
 where e.id = s.etablissement_id and e.slug ilike '%bello%' and s.name = 'Mael' and s.commande_simplifiee;

update public.suppliers s
   set client_code = '265',
       pied_commande = 'Rupture ou question : groupe WhatsApp Piccola Mia – Maël'
  from public.etablissements e
 where e.id = s.etablissement_id and e.slug ilike '%piccola%' and s.name = 'Mael' and s.commande_simplifiee;
