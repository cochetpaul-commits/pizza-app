-- Aligne le slug 'bellomio' (ancien) sur 'bello_mio' (slug courant de etablissements)
-- dans le champ TEXT[] `establishments` des 3 tables de recettes.
--
-- Raison : le slug de l'établissement Bello Mio a été renommé en `bello_mio`
-- (avec underscore) à un moment, mais les recettes pré-existantes utilisaient
-- encore `bellomio`. L'UI filtre via `establishments.contains([etab.slug])`
-- donc ces recettes étaient invisibles côté Bello Mio.
--
-- Idempotent : array_replace ne fait rien si la valeur n'existe pas dans l'array.

-- pizza_recipes
update public.pizza_recipes
set establishments = array_replace(establishments, 'bellomio', 'bello_mio')
where establishments && array['bellomio']::text[];

-- kitchen_recipes
update public.kitchen_recipes
set establishments = array_replace(establishments, 'bellomio', 'bello_mio')
where establishments && array['bellomio']::text[];

-- cocktails
update public.cocktails
set establishments = array_replace(establishments, 'bellomio', 'bello_mio')
where establishments && array['bellomio']::text[];
