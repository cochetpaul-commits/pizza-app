-- 12/11/2026 : allergènes manquants sur des produits bruts sans ambiguïté (constat en préparant le quiz carte).
-- On ne touche qu'aux fiches sans allergène renseigné ; rien n'est retiré.
update public.ingredients set allergens = case
  when name ~* 'gambas' then '["Crustacés"]'
  when name ~* '(encornet|calamar|poulpe)' then '["Mollusques"]'
  else '["Poisson"]' end
where allergens is null and (name ~* '(gambas|encornet|calamar|poulpe|worcester)' or name = 'ARO THON NAT LISTAO 1/6X3');
