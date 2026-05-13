-- Split alcool_spiritueux and boisson into granular categories
-- New categories: vins, spiritueux, biere, soft, cafeteria, liqueurs, sirops

-- 1. Rename boisson → soft
UPDATE ingredients SET category = 'soft' WHERE category = 'boisson';

-- 2. Vinoflo products: alcool_spiritueux → vins
UPDATE ingredients SET category = 'vins'
WHERE category = 'alcool_spiritueux'
  AND id IN (
    SELECT DISTINCT so.ingredient_id FROM supplier_offers so
    JOIN suppliers s ON s.id = so.supplier_id
    WHERE UPPER(s.name) LIKE '%VINOFLO%'
  );

-- 3. LMDW / Bar Spirits products: alcool_spiritueux → spiritueux
UPDATE ingredients SET category = 'spiritueux'
WHERE category = 'alcool_spiritueux'
  AND id IN (
    SELECT DISTINCT so.ingredient_id FROM supplier_offers so
    JOIN suppliers s ON s.id = so.supplier_id
    WHERE UPPER(s.name) LIKE '%LMDW%' OR UPPER(s.name) LIKE '%BAR SPIRITS%'
  );

-- 4. Remaining alcool_spiritueux → vins (default, most common)
UPDATE ingredients SET category = 'vins' WHERE category = 'alcool_spiritueux';
