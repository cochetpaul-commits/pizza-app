-- Migration : reclassification des ingrédients "autre" vers les bonnes catégories
-- Exécutée après 20260308000000_update_ingredient_categories.sql

-- ══════════════════════════════════════════════════════════════════════════════
-- PASS 1 : regex mots-clés (même logique que categoryDetector.ts)
-- ══════════════════════════════════════════════════════════════════════════════

-- Alcool / Spiritueux (vins italiens, liqueurs, bières)
UPDATE ingredients SET category = 'alcool_spiritueux'
WHERE category = 'autre'
  AND (' ' || replace(lower(name), '''', ' ')) ~ ' (liq |italicus|noces royales|sarti rosa|chianti|chienti|falanghina|pinot grigio|marsala|negroamaro|grillo|etna|etnâ|arneis|arnéis|rosso di montalcino|moretti|fiasco)';
UPDATE ingredients SET category = 'alcool_spiritueux'
WHERE category = 'autre' AND name ~* '^(BLC |RGE |FUT )';

-- Boisson
UPDATE ingredients SET category = 'boisson'
WHERE category = 'autre'
  AND (' ' || replace(lower(name), '''', ' ')) ~ ' (limonade|molecola|tonic water|deca lavazza|pet limonade|pet la french)';

-- Crémerie / Fromage
UPDATE ingredients SET category = 'cremerie_fromage'
WHERE category = 'autre'
  AND (' ' || replace(lower(name), '''', ' ')) ~ ' (asiago|leerdammer|scamorza)';

-- Marée
UPDATE ingredients SET category = 'maree'
WHERE category = 'autre'
  AND (' ' || replace(lower(name), '''', ' ')) ~ ' (fish chips cabill)';

-- Légumes / Herbes
UPDATE ingredients SET category = 'legumes_herbes'
WHERE category = 'autre'
  AND (' ' || replace(lower(name), '''', ' ')) ~ ' (ail frais|cresson|cèpe|cepe|friarielli|piment fort)';

-- Fruit
UPDATE ingredients SET category = 'fruit'
WHERE category = 'autre'
  AND (' ' || replace(lower(name), '''', ' ')) ~ ' (capron|litchi)';

-- Sauce
UPDATE ingredients SET category = 'sauce'
WHERE category = 'autre'
  AND (' ' || replace(lower(name), '''', ' ')) ~ ' (passata|sugo|pesto d|huile basilic)';

-- Emballage / Matériel
UPDATE ingredients SET category = 'emballage'
WHERE category = 'autre'
  AND (' ' || replace(lower(name), '''', ' ')) ~ ' (rond or|boîte à pizza|boite a pizza|couver p|feuille ingraissable|papier cuisson|sac poubelle|eponge|éponge|spatule|fouet|mpro )';

-- Épicerie Sucrée
UPDATE ingredients SET category = 'epicerie_sucree'
WHERE category = 'autre'
  AND (' ' || replace(lower(name), '''', ' ')) ~ ' (amarena|amaretti|cantucci|nocciolata|panettone|panforte|praliné|praline|savoiardi|fagottini)';

-- Épicerie Salée (pâtes, farines, grains)
UPDATE ingredients SET category = 'epicerie_salee'
WHERE category = 'autre'
  AND (' ' || replace(lower(name), '''', ' ')) ~ ' (cannelloni|casareccia|farina |fettuccine|fettucine|linguine|mezzi rigatoni|pappardelle|pennette|spaghetti|pane carasau|focaccina|allegra chips|orge perlé|sésame blanc|sesame blanc|granella pistache|filotea)';

-- epicerie_salee → epicerie_sucree (mal classés à l'étape précédente)
UPDATE ingredients SET category = 'epicerie_sucree'
WHERE category = 'epicerie_salee'
  AND (' ' || replace(lower(name), '''', ' ')) ~ ' (miel|confiture|nutella|chocolat|cacao|vanille|sucre|nocciolata|praline|praliné)';

-- ══════════════════════════════════════════════════════════════════════════════
-- PASS 2 : ILIKE ciblé (caractères spéciaux non matchés par regex)
-- ══════════════════════════════════════════════════════════════════════════════

UPDATE ingredients SET category = 'emballage'
WHERE category = 'autre' AND (name ILIKE '%SPATULE%' OR name ILIKE '%SAC POUBELLE%' OR name ILIKE '%SPRAY DEMOULANT%');

UPDATE ingredients SET category = 'legumes_herbes'
WHERE category = 'autre' AND name ILIKE '%AIL FRAIS%';

UPDATE ingredients SET category = 'boisson'
WHERE category = 'autre' AND (name ILIKE '%LAVAZZA%' OR name ILIKE '%COCOLOMBIE%');

UPDATE ingredients SET category = 'alcool_spiritueux'
WHERE category = 'autre' AND name ILIKE '%NERO D%AVOLA%';

UPDATE ingredients SET category = 'cremerie_fromage'
WHERE category = 'autre' AND (name ILIKE '%STRACCIATELLA%' OR name ILIKE '%TOASTI%' OR name ILIKE '%VELOUTE%FRUIX%');

UPDATE ingredients SET category = 'epicerie_sucree'
WHERE category = 'autre' AND (name ILIKE '%COUNTRY CRISP%' OR name ILIKE '%SPECULOOS%' OR name ILIKE '%SPÉCULOOS%');

UPDATE ingredients SET category = 'epicerie_salee'
WHERE category = 'autre' AND (
  name ILIKE '%Toscane%' OR name ILIKE '%FARINA%' OR name ILIKE '%carnaroli%'
  OR name ILIKE '%Gressin%' OR name ILIKE '%Schiacciatine%' OR name ILIKE '%Trofie%'
);
