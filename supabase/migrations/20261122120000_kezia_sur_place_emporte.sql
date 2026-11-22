-- 22/11/2026 : Piccola Mia n'a pas de service midi / soir ; le journal Kezia donne chaque jour le total TTC
-- « sur place » et « emporté ». Deux colonnes sur daily_sales, remplies par l'import (keziaDailyRow).
alter table public.daily_sales add column if not exists sur_place_ttc numeric, add column if not exists emporte_ttc numeric;
