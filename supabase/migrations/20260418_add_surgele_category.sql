-- Migration : ajout catégorie "surgele" (Surgelé)
-- Sépare les surgelés de epicerie_salee en catégorie propre.

-- 1. Supprimer l'ancienne contrainte CHECK
ALTER TABLE ingredients DROP CONSTRAINT IF EXISTS ingredients_category_check;

-- 2. Recréer avec "surgele" en plus
ALTER TABLE ingredients ADD CONSTRAINT ingredients_category_check CHECK (
  category IN (
    'cremerie_fromage', 'charcuterie_viande', 'maree', 'alcool_spiritueux',
    'boisson', 'legumes_herbes', 'fruit', 'epicerie_salee', 'epicerie_sucree',
    'preparation', 'sauce', 'antipasti', 'emballage', 'surgele', 'autre'
  )
);

-- 3. Reclasser les ingrédients surgelés existants (ceux dont le nom contient "surgelé" / "congelé" / "IVP")
UPDATE ingredients
SET category = 'surgele'
WHERE category = 'epicerie_salee'
  AND (
    name ~* 'surgel[eé]' OR
    name ~* 'congel[eé]' OR
    name ~* '\mivp\M'
  );
