-- Seed supplier metadata for known suppliers (matched by name, case-insensitive)
-- Only updates NULL fields — won't overwrite user-entered data

-- METRO — Cash & Carry, grossiste alimentaire
UPDATE suppliers SET
  category    = COALESCE(category, 'alimentaire_general'),
  city        = COALESCE(city, 'Saint-Malo'),
  postal_code = COALESCE(postal_code, '35400'),
  website     = COALESCE(website, 'metro.fr'),
  delivery_days = COALESCE(delivery_days, '{lundi,mardi,mercredi,jeudi,vendredi,samedi}')
WHERE LOWER(name) = 'metro';

-- MAEL — Crémerie / Produits frais
UPDATE suppliers SET
  category    = COALESCE(category, 'cremerie_frais'),
  city        = COALESCE(city, 'Saint-Malo'),
  postal_code = COALESCE(postal_code, '35400'),
  delivery_days = COALESCE(delivery_days, '{mardi,jeudi}')
WHERE LOWER(name) = 'mael' OR LOWER(name) = 'maël';

-- VINOFLO — Vins italiens
UPDATE suppliers SET
  category    = COALESCE(category, 'vins'),
  city        = COALESCE(city, 'Marseille'),
  website     = COALESCE(website, 'vinoventes.com'),
  delivery_days = COALESCE(delivery_days, '{mercredi}')
WHERE LOWER(name) = 'vinoflo';

-- COZIGOU — Boissons / Spiritueux
UPDATE suppliers SET
  category    = COALESCE(category, 'boissons_spiritueux'),
  city        = COALESCE(city, 'Quimper'),
  postal_code = COALESCE(postal_code, '29000'),
  delivery_days = COALESCE(delivery_days, '{mardi,vendredi}')
WHERE LOWER(name) = 'cozigou';

-- CARNIATO — Viande / Charcuterie italienne
UPDATE suppliers SET
  category    = COALESCE(category, 'viande_charcuterie'),
  delivery_days = COALESCE(delivery_days, '{mardi,vendredi}')
WHERE LOWER(name) = 'carniato';

-- BAR SPIRITS — Spiritueux / Cocktails
UPDATE suppliers SET
  category    = COALESCE(category, 'spiritueux'),
  website     = COALESCE(website, 'barspirits.fr'),
  delivery_days = COALESCE(delivery_days, '{mercredi}')
WHERE LOWER(name) LIKE '%bar spirit%';

-- SUM — Alimentaire
UPDATE suppliers SET
  category    = COALESCE(category, 'alimentaire_general'),
  delivery_days = COALESCE(delivery_days, '{mardi,jeudi}')
WHERE LOWER(name) = 'sum';

-- ARMOR — Emballages
UPDATE suppliers SET
  category      = COALESCE(category, 'emballage'),
  city          = COALESCE(city, 'Caudan'),
  postal_code   = COALESCE(postal_code, '56850'),
  address       = COALESCE(address, '501 Route de Pont-Scorff'),
  website       = COALESCE(website, 'armor-emballages.com'),
  delivery_days = COALESCE(delivery_days, '{mardi}')
WHERE LOWER(name) LIKE '%armor%';

-- MASSE — Surgelés / Alimentaire
UPDATE suppliers SET
  category    = COALESCE(category, 'surgeles'),
  delivery_days = COALESCE(delivery_days, '{lundi,jeudi}')
WHERE LOWER(name) = 'masse';

-- ELIEN — Glaces artisanales
UPDATE suppliers SET
  category    = COALESCE(category, 'glaces'),
  city        = COALESCE(city, 'Saint-Malo'),
  postal_code = COALESCE(postal_code, '35400'),
  delivery_days = COALESCE(delivery_days, '{mardi}')
WHERE LOWER(name) LIKE '%elien%';

-- SDPF / PROGOURMANDS — Produits fins
UPDATE suppliers SET
  category    = COALESCE(category, 'produits_fins'),
  delivery_days = COALESCE(delivery_days, '{mercredi}')
WHERE LOWER(name) LIKE '%sdpf%' OR LOWER(name) LIKE '%progourmand%';

-- LMDW — La Maison du Whisky
UPDATE suppliers SET
  category    = COALESCE(category, 'spiritueux'),
  website     = COALESCE(website, 'lmdw.com'),
  delivery_days = COALESCE(delivery_days, '{mercredi}')
WHERE LOWER(name) LIKE '%lmdw%' OR LOWER(name) LIKE '%maison du whisky%';
