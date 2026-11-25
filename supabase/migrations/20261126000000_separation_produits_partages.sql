-- Séparation des fiches produits partagées entre Bello Mio et Piccola Mia (26/11/2026, demande de Paul) :
-- chaque restaurant a sa propre fiche, qui vit ensuite sa vie (supprimer d'un côté ne touche pas l'autre).
-- La fiche d'origine reste à l'établissement qui l'a créée ; l'autre reçoit une copie, et tout ce qui
-- est de son côté passe sur la copie : offres de ses fournisseurs, emplacements, lignes de recettes,
-- inventaires, commandes, mouvements de stock, offres à valider, articles de commande, références
-- fournisseur, liens Popina (Bello Mio). Les recettes maison partagées ne sont pas séparées.
-- Table de correspondance gardée pour revenir en arrière.

CREATE TABLE IF NOT EXISTS separation_produits (
  origine_id uuid NOT NULL,
  copie_id uuid NOT NULL,
  cote_copie text NOT NULL,
  fait_le timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE separation_produits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION separer_produits_partages(p_appliquer boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_bello uuid := '93dddd48-21f5-44e9-83aa-024af53bce83';
  v_picco uuid := 'a1259b66-86b2-439d-b9fa-f38404fcdb83';
  v_cols text; v_sel text;
  r record;
  v_copie_cle text; v_garde_cle text; v_copie_etab uuid; v_garde_etab uuid; v_copie_kr text;
  v_four_copie uuid; v_four_garde uuid; v_nom_four text; v_four_etab uuid;
  v_new uuid; v_n int;
  c_produits int := 0; c_offres_deplacees int := 0; c_offres_copiees int := 0; c_zones int := 0; c_recettes int := 0;
  c_inventaire int := 0; c_commandes int := 0; c_stock int := 0; c_a_valider int := 0; c_articles int := 0;
  c_refs int := 0; c_popina int := 0; c_pivots int := 0;
  v_rapport jsonb;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position) INTO v_cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'ingredients' AND column_name <> 'id' AND is_generated = 'NEVER';
  -- Même liste, avec les valeurs de la copie posées dès l'insertion (contraintes d'unicité nom/établissement et fournisseur/référence)
  SELECT string_agg(CASE column_name
      WHEN 'etablissement_id' THEN '$2'
      WHEN 'establishments' THEN '$4'
      WHEN 'supplier_id' THEN '$3'
      WHEN 'default_supplier_id' THEN '$3'
      WHEN 'supplier_sku' THEN 'CASE WHEN $3 IS NULL OR EXISTS (SELECT 1 FROM ingredients x WHERE x.supplier_id = $3 AND x.supplier_sku = ingredients.supplier_sku) THEN NULL ELSE supplier_sku END'
      ELSE quote_ident(column_name) END, ', ' ORDER BY ordinal_position) INTO v_sel
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'ingredients' AND column_name <> 'id' AND is_generated = 'NEVER';

  FOR r IN
    SELECT i.* FROM ingredients i
    WHERE i.is_active AND 'bellomio' = ANY(i.establishments) AND 'piccola' = ANY(i.establishments)
      AND coalesce(i.source, '') <> 'recette_maison'
    ORDER BY i.name
  LOOP
    IF r.etablissement_id = v_picco THEN
      v_garde_cle := 'piccola'; v_copie_cle := 'bellomio'; v_garde_etab := v_picco; v_copie_etab := v_bello; v_copie_kr := 'bello_mio';
    ELSE
      v_garde_cle := 'bellomio'; v_copie_cle := 'piccola'; v_garde_etab := v_bello; v_copie_etab := v_picco; v_copie_kr := 'piccola';
    END IF;

    -- Fournisseur de la copie : le même fournisseur côté copie (Mael Bello / Mael Piccola), sinon aucun
    v_four_copie := NULL; v_four_garde := r.supplier_id;
    IF r.supplier_id IS NOT NULL THEN
      SELECT name, etablissement_id INTO v_nom_four, v_four_etab FROM suppliers WHERE id = r.supplier_id;
      SELECT id INTO v_four_copie FROM suppliers WHERE etablissement_id = v_copie_etab AND lower(trim(name)) = lower(trim(v_nom_four)) ORDER BY is_active DESC LIMIT 1;
      -- L'origine garde son fournisseur ; la copie n'en prend un que s'il est distinct
      IF v_four_copie = r.supplier_id THEN v_four_copie := NULL; END IF;
    END IF;

    -- Copie de la fiche
    -- L'origine quitte d'abord le côté copie (sinon deux fiches du même nom dans un établissement)
    UPDATE ingredients SET establishments = ARRAY[v_garde_cle], etablissement_id = coalesce(etablissement_id, v_garde_etab),
      supplier_id = v_four_garde, default_supplier_id = CASE WHEN default_supplier_id = r.supplier_id THEN v_four_garde ELSE default_supplier_id END
    WHERE id = r.id;
    EXECUTE format('INSERT INTO ingredients (%s) SELECT %s FROM ingredients WHERE id = $1 RETURNING id', v_cols, v_sel)
      INTO v_new USING r.id, v_copie_etab, v_four_copie, ARRAY[v_copie_cle];
    -- Le déclencheur des zones a posé des emplacements à la copie d'après la fiche d'origine : on repart de ceux de son côté
    -- (zone de la fiche gardée si l'origine n'avait aucun emplacement côté copie)
    DELETE FROM ingredient_zones WHERE ingredient_id = v_new
      AND (etablissement_id <> v_copie_etab OR EXISTS (SELECT 1 FROM ingredient_zones z WHERE z.ingredient_id = r.id AND z.etablissement_id = v_copie_etab));
    INSERT INTO separation_produits (origine_id, copie_id, cote_copie) VALUES (r.id, v_new, v_copie_cle);
    c_produits := c_produits + 1;

    -- Offres : celles des fournisseurs du côté copie passent sur la copie ; celles valables pour les deux sont dupliquées
    UPDATE supplier_offers o SET ingredient_id = v_new, establishment = v_copie_cle
    FROM suppliers s WHERE o.ingredient_id = r.id AND s.id = o.supplier_id AND s.etablissement_id = v_copie_etab;
    GET DIAGNOSTICS v_n = ROW_COUNT; c_offres_deplacees := c_offres_deplacees + v_n;
    UPDATE supplier_offers o SET ingredient_id = v_new
    WHERE o.ingredient_id = r.id AND o.establishment = v_copie_cle
      AND NOT EXISTS (SELECT 1 FROM suppliers s WHERE s.id = o.supplier_id AND s.etablissement_id = v_garde_etab);
    GET DIAGNOSTICS v_n = ROW_COUNT; c_offres_deplacees := c_offres_deplacees + v_n;
    WITH src AS (SELECT * FROM supplier_offers WHERE ingredient_id = r.id AND coalesce(establishment, 'both') = 'both'),
    ins AS (
      INSERT INTO supplier_offers SELECT (jsonb_populate_record(NULL::supplier_offers, to_jsonb(src) - 'id' || jsonb_build_object('id', gen_random_uuid(), 'ingredient_id', v_new, 'establishment', v_copie_cle))).* FROM src
      RETURNING 1)
    SELECT count(*) INTO v_n FROM ins;
    c_offres_copiees := c_offres_copiees + v_n;
    UPDATE supplier_offers SET establishment = v_garde_cle WHERE ingredient_id = r.id AND coalesce(establishment, 'both') = 'both';

    -- Côté copie : emplacements, recettes, inventaires, commandes, stock, offres à valider
    UPDATE ingredient_zones SET ingredient_id = v_new WHERE ingredient_id = r.id AND etablissement_id = v_copie_etab;
    GET DIAGNOSTICS v_n = ROW_COUNT; c_zones := c_zones + v_n;
    UPDATE kitchen_recipe_lines l SET ingredient_id = v_new FROM kitchen_recipes k
    WHERE l.ingredient_id = r.id AND k.id = l.recipe_id
      AND (k.establishments = ARRAY[v_copie_kr] OR (coalesce(array_length(k.establishments, 1), 0) = 0 AND k.etablissement_id = v_copie_etab));
    GET DIAGNOSTICS v_n = ROW_COUNT; c_recettes := c_recettes + v_n;
    UPDATE kitchen_recipes k SET pivot_ingredient_id = v_new
    WHERE k.pivot_ingredient_id = r.id AND (k.establishments = ARRAY[v_copie_kr] OR (coalesce(array_length(k.establishments, 1), 0) = 0 AND k.etablissement_id = v_copie_etab));
    GET DIAGNOSTICS v_n = ROW_COUNT; c_pivots := c_pivots + v_n;
    UPDATE inventaire_lignes l SET ingredient_id = v_new FROM inventaires v
    WHERE l.ingredient_id = r.id AND v.id = l.inventaire_id AND v.etablissement_id = v_copie_etab;
    GET DIAGNOSTICS v_n = ROW_COUNT; c_inventaire := c_inventaire + v_n;
    UPDATE commande_lignes l SET ingredient_id = v_new FROM commande_sessions s
    WHERE l.ingredient_id = r.id AND s.id = l.session_id AND s.etablissement_id = v_copie_etab;
    GET DIAGNOSTICS v_n = ROW_COUNT; c_commandes := c_commandes + v_n;
    UPDATE stock_movements SET ingredient_id = v_new WHERE ingredient_id = r.id AND etablissement_id = v_copie_etab;
    GET DIAGNOSTICS v_n = ROW_COUNT; c_stock := c_stock + v_n;
    UPDATE supplier_offers_a_valider SET ingredient_id = v_new WHERE ingredient_id = r.id AND etablissement_id = v_copie_etab;
    GET DIAGNOSTICS v_n = ROW_COUNT; c_a_valider := c_a_valider + v_n;
    UPDATE commande_articles a SET ingredient_id = v_new FROM suppliers s
    WHERE a.ingredient_id = r.id AND s.id = a.supplier_id AND s.etablissement_id = v_copie_etab;
    GET DIAGNOSTICS v_n = ROW_COUNT; c_articles := c_articles + v_n;
    UPDATE ingredient_supplier_refs f SET ingredient_id = v_new FROM suppliers s
    WHERE f.ingredient_id = r.id AND s.id = f.supplier_id AND s.etablissement_id = v_copie_etab;
    GET DIAGNOSTICS v_n = ROW_COUNT; c_refs := c_refs + v_n;
    -- Popina = caisse de Bello Mio
    IF v_copie_cle = 'bellomio' THEN
      UPDATE popina_products SET ingredient_id = v_new WHERE ingredient_id = r.id;
      GET DIAGNOSTICS v_n = ROW_COUNT; c_popina := c_popina + v_n;
      UPDATE popina_dose_map SET ingredient_id = v_new WHERE ingredient_id = r.id;
      GET DIAGNOSTICS v_n = ROW_COUNT; c_popina := c_popina + v_n;
    END IF;
  END LOOP;

  v_rapport := jsonb_build_object('produits', c_produits, 'offres_deplacees', c_offres_deplacees, 'offres_copiees', c_offres_copiees,
    'emplacements', c_zones, 'lignes_recettes', c_recettes, 'pivots', c_pivots, 'lignes_inventaire', c_inventaire, 'lignes_commandes', c_commandes,
    'mouvements_stock', c_stock, 'offres_a_valider', c_a_valider, 'articles_commande', c_articles, 'refs_fournisseur', c_refs, 'popina', c_popina);
  IF NOT p_appliquer THEN
    RAISE EXCEPTION 'APERCU %', v_rapport::text;
  END IF;
  RETURN v_rapport;
