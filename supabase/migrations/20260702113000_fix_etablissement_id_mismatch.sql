-- Aligne etablissement_id sur le slug de establishments[] quand ils divergent.
--
-- Contexte : certaines recettes avaient une incoherence entre :
--   - etablissement_id (foreign key vers etablissements.id)
--   - establishments (text array, filtree par l'UI via slug)
-- Ex. BOLOGNESE CASA avait etablissement_id=Bello mais establishments=['piccola'].
-- L'UI affichait la recette cote Piccola (via array), mais les routes API
-- filtrant par etablissement_id ne la trouvaient pas => "Recette introuvable"
-- au clic sur "Publication" / catalogue / PDF.
--
-- Fix : etablissement_id devient l'ID du slug present dans l'array (source de
-- verite = ce que l'UI affiche). Idempotent.

with slugs as (
  select id, slug from public.etablissements
)
update public.kitchen_recipes r
set etablissement_id = s.id
from slugs s
where s.slug = any (r.establishments)
  and r.etablissement_id is distinct from s.id;

with slugs as (
  select id, slug from public.etablissements
)
update public.pizza_recipes r
set etablissement_id = s.id
from slugs s
where s.slug = any (r.establishments)
  and r.etablissement_id is distinct from s.id;

with slugs as (
  select id, slug from public.etablissements
)
update public.cocktails r
set etablissement_id = s.id
from slugs s
where s.slug = any (r.establishments)
  and r.etablissement_id is distinct from s.id;
