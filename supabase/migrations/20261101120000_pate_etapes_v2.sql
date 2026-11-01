-- Module pâte, brief v2 (01/11/2026) : la température de l'eau ne se fixe plus dans la recette, elle se calcule
-- à chaque fournée. Les étapes par défaut des recettes biga et directe sont remplacées (src/lib/pateEtapes.ts).
update public.recipes set procedure = '["Veille au matin : délayer la levure dans l''eau de biga, ajouter la farine de biga, mélanger 3 min en marche arrière, s''arrêter dès que la farine est hydratée. Bac légèrement huilé, couvert, au froid à 4 °C pendant 24 h (fenêtre 20 à 30 h).","Veille : peser la farine du pétrissage final (stockée à température ambiante, pas au froid), le sel, l''eau de départ avec le miel dissous, l''eau de bassinage.","Jour J : eau de départ et biga coupée en morceaux, vitesse 1 pendant 2 min.","Ajouter la farine du pétrissage final, continuer en vitesse 1.","À 7 min de vitesse 1 : ajouter le sel.","Sel absorbé : bassinage en filet ; fin de vitesse 1 à 10 ou 11 min.","Vitesse 2 pendant 4 min 30 en terminant le bassinage.","Repos 3 min, puis un tour de vitesse 1.","Contrôles : test du voile, température de pâte entre 22 et 24 °C.","Division en grosses boules, rabats, filet d''huile d''olive, détaillage au poids du pâton (tolérance 5 g), boulage, 12 pâtons par bac."]'
  where type = 'biga';
update public.recipes set procedure = '["Veille : peser toutes les farines (stockées à température ambiante, pas au froid), le sel, l''eau de départ avec le miel dissous, l''eau de bassinage.","Jour J : délayer la levure dans l''eau de départ avec le miel, verser en cuve, vitesse 1 pendant 2 min.","Ajouter toutes les farines, continuer en vitesse 1.","À 7 min de vitesse 1 : ajouter le sel.","Sel absorbé : bassinage en filet ; fin de vitesse 1 à 10 ou 11 min.","Vitesse 2 pendant 4 min 30 en terminant le bassinage.","Repos 3 min, puis un tour de vitesse 1.","Contrôles : test du voile, température de pâte entre 22 et 24 °C.","Division en grosses boules, rabats, filet d''huile d''olive, détaillage au poids du pâton (tolérance 5 g), boulage, 12 pâtons par bac."]'
  where type = 'direct';
-- Un coût de recette n'est enregistré que s'il est complet (tous les ingrédients liés) : les coûts partiels sont effacés
alter table public.recipes alter column total_cost drop not null;
update public.recipes set total_cost = null where type in ('biga', 'direct', 'focaccia') and coalesce(total_cost, 0) > 0 and (
  ingredient_links is null or ingredient_links->>'flour1' is null or ingredient_links->>'salt' is null
  or (coalesce(honey_percent, 0) > 0 and ingredient_links->>'honey' is null)
  or (coalesce(oil_percent, 0) > 0 and ingredient_links->>'oil' is null)
  or ingredient_links->>'yeast' is null
);
