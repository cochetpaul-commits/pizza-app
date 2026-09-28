-- « Dernière commande » à la place de « D'habitude » : Vinoflo, Oenoplaisir, Cafés Celtik (toutes leurs fiches) et Carniato Piccola Mia
update public.suppliers set indication_quantite = 'derniere_commande'
 where id in ('0138a0bf-298e-42df-90ff-6a7c79d8adfe', '405f45bf-0df5-43f5-8fda-5111a0f18c95', -- Vinoflo
              '35cf3c1e-070d-4b17-a62e-863a2732f602',                                         -- Oenoplaisir
              '66a991aa-66f8-4506-bebc-d7c7f02cee1a', '1dd3cdf3-2161-4d11-ac76-391c5b8ac271', -- Cafés Celtik
              '133a644e-f903-433c-b025-7bcd643b5cea');                                        -- Carniato Piccola Mia
