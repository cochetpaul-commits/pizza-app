-- 05/11/2026 : qui a créé et modifié une fiche (recettes cuisine, pizzas, cocktails, préparations, empâtements).
-- La tablette envoie l'employé identifié par son code (en-tête x-employe-id, vérifié : employé actif d'un
-- établissement auquel le compte a accès) ; sinon la fiche employé du compte connecté, sinon son nom de profil.
-- Écritures du serveur (clé de service, tâches de nuit) : rien n'est touché.
create or replace function public.signer_modification() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  h json;
  eid uuid;
  qui text;
begin
  begin h := nullif(current_setting('request.headers', true), '')::json; exception when others then h := null; end;
  if h is not null and (h->>'x-employe-id') is not null then
    begin eid := (h->>'x-employe-id')::uuid; exception when others then eid := null; end;
  end if;
  if eid is not null then
    select e.prenom || coalesce(' ' || upper(left(e.nom, 1)) || '.', '') into qui
    from employes e where e.id = eid and e.actif and e.etablissement_id = any(etabs_acces());
  end if;
  if qui is null and auth.uid() is not null then
    select coalesce((select e.prenom || coalesce(' ' || upper(left(e.nom, 1)) || '.', '') from employes e where e.auth_user_id = auth.uid() and e.actif limit 1), p.display_name)
      into qui from profiles p where p.id = auth.uid();
  end if;
  if qui is null then return new; end if;
  new.modifie_par_nom := qui;
  new.modifie_le := now();
  if tg_op = 'INSERT' then new.cree_par_nom := qui; end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['kitchen_recipes', 'prep_recipes', 'recipes'] loop
    execute format('alter table public.%I add column if not exists cree_par_nom text, add column if not exists modifie_par_nom text, add column if not exists modifie_le timestamptz', t);
    execute format('drop trigger if exists signer_modification on public.%I', t);
    execute format('create trigger signer_modification before insert or update on public.%I for each row execute function public.signer_modification()', t);
  end loop;
end $$;
