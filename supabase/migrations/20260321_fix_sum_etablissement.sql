-- Réassigner les factures SUM à Piccola Mia
-- SUM est un fournisseur Piccola Mia, pas Bello Mio

DO $$
DECLARE
  piccola_id uuid;
BEGIN
  SELECT id INTO piccola_id FROM etablissements WHERE slug ILIKE '%piccola%' LIMIT 1;

  -- 1. Réassigner le fournisseur SUM
  UPDATE suppliers SET etablissement_id = piccola_id WHERE LOWER(name) = 'sum';

  -- 2. Réassigner toutes les factures SUM
  UPDATE supplier_invoices SET etablissement_id = piccola_id
  WHERE supplier_id IN (SELECT id FROM suppliers WHERE LOWER(name) = 'sum');

  -- 3. Réassigner les ingrédients liés à SUM
  UPDATE ingredients SET etablissement_id = piccola_id
  WHERE supplier_id IN (SELECT id FROM suppliers WHERE LOWER(name) = 'sum');
END $$;
