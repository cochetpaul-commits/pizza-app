-- Catégorie « Pizza » dans la table categories (10/10/2026).
-- Dix fiches kitchen_recipes ont category = 'pizza' et la famille « pizza » existe,
-- mais la catégorie manquait : le menu déroulant de la fiche affichait
-- « Accompagnement » (première option) pour une pizza.
insert into public.categories (nom, slug, couleur, famille_id, sous_categories, sort_order)
values ('Pizza', 'pizza', '#DD4124', 'pizza', '{}', 5)
on conflict (slug) do nothing;
