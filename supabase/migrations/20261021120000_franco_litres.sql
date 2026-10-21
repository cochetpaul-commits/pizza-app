-- Minimum de commande en litres (Éric Élien, glaces : 10 L par commande, 21/10/2026)
alter table suppliers add column if not exists franco_litres numeric;
comment on column suppliers.franco_litres is 'Minimum de commande en litres (glacier Éric Élien : 10 L). Chaque article compte pour son contenu (ingredients.piece_volume_ml).';
update suppliers set franco_litres = 10 where id = '239f81ae-f53b-414d-a9cb-5a5cfe6b05ad';
