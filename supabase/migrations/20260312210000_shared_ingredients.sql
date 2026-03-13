-- ============================================================
-- Marquer les ingrédients de base comme shared = true
-- Ces ingrédients sont communs à Bello Mio et Piccola Mia
-- ============================================================

-- Ingrédients partagés : base culinaire commune aux deux restaurants
UPDATE public.ingredients
SET shared = true
WHERE shared = false
  AND (
    lower(name) LIKE '%huile%olive%'
    OR lower(name) LIKE '%mozzarella%'
    OR lower(name) LIKE '%sel %'
    OR lower(name) = 'sel'
    OR lower(name) LIKE '%sel fin%'
    OR lower(name) LIKE '%fleur de sel%'
    OR lower(name) LIKE '%poivre%'
    OR lower(name) LIKE '%farine%'
    OR lower(name) LIKE '%sucre%'
    OR lower(name) LIKE '%beurre%'
    OR lower(name) LIKE '%lait %'
    OR lower(name) = 'lait'
    OR lower(name) LIKE '%crème%liquide%'
    OR lower(name) LIKE '%crème fraîche%'
    OR lower(name) LIKE '%creme%'
    OR lower(name) LIKE '%ail %'
    OR lower(name) = 'ail'
    OR lower(name) LIKE '%oignon%'
    OR lower(name) LIKE '%huile%tournesol%'
    OR lower(name) LIKE '%vinaigre%balsamique%'
    OR lower(name) LIKE '%levure%'
    OR lower(name) LIKE '%basilic%'
    OR lower(name) LIKE '%origan%'
    OR lower(name) LIKE '%parmesan%'
    OR lower(name) LIKE '%tomate%pelée%'
    OR lower(name) LIKE '%coulis%tomate%'
    OR lower(name) LIKE '%sauce tomate%'
    OR lower(name) LIKE '%concentré%tomate%'
  );
