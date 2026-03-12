-- ============================================================
-- Remplissage density_g_per_ml pour les ingrédients liquides
-- Valeurs par défaut basées sur la catégorie et le nom
-- ============================================================

-- 1. Miel (densité ~1.4 g/ml)
UPDATE public.ingredients
SET density_g_per_ml = 1.4
WHERE (density_g_per_ml IS NULL OR density_g_per_ml = 0)
  AND lower(name) LIKE '%miel%';

-- 2. Sirops et sauces sucrées (densité ~1.3 g/ml)
UPDATE public.ingredients
SET density_g_per_ml = 1.3
WHERE (density_g_per_ml IS NULL OR density_g_per_ml = 0)
  AND (
    lower(name) LIKE '%sirop%'
    OR lower(name) LIKE '%grenadine%'
    OR lower(name) LIKE '%orgeat%'
  );

-- 3. Huiles (densité ~0.91 g/ml)
UPDATE public.ingredients
SET density_g_per_ml = 0.91
WHERE (density_g_per_ml IS NULL OR density_g_per_ml = 0)
  AND (
    lower(name) LIKE '%huile%'
    OR lower(name) LIKE '%olio%'
  );

-- 4. Alcools forts / spiritueux (densité ~0.79 g/ml)
UPDATE public.ingredients
SET density_g_per_ml = 0.79
WHERE (density_g_per_ml IS NULL OR density_g_per_ml = 0)
  AND (
    lower(name) LIKE '%vodka%'
    OR lower(name) LIKE '%gin %'
    OR lower(name) LIKE '%gin'
    OR lower(name) LIKE '%rhum%'
    OR lower(name) LIKE '%rum%'
    OR lower(name) LIKE '%whisky%'
    OR lower(name) LIKE '%whiskey%'
    OR lower(name) LIKE '%tequila%'
    OR lower(name) LIKE '%mezcal%'
    OR lower(name) LIKE '%limoncello%'
    OR lower(name) LIKE '%amaretto%'
    OR lower(name) LIKE '%cointreau%'
    OR lower(name) LIKE '%triple sec%'
    OR lower(name) LIKE '%campari%'
    OR lower(name) LIKE '%aperol%'
    OR lower(name) LIKE '%chartreuse%'
    OR lower(name) LIKE '%absinthe%'
    OR lower(name) LIKE '%grappa%'
    OR lower(name) LIKE '%cognac%'
    OR lower(name) LIKE '%armagnac%'
    OR lower(name) LIKE '%calvados%'
    OR lower(name) LIKE '%eau de vie%'
    OR lower(name) LIKE '%marc %'
  );

-- 5. Vin, bière, vermouth, prosecco (densité ~0.99 g/ml)
UPDATE public.ingredients
SET density_g_per_ml = 0.99
WHERE (density_g_per_ml IS NULL OR density_g_per_ml = 0)
  AND (
    lower(name) LIKE '%vin %'
    OR lower(name) LIKE '%vin'
    OR lower(name) LIKE '%wine%'
    OR lower(name) LIKE '%biere%'
    OR lower(name) LIKE '%bière%'
    OR lower(name) LIKE '%prosecco%'
    OR lower(name) LIKE '%champagne%'
    OR lower(name) LIKE '%vermouth%'
    OR lower(name) LIKE '%martini%'
    OR lower(name) LIKE '%porto%'
    OR lower(name) LIKE '%marsala%'
  );

-- 6. Eau, lait, crème, vinaigre, jus (densité ~1.0 g/ml)
UPDATE public.ingredients
SET density_g_per_ml = 1.0
WHERE (density_g_per_ml IS NULL OR density_g_per_ml = 0)
  AND (
    lower(name) LIKE '%eau%'
    OR lower(name) LIKE '%lait%'
    OR lower(name) LIKE '%crème%'
    OR lower(name) LIKE '%creme%'
    OR lower(name) LIKE '%vinaigre%'
    OR lower(name) LIKE '%jus %'
    OR lower(name) LIKE '%jus'
    OR lower(name) LIKE '%juice%'
  );

-- 7. Catch-all : tout ingrédient liquide restant sans densité
--    (identifié par default_unit ml/l/cl, purchase_unit_label l/ml,
--     ou catégorie alcool_spiritueux/boisson)
--    → densité par défaut 1.0 g/ml
UPDATE public.ingredients
SET density_g_per_ml = 1.0
WHERE (density_g_per_ml IS NULL OR density_g_per_ml = 0)
  AND (
    lower(coalesce(default_unit, '')) IN ('ml', 'l', 'cl')
    OR lower(coalesce(purchase_unit_label, '')) IN ('ml', 'l')
    OR category IN ('alcool_spiritueux', 'boisson')
  );
