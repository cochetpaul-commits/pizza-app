-- ============================================================
-- HR MODULE — Postes Piccola Mia + convention RAPIDE_1501
-- (Idempotent — safe to re-run)
-- ============================================================

DO $$
DECLARE
  piccola_id UUID;
BEGIN
  SELECT id INTO piccola_id FROM public.etablissements WHERE slug = 'piccola_mia';
  IF piccola_id IS NULL THEN
    RAISE NOTICE 'Piccola Mia not found, skipping postes seed';
    RETURN;
  END IF;

  -- Cuisine
  INSERT INTO public.postes (etablissement_id, equipe, nom, couleur, emoji)
  SELECT piccola_id, 'Cuisine', v.nom, v.couleur, v.emoji
  FROM (VALUES
    ('Pizza',   '#E07070', '🍕'),
    ('Chaud',   '#E8A87C', '🔥'),
    ('Froid',   '#7EC8A4', '🧊'),
    ('Plonge',  '#95A5A6', '🧹'),
    ('Bureau',  '#9B8EC4', '✏️')
  ) AS v(nom, couleur, emoji)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.postes WHERE etablissement_id = piccola_id AND equipe = 'Cuisine' AND nom = v.nom
  );

  -- Salle
  INSERT INTO public.postes (etablissement_id, equipe, nom, couleur, emoji)
  SELECT piccola_id, 'Salle', v.nom, v.couleur, v.emoji
  FROM (VALUES
    ('Comptoir', '#A9CCE3', '🧑‍🍳'),
    ('Salle',    '#A9CCE3', '🪑'),
    ('Bar',      '#E8A87C', '🍸'),
    ('Bureau',   '#9B8EC4', '✏️'),
    ('Plonge',   '#95A5A6', '🧹')
  ) AS v(nom, couleur, emoji)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.postes WHERE etablissement_id = piccola_id AND equipe = 'Salle' AND nom = v.nom
  );

  -- Shop
  INSERT INTO public.postes (etablissement_id, equipe, nom, couleur, emoji)
  SELECT piccola_id, 'Shop', v.nom, v.couleur, v.emoji
  FROM (VALUES
    ('Caisse',    '#F4D03F', '💰'),
    ('Rayons',    '#B8D4E8', '📦'),
    ('Reception', '#95A5A6', '📋')
  ) AS v(nom, couleur, emoji)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.postes WHERE etablissement_id = piccola_id AND equipe = 'Shop' AND nom = v.nom
  );
END;
$$;
