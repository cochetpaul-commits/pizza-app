-- Inventaire feuille : une ligne peut être retirée de la liste (et remise), sans la supprimer ni toucher à la fiche.
-- Les lignes retirées ne comptent ni dans la valorisation, ni dans la clôture, ni dans le PDF.
alter table public.inventaire_lignes add column if not exists retiree boolean not null default false;
