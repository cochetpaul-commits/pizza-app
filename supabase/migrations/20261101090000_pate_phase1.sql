-- Module pâte, phase 1 (01/11/2026) : paramètres de recette pour le calculateur d'empâtements.
-- biga_flour : farine qui remplit la biga en priorité ; water_start_pct : part de l'eau du pétrissage
-- versée au départ (le reste en bassinage) ; loss_margin_pct : marge de perte sur le poids du pâton ;
-- mixer_max_balls : capacité du pétrin en pâtons (au delà, deux pétrissages).
alter table public.recipes
  add column if not exists biga_flour text,
  add column if not exists water_start_pct numeric not null default 80,
  add column if not exists loss_margin_pct numeric not null default 1.5,
  add column if not exists mixer_max_balls integer not null default 215;

-- Recettes existantes : le pâton se détaille à 260 g et se calcule à 264 g (marge 1,5 %) ;
-- la biga à 50 % de la farine, hydratée à 45 %, remplie de tipo 0. Les focacce gardent leur poids tel quel.
update public.recipes set ball_weight = 260 where type in ('biga', 'direct') and ball_weight = 264;
update public.recipes set loss_margin_pct = 0 where type = 'focaccia';
update public.recipes set biga_percent = coalesce(biga_percent, 50), biga_hydration = coalesce(biga_hydration, 45),
  biga_yeast_percent = case when coalesce(biga_yeast_percent, 0) = 0 then 0.5 else biga_yeast_percent end
  where type = 'biga';
update public.recipes r set biga_flour = (
  select f->>'name' from jsonb_array_elements(r.flour_mix) f where f->>'name' ilike '%tipo 0%' limit 1
) where type = 'biga' and biga_flour is null;
-- Pâte directe : essai en cours à 0,18 % de levure fraîche sur la farine totale (brief 01/11/2026)
update public.recipes set yeast_percent = 0.18 where type = 'direct' and name ilike 'DIRETTO%';
