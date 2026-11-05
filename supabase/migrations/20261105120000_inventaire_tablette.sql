-- 05/11/2026 : l'inventaire se compte sur la tablette (compte employé). Les droits passent des seuls managers
-- (etabs_manager) à toute personne de l'établissement (etabs_acces) ; la suppression reste aux administrateurs.
-- Chaque ligne est signée par l'employé qui l'a comptée.
alter table public.inventaire_lignes add column if not exists saisi_par_nom text, add column if not exists saisi_par_employe uuid references public.employes(id) on delete set null;
alter table public.inventaires add column if not exists created_by_nom text, add column if not exists cloture_par_nom text;
alter policy inventaires_lecture on public.inventaires using (etablissement_id = any ((select etabs_acces())::uuid[]));
alter policy inventaires_modification on public.inventaires using (etablissement_id = any ((select etabs_acces())::uuid[])) with check (etablissement_id = any ((select etabs_acces())::uuid[]));
alter policy inventaires_creation on public.inventaires with check (etablissement_id = any ((select etabs_acces())::uuid[]));
alter policy inventaire_lignes_acces on public.inventaire_lignes using (inventaire_id in (select id from inventaires where etablissement_id = any ((select etabs_acces())::uuid[]))) with check (inventaire_id in (select id from inventaires where etablissement_id = any ((select etabs_acces())::uuid[])));
