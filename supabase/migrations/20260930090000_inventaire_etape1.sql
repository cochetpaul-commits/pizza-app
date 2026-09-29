-- Inventaires, étape 1 : type, saisie en colis + unités suivant la feuille papier, droits admins / managers,
-- inventaire clôturé verrouillé (sauf admin), zones dans l'ordre des feuilles.

-- Type et réouverture
alter table public.inventaires add column if not exists type text not null default 'mensuel';
alter table public.inventaires drop constraint if exists inventaires_type_check;
alter table public.inventaires add constraint inventaires_type_check check (type in ('fin_exercice', 'mensuel'));
alter table public.inventaires add column if not exists rouvert_par uuid;
alter table public.inventaires add column if not exists rouvert_at timestamptz;
-- « en pause » était déjà utilisé par l'écran mais refusé par la base
alter table public.inventaires drop constraint if exists inventaires_statut_check;
alter table public.inventaires add constraint inventaires_statut_check check (statut in ('en_cours', 'en_pause', 'cloture'));

-- Lignes : ordre de la feuille, famille, saisie colis / unités (null = pas encore compté),
-- conditionnement retenu au moment de l'inventaire (le total ne bouge plus si la fiche change ensuite)
alter table public.inventaire_lignes
  add column if not exists ordre integer,
  add column if not exists famille text,
  add column if not exists colis numeric check (colis >= 0),
  add column if not exists unites numeric check (unites >= 0),
  add column if not exists cond_supplier_id uuid,
  add column if not exists cond_contenu numeric,
  add column if not exists cond_libelle text,
  add column if not exists saisi_par uuid;
create index if not exists idx_inventaire_lignes_ordre on public.inventaire_lignes (inventaire_id, zone, ordre);

-- Droits : admins et managers de l'établissement (avant : ouvert à tous les comptes connectés)
drop policy if exists allow_all_inventaires on public.inventaires;
drop policy if exists inventaires_lecture on public.inventaires;
drop policy if exists inventaires_creation on public.inventaires;
drop policy if exists inventaires_modification on public.inventaires;
drop policy if exists inventaires_suppression on public.inventaires;
create policy inventaires_lecture on public.inventaires for select to authenticated
  using (etablissement_id = any ((select public.etabs_manager())::uuid[]));
create policy inventaires_creation on public.inventaires for insert to authenticated
  with check (etablissement_id = any ((select public.etabs_manager())::uuid[]));
create policy inventaires_modification on public.inventaires for update to authenticated
  using (etablissement_id = any ((select public.etabs_manager())::uuid[]))
  with check (etablissement_id = any ((select public.etabs_manager())::uuid[]));
create policy inventaires_suppression on public.inventaires for delete to authenticated
  using ((select public.est_admin()));

drop policy if exists allow_all_inventaire_lignes on public.inventaire_lignes;
drop policy if exists inventaire_lignes_acces on public.inventaire_lignes;
create policy inventaire_lignes_acces on public.inventaire_lignes for all to authenticated
  using (inventaire_id in (select id from public.inventaires where etablissement_id = any ((select public.etabs_manager())::uuid[])))
  with check (inventaire_id in (select id from public.inventaires where etablissement_id = any ((select public.etabs_manager())::uuid[])));

-- Inventaire clôturé : plus modifiable, sauf par un admin (le serveur, sans compte connecté, passe)
create or replace function public.inventaire_verrou() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_statut text;
begin
  if auth.uid() is null or public.est_admin() then return coalesce(new, old); end if;
  if tg_table_name = 'inventaires' then
    if old.statut = 'cloture' then raise exception 'Inventaire clôturé : seul un admin peut le modifier' using errcode = '42501'; end if;
    return new;
  end if;
  select statut into v_statut from inventaires where id = coalesce(new.inventaire_id, old.inventaire_id);
  if v_statut = 'cloture' then raise exception 'Inventaire clôturé : seul un admin peut le modifier' using errcode = '42501'; end if;
  return coalesce(new, old);
end $$;
drop trigger if exists inventaires_verrou on public.inventaires;
create trigger inventaires_verrou before update or delete on public.inventaires for each row execute function public.inventaire_verrou();
drop trigger if exists inventaire_lignes_verrou on public.inventaire_lignes;
create trigger inventaire_lignes_verrou before insert or update or delete on public.inventaire_lignes for each row execute function public.inventaire_verrou();

-- Zones : ordre des feuilles papier
update public.storage_zones z set display_order = o.ordre
  from (values ('CHAMBRE FROIDE', 1), ('CONGÉLATEUR', 2), ('ANNEXE', 3), ('GARAGE', 4), ('CAVE A VIN', 5), ('BAR', 6)) as o(nom, ordre),
       public.etablissements e
 where e.id = z.etablissement_id and e.slug = 'bello_mio' and z.name = o.nom;
-- Piccola Mia : « Chambre froide » devient « Annexe frigo » (zones et emplacements mémorisés de Piccola seulement), + « Cuisine »
update public.ingredient_zones iz set zone = 'ANNEXE FRIGO'
  from public.etablissements e where e.id = iz.etablissement_id and e.slug = 'piccola' and iz.zone = 'CHAMBRE FROIDE';
update public.storage_zones z set name = 'ANNEXE FRIGO'
  from public.etablissements e where e.id = z.etablissement_id and e.slug = 'piccola' and z.name = 'CHAMBRE FROIDE';
insert into public.storage_zones (name, etablissement_id, display_order)
  select 'CUISINE', e.id, 3 from public.etablissements e
   where e.slug = 'piccola' and not exists (select 1 from public.storage_zones z where z.etablissement_id = e.id and z.name = 'CUISINE');
update public.storage_zones z set display_order = o.ordre
  from (values ('SURFACE DE VENTE', 1), ('ANNEXE FRIGO', 2), ('CUISINE', 3)) as o(nom, ordre),
       public.etablissements e
 where e.id = z.etablissement_id and e.slug = 'piccola' and z.name = o.nom;
