-- ============================================================
-- RESET COMPLET : Fournisseurs + Ingrédients
-- ⚠️  EXÉCUTER D'ABORD LES BACKUPS CI-DESSOUS
-- ============================================================

-- ═══════════════════════════════════════
-- PARTIE A — BACKUPS (exécuter un par un,
-- copier le JSON résultant et sauvegarder)
-- ═══════════════════════════════════════

-- Backup 1 : Ingrédients
-- SELECT json_agg(row_to_json(i)) FROM ingredients i;

-- Backup 2 : Fournisseurs
-- SELECT json_agg(row_to_json(s)) FROM suppliers s;

-- Backup 3 : Offres fournisseurs
-- SELECT json_agg(row_to_json(o)) FROM supplier_offers o;

-- Backup 4 : Factures + lignes
-- SELECT json_agg(row_to_json(t)) FROM (
--   SELECT si.*, json_agg(row_to_json(sl)) as lines
--   FROM supplier_invoices si
--   LEFT JOIN supplier_invoice_lines sl ON sl.invoice_id = si.id
--   GROUP BY si.id
-- ) t;

-- Backup 5 : Liens recettes ↔ ingrédients
-- SELECT json_agg(row_to_json(ri)) FROM recipe_ingredients ri;
-- SELECT json_agg(row_to_json(pi)) FROM pizza_ingredients pi;
-- SELECT json_agg(row_to_json(ki)) FROM kitchen_recipe_lines ki;
-- SELECT json_agg(row_to_json(ci)) FROM cocktail_ingredients ci;
-- SELECT json_agg(row_to_json(pl)) FROM prep_recipe_lines pl;

-- Backup 6 : Commande lignes
-- SELECT json_agg(row_to_json(cl)) FROM commande_lignes cl;

-- ═══════════════════════════════════════
-- PARTIE B — TRUNCATE
-- (exécuter APRÈS avoir sauvegardé les backups)
-- ═══════════════════════════════════════

-- TRUNCATE TABLE supplier_invoice_lines CASCADE;
-- TRUNCATE TABLE supplier_invoices CASCADE;
-- TRUNCATE TABLE supplier_offers CASCADE;
-- TRUNCATE TABLE commande_lignes CASCADE;
-- TRUNCATE TABLE recipe_ingredients CASCADE;
-- TRUNCATE TABLE pizza_ingredients CASCADE;
-- TRUNCATE TABLE kitchen_recipe_lines CASCADE;
-- TRUNCATE TABLE cocktail_ingredients CASCADE;
-- TRUNCATE TABLE prep_recipe_lines CASCADE;
-- TRUNCATE TABLE ingredients CASCADE;
-- TRUNCATE TABLE suppliers CASCADE;

-- ═══════════════════════════════════════
-- PARTIE C — RECRÉER LES FOURNISSEURS
-- (remplacer les UUIDs par ceux de vos établissements)
-- ═══════════════════════════════════════

-- Pour obtenir les UUIDs :
-- SELECT id, slug, nom FROM etablissements;

-- INSERT INTO suppliers (name, is_active, etablissement_id) VALUES
--   ('Maël',     true, 'BELLO_MIO_UUID'),
--   ('Metro',    true, 'BELLO_MIO_UUID'),
--   ('Masse',    true, 'BELLO_MIO_UUID'),
--   ('Cozigou',  true, 'BELLO_MIO_UUID'),
--   ('Vinoflo',  true, 'BELLO_MIO_UUID'),
--   ('Carniato', true, 'BELLO_MIO_UUID');
--
-- INSERT INTO suppliers (name, is_active, etablissement_id) VALUES
--   ('Maël',     true, 'PICCOLA_MIA_UUID'),
--   ('Metro',    true, 'PICCOLA_MIA_UUID'),
--   ('Cozigou',  true, 'PICCOLA_MIA_UUID'),
--   ('Carniato', true, 'PICCOLA_MIA_UUID');
