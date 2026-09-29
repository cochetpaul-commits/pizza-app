-- Deux façons de saisir : « zones » (écran d'origine, produits par zone) ou « feuille » (lignes pré-remplies dans l'ordre de la feuille papier)
alter table public.inventaires add column if not exists saisie text not null default 'zones';
alter table public.inventaires drop constraint if exists inventaires_saisie_check;
alter table public.inventaires add constraint inventaires_saisie_check check (saisie in ('zones', 'feuille'));
