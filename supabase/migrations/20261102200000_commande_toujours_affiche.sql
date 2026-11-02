-- Commande simplifiée (02/11/2026, Paul) : un produit « toujours affiché » apparaît dans la liste de commande
-- sans passer par la recherche, même s'il n'est pas assez acheté pour être un habituel.
alter table public.commande_articles add column if not exists toujours_affiche boolean not null default false;
-- Mael (Bello Mio et Piccola Mia) : les produits de la liste de Paul
update public.commande_articles set toujours_affiche = true
where supplier_id in (select id from public.suppliers where lower(name) = 'mael')
  and ingredient_id in (
    '5b3ed382-3dd4-483d-941f-52bfcc005f39', -- huile de friture Cuisinor 5 L
    '24ba6142-6862-4ff2-b861-2da1841c1c00', -- sucre en poudre (semoule) 1 kg
    '5979f132-4d92-48a8-af46-0ce31475f2e1', -- coppa de Parme
    '1362ec4b-4612-4bd0-b288-df2591ce95ab', -- salame Scudetto type Golfetta
    '5deaddb5-d5dc-4741-bf62-fb406824403b', -- sauce noire à la truffe 500 g
    '3c60e2b8-d950-406b-9558-3733a12fc8b7', -- capron 650 g
    '2f897784-2bd7-4662-ad98-2c74d9a20097', -- sel fin 1 kg
    '824495c4-8a07-4521-92d4-e9df42eeb1cb', -- gros sel
    '737c7d2b-83fe-4299-bee5-66fb515818e7', -- farine T55 1 kg
    '12ef03eb-89a5-419d-bc51-c3f9e0498ea6', -- sucre cassonade 1 kg
    'af1946f1-d90f-418b-ad96-98480daafd77', -- riz arborio 1 kg
    'e32f6007-1a48-442f-8699-68c471996239', -- riz carnaroli 1 kg
    '54fea206-0fc9-4087-ac31-24f01d511386'  -- tomate cerise confite
  );
