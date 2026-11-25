-- Mode de vente d'une fiche (restaurant, traiteur, les deux, préparation) et TVA du prix au kilo.
-- null = valeur par défaut calculée par l'appli (Piccola Mia en traiteur, Bello Mio en restaurant,
-- préparations et sauces en préparation).
ALTER TABLE kitchen_recipes ADD COLUMN IF NOT EXISTS mode_vente text
  CHECK (mode_vente IS NULL OR mode_vente IN ('restaurant', 'traiteur', 'les_deux', 'preparation'));
ALTER TABLE kitchen_recipes ADD COLUMN IF NOT EXISTS vat_rate_kg numeric;
COMMENT ON COLUMN kitchen_recipes.mode_vente IS 'restaurant | traiteur | les_deux | preparation ; null = défaut selon établissement et catégorie';
COMMENT ON COLUMN kitchen_recipes.vat_rate_kg IS 'TVA du prix TTC au kilo (sell_price_per_kg), 0.055 par défaut';
