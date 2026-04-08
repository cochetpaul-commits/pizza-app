-- ============================================================================
-- Partage complet des données entre utilisateurs authentifiés
-- ============================================================================
-- Avant : chaque table filtrait via (user_id = auth.uid()) → un nouvel employé
-- ne voyait rien (toutes les données appartenaient au compte admin initial).
--
-- Après : tout utilisateur authentifié peut lire + écrire sur les tables
-- partagées. Le contrôle de qui peut modifier quoi est fait côté app via
-- src/lib/rbac.ts (ex: canWrite). Cela matche le modèle d'une app restaurant
-- multi-utilisateur où la base produits est commune.
--
-- Les tables à portée strictement personnelle (profils, préférences)
-- ne sont PAS touchées.
-- ============================================================================

DO $$
DECLARE
  tbl text;
  pol record;
  shared_tables text[] := ARRAY[
    -- Catalogue & achats
    'ingredients',
    'suppliers',
    'supplier_offers',
    'supplier_invoices',
    'supplier_invoice_lines',
    'supplier_skus',
    -- Recettes
    'pizza_recipes',
    'pizza_ingredients',
    'kitchen_recipes',
    'kitchen_recipe_lines',
    'prep_recipes',
    'prep_recipe_lines',
    'cocktails',
    'cocktail_ingredients',
    'cocktail_recipes',
    'recipes',
    'recipe_phases',
    'recipe_ingredients',
    'recipe_flours',
    'recipe_lines',
    'recipe_templates',
    'flours',
    'flour_blends',
    'formula_lines',
    'doughs',
    'batches',
    'batch_results',
    'pizzas',
    -- Commandes
    'commande_sessions',
    'commande_lignes',
    -- Événements
    'events',
    'event_recipes',
    'event_documents'
  ];
BEGIN
  FOREACH tbl IN ARRAY shared_tables LOOP
    -- Vérifier que la table existe
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      -- Activer RLS (no-op si déjà activée)
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);

      -- Supprimer toutes les policies existantes sur cette table
      FOR pol IN
        SELECT policyname FROM pg_policies
        WHERE schemaname = 'public' AND tablename = tbl
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, tbl);
      END LOOP;

      -- Policy unique : tout authentifié peut tout faire
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
        tbl || '_authenticated_all',
        tbl
      );
    END IF;
  END LOOP;
END $$;
