-- Migration : mise à jour des catégories d'ingrédients (14 catégories)
-- Mapping ancien → nouveau :
--   cremerie + fromage       → cremerie_fromage
--   charcuterie + viande     → charcuterie_viande
--   alcool                   → alcool_spiritueux
--   legume + herbe           → legumes_herbes
--   epicerie + surgele       → epicerie_salee
--   recette                  → preparation
--   (boisson, maree, fruit, preparation, sauce, emballage, autre restent inchangés)
--   Nouvelles catégories : epicerie_sucree, antipasti

-- 1. Supprimer l'ancienne contrainte CHECK (si elle existe)
ALTER TABLE ingredients DROP CONSTRAINT IF EXISTS ingredients_category_check;

-- 2. Migrer les données
UPDATE ingredients SET category = 'cremerie_fromage'   WHERE category IN ('cremerie', 'fromage');
UPDATE ingredients SET category = 'charcuterie_viande' WHERE category IN ('charcuterie', 'viande');
UPDATE ingredients SET category = 'alcool_spiritueux'  WHERE category = 'alcool';
UPDATE ingredients SET category = 'legumes_herbes'     WHERE category IN ('legume', 'herbe');
UPDATE ingredients SET category = 'epicerie_salee'     WHERE category IN ('epicerie', 'surgele');
UPDATE ingredients SET category = 'preparation'        WHERE category = 'recette';

-- 3. Recréer la contrainte avec les nouvelles valeurs
ALTER TABLE ingredients ADD CONSTRAINT ingredients_category_check CHECK (
  category IN (
    'cremerie_fromage', 'charcuterie_viande', 'maree', 'alcool_spiritueux',
    'boisson', 'legumes_herbes', 'fruit', 'epicerie_salee', 'epicerie_sucree',
    'preparation', 'sauce', 'antipasti', 'emballage', 'autre'
  )
);