END;
$fn$;

REVOKE ALL ON FUNCTION separer_produits_partages(boolean) FROM PUBLIC, anon, authenticated;

-- Copie d'une fiche pour l'autre restaurant (import d'une facture, case « les deux » de la Base produits) :
-- la copie existante si elle existe déjà (correspondance, ou fiche du même nom dans l'établissement), sinon une
-- nouvelle fiche avec le fournisseur homologue de cet établissement. Renvoie l'identifiant de la fiche de ce côté.
CREATE OR REPLACE FUNCTION copier_produit_vers(p_id uuid, p_cle text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_etab uuid := CASE p_cle WHEN 'piccola' THEN 'a1259b66-86b2-439d-b9fa-f38404fcdb83'::uuid WHEN 'bellomio' THEN '93dddd48-21f5-44e9-83aa-024af53bce83'::uuid END;
  r ingredients; v_id uuid; v_four uuid; v_cols text; v_sel text;
BEGIN
  IF v_etab IS NULL THEN RAISE EXCEPTION 'établissement inconnu : %', p_cle; END IF;
  SELECT * INTO r FROM ingredients WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'fiche introuvable'; END IF;
  IF p_cle = ANY(coalesce(r.establishments, '{}')) THEN RETURN p_id; END IF;
  -- Copie déjà faite, dans un sens ou dans l'autre
  SELECT CASE WHEN s.origine_id = p_id THEN s.copie_id ELSE s.origine_id END INTO v_id
  FROM separation_produits s JOIN ingredients i ON i.id = CASE WHEN s.origine_id = p_id THEN s.copie_id ELSE s.origine_id END
  WHERE (s.origine_id = p_id OR s.copie_id = p_id) AND p_cle = ANY(coalesce(i.establishments, '{}')) LIMIT 1;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM ingredients WHERE etablissement_id = v_etab AND lower(name) = lower(r.name) LIMIT 1;
  END IF;
  IF v_id IS NOT NULL THEN
    UPDATE ingredients SET is_active = true, establishments = (SELECT array_agg(DISTINCT e) FROM unnest(coalesce(establishments, '{}') || ARRAY[p_cle]) e) WHERE id = v_id;
    RETURN v_id;
  END IF;
  IF r.supplier_id IS NOT NULL THEN
    SELECT s2.id INTO v_four FROM suppliers s1 JOIN suppliers s2 ON lower(trim(s2.name)) = lower(trim(s1.name)) AND s2.etablissement_id = v_etab
    WHERE s1.id = r.supplier_id ORDER BY s2.is_active DESC LIMIT 1;
    IF v_four = r.supplier_id THEN v_four := NULL; END IF;
  END IF;
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position),
         string_agg(CASE column_name WHEN 'etablissement_id' THEN '$2' WHEN 'establishments' THEN '$4' WHEN 'supplier_id' THEN '$3' WHEN 'default_supplier_id' THEN '$3'
           WHEN 'supplier_sku' THEN 'CASE WHEN $3 IS NULL OR EXISTS (SELECT 1 FROM ingredients x WHERE x.supplier_id = $3 AND x.supplier_sku = ingredients.supplier_sku) THEN NULL ELSE supplier_sku END'
           WHEN 'is_active' THEN 'true' ELSE quote_ident(column_name) END, ', ' ORDER BY ordinal_position)
  INTO v_cols, v_sel
  FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ingredients' AND column_name <> 'id' AND is_generated = 'NEVER';
  EXECUTE format('INSERT INTO ingredients (%s) SELECT %s FROM ingredients WHERE id = $1 RETURNING id', v_cols, v_sel) INTO v_id USING p_id, v_etab, v_four, ARRAY[p_cle];
  DELETE FROM ingredient_zones WHERE ingredient_id = v_id AND etablissement_id <> v_etab;
  INSERT INTO separation_produits (origine_id, copie_id, cote_copie) VALUES (p_id, v_id, p_cle);
  RETURN v_id;
END;
$fn$;
REVOKE ALL ON FUNCTION copier_produit_vers(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION copier_produit_vers(uuid, text) TO authenticated, service_role;

-- Une fiche créée dans un restaurant n'appartient qu'à lui (le défaut de la colonne était « les deux »).
-- Les recettes maison gardent le choix de la fiche recette.
CREATE OR REPLACE FUNCTION ingredients_un_seul_cote()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF NEW.etablissement_id IS NOT NULL AND coalesce(NEW.source, '') <> 'recette_maison'
     AND coalesce(array_length(NEW.establishments, 1), 0) <> 1 THEN
    NEW.establishments := ARRAY[CASE WHEN NEW.etablissement_id = 'a1259b66-86b2-439d-b9fa-f38404fcdb83' THEN 'piccola' ELSE 'bellomio' END];
  END IF;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS trg_ingredients_un_seul_cote ON ingredients;
CREATE TRIGGER trg_ingredients_un_seul_cote BEFORE INSERT ON ingredients FOR EACH ROW EXECUTE FUNCTION ingredients_un_seul_cote();
