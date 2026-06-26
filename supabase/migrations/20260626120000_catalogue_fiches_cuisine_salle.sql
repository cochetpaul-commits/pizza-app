-- Étend recipe_type pour accueillir la fiche salle (FT-SALLE-XXXXXX),
-- en parallèle de la fiche cuisine existante.
alter table catalogue_fiches
  drop constraint if exists catalogue_fiches_recipe_type_check;

alter table catalogue_fiches
  add constraint catalogue_fiches_recipe_type_check
  check (recipe_type in ('pizza','cuisine','cuisine-salle','cocktail','empatement'));
