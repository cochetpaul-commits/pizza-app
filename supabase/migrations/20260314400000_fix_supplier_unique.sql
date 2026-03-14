ALTER TABLE suppliers DROP CONSTRAINT IF EXISTS suppliers_user_name_uniq;
ALTER TABLE suppliers ADD CONSTRAINT suppliers_etab_name_uniq UNIQUE (etablissement_id, name);
