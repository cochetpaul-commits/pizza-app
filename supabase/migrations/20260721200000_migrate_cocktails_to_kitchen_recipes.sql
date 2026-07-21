-- Clean orphan cocktail_ingredients (cocktails deleted but lines remained)
DELETE FROM cocktail_ingredients WHERE cocktail_id NOT IN (SELECT id FROM cocktails);

-- Copy cocktails into kitchen_recipes (same IDs preserved)
INSERT INTO kitchen_recipes (
  id, user_id, name, category, fiche_type,
  notes, photo_url, is_draft, is_active,
  vat_rate, margin_rate, total_cost, cost_per_portion,
  sell_price, establishments, pivot_ingredient_id, etablissement_id,
  portions_count, nb_parts,
  description_courte, in_catalogue, statut,
  resume_salle, resume_manuel, accord,
  metadata, procedure,
  created_at, updated_at
)
SELECT
  c.id, c.user_id, c.name, 'cocktail', 'cocktail',
  c.garnish, c.image_url, c.is_draft, true,
  c.vat_rate, c.margin_rate, c.total_cost, c.total_cost,
  c.sell_price, c.establishments, c.pivot_ingredient_id, c.etablissement_id,
  1, 1,
  c.description_courte, c.in_catalogue, COALESCE(c.statut, 'publiee'),
  c.resume_salle, COALESCE(c.resume_manuel, false), c.accord,
  jsonb_build_object('type', c.type, 'glass', c.glass, 'garnish', c.garnish),
  c.steps,
  c.created_at, c.updated_at
FROM cocktails c
ON CONFLICT (id) DO NOTHING;

-- Copy cocktail_ingredients into kitchen_recipe_lines
INSERT INTO kitchen_recipe_lines (
  recipe_id, ingredient_id, qty, unit, zone, sort_order
)
SELECT
  ci.cocktail_id, ci.ingredient_id, ci.qty, ci.unit,
  COALESCE(ci.zone, 'apres_four'), COALESCE(ci.sort_order, 0)
FROM cocktail_ingredients ci
WHERE ci.cocktail_id IN (SELECT id FROM cocktails);

-- Move popina_products references
UPDATE popina_products
SET kitchen_recipe_id = cocktail_id, cocktail_id = NULL
WHERE cocktail_id IS NOT NULL;
