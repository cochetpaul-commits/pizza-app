-- Migrate pizza_recipes into kitchen_recipes (same IDs preserved)
INSERT INTO kitchen_recipes (
  id, user_id, name, category, fiche_type,
  notes, photo_url, is_draft, is_active,
  vat_rate, margin_rate, total_cost, cost_per_portion,
  sell_price, establishments, pivot_ingredient_id, etablissement_id,
  ball_weight_g, empatement, nb_parts, portions_count,
  description_courte, wine_pairing, in_catalogue, statut,
  resume_salle, resume_manuel, accord,
  created_at, updated_at
)
SELECT
  pr.id, pr.user_id, pr.name, 'pizza', 'recette',
  pr.notes, pr.photo_url, pr.is_draft, true,
  CASE WHEN pr.vat_rate > 1 THEN pr.vat_rate / 100.0 ELSE pr.vat_rate END,
  pr.margin_rate, pr.total_cost, pr.total_cost,
  pr.sell_price, pr.establishments, pr.pivot_ingredient_id, pr.etablissement_id,
  CAST(pr.ball_weight_g AS integer),
  COALESCE((SELECT r.name FROM recipes r WHERE r.id = pr.dough_recipe_id), 'FOCACCIA'),
  pr.nb_parts, pr.nb_parts,
  pr.description_courte, pr.wine_pairing, pr.in_catalogue, COALESCE(pr.statut, 'publiee'),
  pr.resume_salle, COALESCE(pr.resume_manuel, false), pr.accord,
  pr.created_at, pr.updated_at
FROM pizza_recipes pr
ON CONFLICT (id) DO NOTHING;

-- Migrate pizza_ingredients into kitchen_recipe_lines
INSERT INTO kitchen_recipe_lines (
  recipe_id, ingredient_id, qty, unit, zone, sort_order
)
SELECT
  pi.pizza_id,
  pi.ingredient_id,
  pi.qty,
  CAST(pi.unit AS text),
  CASE WHEN pi.stage = 'pre' THEN 'avant_four' ELSE 'apres_four' END,
  COALESCE(pi.sort_order, 0)
FROM pizza_ingredients pi
ON CONFLICT DO NOTHING;

-- Move popina_products references
UPDATE popina_products
SET kitchen_recipe_id = pizza_recipe_id, pizza_recipe_id = NULL
WHERE pizza_recipe_id IS NOT NULL;
