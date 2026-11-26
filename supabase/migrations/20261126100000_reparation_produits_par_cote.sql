-- Réparation du 26/11/2026 : la fusion de doublons avait recollé des fiches séparées entre Bello Mio et Piccola Mia
-- (recettes, offres, inventaires, commandes et stock de l'un pointant vers la fiche de l'autre). Pour chaque fiche
-- utilisée par l'autre restaurant, sa copie de ce côté est retrouvée ou recréée (copier_produit_vers) et ce qui
-- est de ce côté y est rebranché. Puis une fiche sans offre active reprend, comme référence, les offres actives
-- de sa jumelle. Exécutée le 26/11/2026 (100 fiches, 55 lignes de recettes, 299 offres, 149 prix repris).
-- p_appliquer = false : aperçu (tout est annulé et le rapport est renvoyé dans l'erreur).

CREATE OR REPLACE FUNCTION public.reparer_produits_par_cote(p_appliquer boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record; v uuid; k int;
  c_fiches int := 0; c_offres int := 0; c_recettes int := 0; c_inv int := 0; c_cmd int := 0; c_stock int := 0; c_zones int := 0; c_autres int := 0; c_prix int := 0;
  v_rapport jsonb;
BEGIN
  FOR r IN
    WITH e AS (SELECT 'bellomio' k, '93dddd48-21f5-44e9-83aa-024af53bce83'::uuid id, 'bello_mio' kr UNION ALL SELECT 'piccola', 'a1259b66-86b2-439d-b9fa-f38404fcdb83'::uuid, 'piccola')
    SELECT DISTINCT i.id, e.k, e.id etab, e.kr FROM ingredients i CROSS JOIN e
    WHERE coalesce(i.source,'') <> 'recette_maison' AND coalesce(array_length(i.establishments,1),0) > 0 AND NOT (e.k = ANY(i.establishments)) AND (
      EXISTS (SELECT 1 FROM kitchen_recipe_lines l JOIN kitchen_recipes rr ON rr.id=l.recipe_id WHERE l.ingredient_id=i.id AND rr.establishments=ARRAY[e.kr])
      OR EXISTS (SELECT 1 FROM supplier_offers o JOIN suppliers s ON s.id=o.supplier_id WHERE o.ingredient_id=i.id AND o.is_active AND s.etablissement_id=e.id)
      OR EXISTS (SELECT 1 FROM inventaire_lignes l JOIN inventaires vv ON vv.id=l.inventaire_id WHERE l.ingredient_id=i.id AND vv.etablissement_id=e.id)
      OR EXISTS (SELECT 1 FROM commande_lignes l JOIN commande_sessions s ON s.id=l.session_id WHERE l.ingredient_id=i.id AND s.etablissement_id=e.id))
  LOOP
    v := copier_produit_vers(r.id, r.k);
    c_fiches := c_fiches + 1;
    UPDATE supplier_offers o SET ingredient_id = v, establishment = r.k FROM suppliers s WHERE o.ingredient_id = r.id AND s.id = o.supplier_id AND s.etablissement_id = r.etab
      AND NOT (o.is_active AND EXISTS (SELECT 1 FROM supplier_offers o2 WHERE o2.ingredient_id = v AND o2.supplier_id = o.supplier_id AND o2.is_active));
    GET DIAGNOSTICS k = ROW_COUNT; c_offres := c_offres + k;
    UPDATE kitchen_recipe_lines l SET ingredient_id = v FROM kitchen_recipes rr WHERE l.ingredient_id = r.id AND rr.id = l.recipe_id AND rr.establishments = ARRAY[r.kr];
    GET DIAGNOSTICS k = ROW_COUNT; c_recettes := c_recettes + k;
    UPDATE kitchen_recipes rr SET pivot_ingredient_id = v WHERE rr.pivot_ingredient_id = r.id AND rr.establishments = ARRAY[r.kr];
    UPDATE inventaire_lignes l SET ingredient_id = v FROM inventaires vv WHERE l.ingredient_id = r.id AND vv.id = l.inventaire_id AND vv.etablissement_id = r.etab;
    GET DIAGNOSTICS k = ROW_COUNT; c_inv := c_inv + k;
    UPDATE commande_lignes l SET ingredient_id = v FROM commande_sessions s WHERE l.ingredient_id = r.id AND s.id = l.session_id AND s.etablissement_id = r.etab;
    GET DIAGNOSTICS k = ROW_COUNT; c_cmd := c_cmd + k;
    UPDATE stock_movements SET ingredient_id = v WHERE ingredient_id = r.id AND etablissement_id = r.etab;
    GET DIAGNOSTICS k = ROW_COUNT; c_stock := c_stock + k;
    UPDATE ingredient_zones z SET ingredient_id = v WHERE z.ingredient_id = r.id AND z.etablissement_id = r.etab
      AND NOT EXISTS (SELECT 1 FROM ingredient_zones z2 WHERE z2.ingredient_id = v AND z2.etablissement_id = r.etab AND z2.zone = z.zone);
    GET DIAGNOSTICS k = ROW_COUNT; c_zones := c_zones + k;
    UPDATE supplier_offers_a_valider SET ingredient_id = v WHERE ingredient_id = r.id AND etablissement_id = r.etab;
    UPDATE commande_articles a SET ingredient_id = v FROM suppliers s WHERE a.ingredient_id = r.id AND s.id = a.supplier_id AND s.etablissement_id = r.etab
      AND NOT EXISTS (SELECT 1 FROM commande_articles a2 WHERE a2.ingredient_id = v AND a2.supplier_id = a.supplier_id);
    UPDATE ingredient_supplier_refs f SET ingredient_id = v FROM suppliers s WHERE f.ingredient_id = r.id AND s.id = f.supplier_id AND s.etablissement_id = r.etab;
    IF r.k = 'bellomio' THEN
      UPDATE popina_products SET ingredient_id = v WHERE ingredient_id = r.id;
      GET DIAGNOSTICS k = ROW_COUNT; c_autres := c_autres + k;
      UPDATE popina_dose_map SET ingredient_id = v WHERE ingredient_id = r.id;
    END IF;
  END LOOP;

  -- Prix : une fiche sans offre active reprend, comme référence, les offres actives de sa fiche jumelle de l'autre restaurant
  FOR r IN
    SELECT i.id, i.establishments[1] k, j.id jumelle FROM ingredients i
    JOIN LATERAL (
      SELECT x.id FROM ingredients x WHERE x.id <> i.id AND x.is_active AND NOT (i.establishments[1] = ANY(coalesce(x.establishments,'{}')))
        AND (x.id IN (SELECT copie_id FROM separation_produits WHERE origine_id = i.id UNION SELECT origine_id FROM separation_produits WHERE copie_id = i.id) OR lower(x.name) = lower(i.name))
        AND EXISTS (SELECT 1 FROM supplier_offers o WHERE o.ingredient_id = x.id AND o.is_active)
      LIMIT 1) j ON true
    WHERE i.is_active AND coalesce(array_length(i.establishments,1),0) = 1 AND coalesce(i.source,'') <> 'recette_maison'
      AND NOT EXISTS (SELECT 1 FROM supplier_offers o WHERE o.ingredient_id = i.id AND o.is_active)
  LOOP
    INSERT INTO supplier_offers SELECT (jsonb_populate_record(NULL::supplier_offers, to_jsonb(o) - 'id' || jsonb_build_object('id', gen_random_uuid(), 'ingredient_id', r.id, 'establishment', r.k))).*
    FROM supplier_offers o WHERE o.ingredient_id = r.jumelle AND o.is_active;
    GET DIAGNOSTICS k = ROW_COUNT; c_prix := c_prix + k;
  END LOOP;

  v_rapport := jsonb_build_object('fiches', c_fiches, 'offres_rebranchees', c_offres, 'lignes_recettes', c_recettes, 'lignes_inventaire', c_inv, 'lignes_commandes', c_cmd,
    'mouvements_stock', c_stock, 'emplacements', c_zones, 'popina', c_autres, 'prix_repris', c_prix);
  IF NOT p_appliquer THEN RAISE EXCEPTION 'APERCU %', v_rapport::text; END IF;
  RETURN v_rapport;
END $function$;

REVOKE ALL ON FUNCTION reparer_produits_par_cote(boolean) FROM PUBLIC, anon, authenticated;
