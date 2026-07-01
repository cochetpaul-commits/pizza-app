-- Normalise margin_rate : les valeurs > 10 sont des taux de marge en %
-- (ancienne convention du form), le code actuel les interprete comme
-- coefficient de vente -> ×77 au lieu de ×4.35, prix demesures.
--
-- Regle : margin_rate > 10 devient coefficient normalise
--   77% -> ×4.35    86% -> ×7.14
--   60% -> ×2.50    75% -> ×4.00
--
-- Formule : coeff = ROUND(100 / (100 - margin_rate), 2)
--
-- Idempotent : apres conversion les valeurs sont entre 1 et 10, donc
-- la migration re-executee ne fera plus rien (WHERE ne matche plus).

update public.pizza_recipes
set margin_rate = round((100.0 / (100.0 - margin_rate))::numeric, 2)
where margin_rate > 10 and margin_rate < 100;

update public.kitchen_recipes
set margin_rate = round((100.0 / (100.0 - margin_rate))::numeric, 2)
where margin_rate > 10 and margin_rate < 100;
