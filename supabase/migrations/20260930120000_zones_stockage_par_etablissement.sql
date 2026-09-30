-- Zones de stockage PAR ÉTABLISSEMENT.
--
-- Vécu 30/09 : une fiche partagée (« les deux ») n'a qu'une zone (ingredients.storage_zone),
-- or Bello Mio et Piccola Mia n'ont pas les mêmes zones (CHAMBRE FROIDE / CAVE A VIN / … contre
-- SURFACE DE VENTE / ANNEXE FRIGO / CUISINE). Une correction faite pour Bello Mio écrasait
-- la zone de Piccola Mia.
--
-- Modèle : ingredient_zones (etablissement_id, ingredient_id, zone) porte désormais un `rang` :
--   1 = zone principale, 2 = zone secondaire, NULL = emplacement supplémentaire (inventaire).
-- ingredients.storage_zone / storage_zone_2 restent un MIROIR des rangs 1 / 2 de l'établissement
-- de rattachement (etablissement_id), tenu par triggers dans les deux sens : l'ancien code qui
-- lit ou écrit ces colonnes reste juste pour cet établissement.

alter table public.ingredient_zones add column if not exists rang smallint;
alter table public.ingredient_zones drop constraint if exists ingredient_zones_rang_check;
alter table public.ingredient_zones add constraint ingredient_zones_rang_check check (rang is null or rang in (1, 2));
create unique index if not exists ingredient_zones_rang_unique
  on public.ingredient_zones (etablissement_id, ingredient_id, rang) where rang is not null;

-- Clé du tableau ingredients.establishments ('bellomio' / 'piccola') → établissement
create or replace function public.etab_id_de_cle(p_cle text)
returns uuid language sql stable set search_path = public as $$
  select id from public.etablissements
  where case when p_cle = 'piccola' then slug ilike '%piccola%' else slug ilike '%bello%' end
  order by created_at limit 1
$$;

-- Écrit la zone de rang 1 ou 2 d'un produit pour un établissement (p_zone vide = retirée).
create or replace function public.set_zone_stockage(p_ingredient uuid, p_etab uuid, p_rang smallint, p_zone text)
returns void language plpgsql security invoker set search_path = public as $$
declare v_zone text := nullif(trim(p_zone), '');
begin
  if p_rang not in (1, 2) then raise exception 'rang % invalide (1 ou 2)', p_rang; end if;
  if v_zone is not null and not exists (select 1 from storage_zones z where z.etablissement_id = p_etab and z.name = v_zone) then
    raise exception 'Zone « % » inconnue pour cet établissement', v_zone;
  end if;
  delete from ingredient_zones where etablissement_id = p_etab and ingredient_id = p_ingredient and rang = p_rang;
  if v_zone is not null then
    insert into ingredient_zones (etablissement_id, ingredient_id, zone, rang, source, updated_at)
    values (p_etab, p_ingredient, v_zone, p_rang, 'fiche', now())
    on conflict (etablissement_id, ingredient_id, zone) do update set rang = excluded.rang, source = 'fiche', updated_at = now();
  end if;
end $$;
revoke execute on function public.set_zone_stockage(uuid, uuid, smallint, text) from anon;

-- ingredient_zones → miroir ingredients.storage_zone / storage_zone_2 (établissement de rattachement seulement)
create or replace function public.ingredient_zones_miroir()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_ing uuid; v_etab uuid; v_rattachement uuid;
begin
  if pg_trigger_depth() > 1 then return null; end if;
  if tg_op = 'DELETE' then v_ing := old.ingredient_id; v_etab := old.etablissement_id;
  else v_ing := new.ingredient_id; v_etab := new.etablissement_id; end if;
  if tg_op = 'UPDATE' and (old.rang is null and new.rang is null) then return null; end if;
  if tg_op <> 'UPDATE' and coalesce(new.rang, old.rang) is null then return null; end if;
  select etablissement_id into v_rattachement from ingredients where id = v_ing;
  if v_rattachement is null or v_rattachement <> v_etab then return null; end if;
  update ingredients i set
    storage_zone = (select zone from ingredient_zones where ingredient_id = v_ing and etablissement_id = v_etab and rang = 1),
    storage_zone_2 = (select zone from ingredient_zones where ingredient_id = v_ing and etablissement_id = v_etab and rang = 2)
  where i.id = v_ing;
  return null;
end $$;
drop trigger if exists trg_ingredient_zones_miroir on public.ingredient_zones;
create trigger trg_ingredient_zones_miroir
  after insert or update or delete on public.ingredient_zones
  for each row execute function public.ingredient_zones_miroir();

-- ingredients.storage_zone / storage_zone_2 (ancien code) → rangs 1 / 2 de l'établissement de rattachement
create or replace function public.ingredients_zones_sync()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_z1 text := nullif(trim(new.storage_zone), ''); v_z2 text := nullif(trim(new.storage_zone_2), '');
begin
  if pg_trigger_depth() > 1 then return null; end if;
  if new.etablissement_id is null then return null; end if;
  if tg_op = 'UPDATE' and new.storage_zone is not distinct from old.storage_zone
     and new.storage_zone_2 is not distinct from old.storage_zone_2
     and new.etablissement_id is not distinct from old.etablissement_id then return null; end if;
  delete from ingredient_zones where ingredient_id = new.id and etablissement_id = new.etablissement_id and rang in (1, 2);
  if v_z1 is not null and exists (select 1 from storage_zones z where z.etablissement_id = new.etablissement_id and z.name = v_z1) then
    insert into ingredient_zones (etablissement_id, ingredient_id, zone, rang, source, updated_at)
    values (new.etablissement_id, new.id, v_z1, 1, 'fiche', now())
    on conflict (etablissement_id, ingredient_id, zone) do update set rang = 1, source = 'fiche', updated_at = now();
  end if;
  if v_z2 is not null and v_z2 is distinct from v_z1 and exists (select 1 from storage_zones z where z.etablissement_id = new.etablissement_id and z.name = v_z2) then
    insert into ingredient_zones (etablissement_id, ingredient_id, zone, rang, source, updated_at)
    values (new.etablissement_id, new.id, v_z2, 2, 'fiche', now())
    on conflict (etablissement_id, ingredient_id, zone) do update set rang = 2, source = 'fiche', updated_at = now();
  end if;
  return null;
end $$;
drop trigger if exists trg_ingredients_zones_sync on public.ingredients;
create trigger trg_ingredients_zones_sync
  after insert or update of storage_zone, storage_zone_2, etablissement_id on public.ingredients
  for each row execute function public.ingredients_zones_sync();

-- Reprise : chaque fiche reçoit, dans chaque établissement où elle est visible (establishments,
-- null = partout), sa zone actuelle en rang 1 / 2 si cette zone existe dans cet établissement.
insert into public.ingredient_zones (etablissement_id, ingredient_id, zone, rang, source, updated_at)
select e.id, i.id, i.storage_zone, 1, 'fiche', now()
from public.ingredients i
cross join lateral unnest(coalesce(i.establishments, array['bellomio', 'piccola'])) as k(cle)
join public.etablissements e on e.id = public.etab_id_de_cle(k.cle)
where nullif(trim(i.storage_zone), '') is not null
  and exists (select 1 from public.storage_zones z where z.etablissement_id = e.id and z.name = i.storage_zone)
on conflict (etablissement_id, ingredient_id, zone) do update set rang = 1, source = 'fiche', updated_at = now();

insert into public.ingredient_zones (etablissement_id, ingredient_id, zone, rang, source, updated_at)
select e.id, i.id, i.storage_zone_2, 2, 'fiche', now()
from public.ingredients i
cross join lateral unnest(coalesce(i.establishments, array['bellomio', 'piccola'])) as k(cle)
join public.etablissements e on e.id = public.etab_id_de_cle(k.cle)
where nullif(trim(i.storage_zone_2), '') is not null
  and i.storage_zone_2 is distinct from i.storage_zone
  and exists (select 1 from public.storage_zones z where z.etablissement_id = e.id and z.name = i.storage_zone_2)
on conflict (etablissement_id, ingredient_id, zone) do update set rang = 2, source = 'fiche', updated_at = now();

-- Miroir réaligné : storage_zone / storage_zone_2 = rangs 1 / 2 de l'établissement de rattachement
-- (une zone de Bello Mio sur une fiche rattachée à Piccola Mia n'a pas de sens : elle devient vide).
alter table public.ingredients disable trigger trg_ingredients_zones_sync;
update public.ingredients i set
  storage_zone = (select zone from public.ingredient_zones where ingredient_id = i.id and etablissement_id = i.etablissement_id and rang = 1),
  storage_zone_2 = (select zone from public.ingredient_zones where ingredient_id = i.id and etablissement_id = i.etablissement_id and rang = 2)
where i.etablissement_id is not null
  and (i.storage_zone is distinct from (select zone from public.ingredient_zones where ingredient_id = i.id and etablissement_id = i.etablissement_id and rang = 1)
    or i.storage_zone_2 is distinct from (select zone from public.ingredient_zones where ingredient_id = i.id and etablissement_id = i.etablissement_id and rang = 2));
alter table public.ingredients enable trigger trg_ingredients_zones_sync;

comment on column public.ingredient_zones.rang is '1 = zone principale, 2 = zone secondaire, null = emplacement supplémentaire (inventaire)';
comment on column public.ingredients.storage_zone is 'Miroir de ingredient_zones rang 1 pour l''établissement de rattachement ; lecture par établissement : ingredient_zones';
