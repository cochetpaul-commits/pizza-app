-- Sécurité des accès — partie 1 (failles 1 à 4), décisions de Paul du 28/09.
-- Les droits sont vérifiés dans la base (RLS, droits sur colonnes, déclencheurs), jamais seulement à l'écran.
-- Le serveur (clé service : routes API, tâches automatiques) n'est pas concerné par ces règles.

-- ── 1. Fonctions d'autorisation (rôle lu dans profiles, seule source) ─────────
create or replace function public.est_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'group_admin');
$$;

create or replace function public.est_manager_etab(etab uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.est_admin()
      or exists (select 1 from profiles where id = auth.uid() and role = 'manager' and etab = any(etablissements_access));
$$;

-- Remplace l'ancienne version, qui s'appuyait sur profiles.is_group_admin (colonne héritée)
create or replace function public.user_has_etablissement_access(etab_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.est_admin()
      or exists (select 1 from profiles where id = auth.uid() and etab_id = any(etablissements_access));
$$;

create or replace function public.est_mon_employe(emp uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from employes where id = emp and auth_user_id = auth.uid());
$$;

create or replace function public.etab_de_employe(emp uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select etablissement_id from employes where id = emp;
$$;

revoke execute on function public.est_admin(), public.est_manager_etab(uuid), public.est_mon_employe(uuid), public.etab_de_employe(uuid) from anon;

-- ── 2. Fiches employés ─────────────────────────────────────────────────────────
-- Lecture : managers et admins de l'établissement ; un équipier ne voit que sa propre fiche.
drop policy if exists "employes: select with access" on public.employes;
drop policy if exists "employes: insert with access" on public.employes;
drop policy if exists "employes: update with access" on public.employes;
drop policy if exists "employes: delete admin only" on public.employes;
create policy employes_lecture on public.employes for select to authenticated
  using (public.est_manager_etab(etablissement_id) or auth_user_id = auth.uid());
create policy employes_creation on public.employes for insert to authenticated
  with check (public.est_manager_etab(etablissement_id));
create policy employes_modification on public.employes for update to authenticated
  using (public.est_manager_etab(etablissement_id) or auth_user_id = auth.uid())
  with check (public.est_manager_etab(etablissement_id) or auth_user_id = auth.uid());
create policy employes_suppression on public.employes for delete to authenticated
  using (public.est_admin());

-- (Colonnes confidentielles masquées : migration 20260929100001, appliquée au moment du merge)

-- Garde-fou : personne ne change son propre rôle ou ses droits ; un équipier ne modifie
-- que son téléphone, son e-mail, ses disponibilités (et sa photo) ; données personnelles : admins.
create or replace function public.employes_garde_modification() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  reserve_admin text[] := array[
    'role', 'custom_permissions', 'auth_user_id', 'etablissement_id', 'etablissements_ids', 'equipes_access',
    'numero_secu', 'iban', 'bic', 'titulaire_compte', 'adresse', 'code_postal', 'ville',
    'date_naissance', 'lieu_naissance', 'departement_naissance', 'nationalite',
    'situation_familiale', 'nb_personnes_charge', 'handicap', 'type_handicap',
    'travailleur_etranger', 'autorisation_travail_type', 'autorisation_travail_numero', 'autorisation_travail_fin',
    'visite_renforcee', 'note', 'motif_sortie'];
  permis_equipier text[] := array['tel_mobile', 'email', 'disponibilites', 'avatar_url'];
  avant jsonb; apres jsonb; champ text;
begin
  if auth.uid() is null or public.est_admin() then return new; end if; -- serveur ou admin
  if tg_op = 'INSERT' then
    -- Un manager crée une fiche d'équipier : ni autre rôle, ni droits particuliers, ni lien de compte
    if coalesce(new.role, 'employe') not in ('employe', 'equipier')
       or coalesce(new.custom_permissions, '{}'::jsonb) <> '{}'::jsonb
       or new.auth_user_id is not null then
      raise exception 'Rôle, droits et lien de compte : réservés aux admins' using errcode = '42501';
    end if;
    return new;
  end if;
  avant := to_jsonb(old); apres := to_jsonb(new);
  for champ in select jsonb_object_keys(apres) loop
    if (avant->champ) is distinct from (apres->champ) then
      if champ = any(reserve_admin) then
        raise exception 'Modification réservée aux admins : « % »', champ using errcode = '42501';
      end if;
      if not public.est_manager_etab(old.etablissement_id) and champ <> all(permis_equipier) then
        raise exception 'Modification non autorisée : « % »', champ using errcode = '42501';
      end if;
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists trg_employes_garde_modification on public.employes;
create trigger trg_employes_garde_modification
  before insert or update on public.employes
  for each row execute function public.employes_garde_modification();

create or replace function public.employe_confidentiel(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.est_admin() then raise exception 'Réservé aux admins' using errcode = '42501'; end if;
  return (select jsonb_build_object(
    'numero_secu', numero_secu, 'iban', iban, 'bic', bic, 'titulaire_compte', titulaire_compte,
    'adresse', adresse, 'code_postal', code_postal, 'ville', ville,
    'date_naissance', date_naissance, 'lieu_naissance', lieu_naissance, 'departement_naissance', departement_naissance,
    'nationalite', nationalite, 'situation_familiale', situation_familiale, 'nb_personnes_charge', nb_personnes_charge,
    'handicap', handicap, 'type_handicap', type_handicap, 'travailleur_etranger', travailleur_etranger,
    'autorisation_travail_type', autorisation_travail_type, 'autorisation_travail_numero', autorisation_travail_numero,
    'autorisation_travail_fin', autorisation_travail_fin, 'visite_renforcee', visite_renforcee,
    'note', note, 'motif_sortie', motif_sortie)
    from employes where id = p_id);
end $$;
revoke execute on function public.employe_confidentiel(uuid) from anon;

-- ── 3. Contrats : heures, jours et dates pour les managers ; rémunération et éléments de paie : admins ──
drop policy if exists "contrats: select via employe" on public.contrats;
drop policy if exists "contrats: insert via employe" on public.contrats;
drop policy if exists "contrats: update via employe" on public.contrats;
drop policy if exists "contrats: delete admin only" on public.contrats;
create policy contrats_lecture on public.contrats for select to authenticated
  using (public.est_manager_etab(public.etab_de_employe(employe_id)));
create policy contrats_ecriture on public.contrats for all to authenticated
  using (public.est_admin()) with check (public.est_admin());
-- (Rémunération masquée : migration 20260929100001)
-- Contrats complets (avec rémunération) pour les écrans admin
create or replace function public.contrats_admin(p_employe_ids uuid[] default null, p_etab uuid default null)
returns setof public.contrats
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.est_admin() then raise exception 'Réservé aux admins' using errcode = '42501'; end if;
  return query
    select c.* from contrats c join employes e on e.id = c.employe_id
     where (p_employe_ids is null or c.employe_id = any(p_employe_ids))
       and (p_etab is null or e.etablissement_id = p_etab);
end $$;
revoke execute on function public.contrats_admin(uuid[], uuid) from anon;

drop policy if exists "contrat_elements: select via contrat" on public.contrat_elements;
drop policy if exists "contrat_elements: insert via contrat" on public.contrat_elements;
drop policy if exists "contrat_elements: update via contrat" on public.contrat_elements;
drop policy if exists "contrat_elements: delete admin only" on public.contrat_elements;
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'contrat_elements' loop
    execute format('drop policy %I on public.contrat_elements', p.policyname);
  end loop;
end $$;
create policy contrat_elements_admin on public.contrat_elements for all to authenticated
  using (public.est_admin()) with check (public.est_admin());

-- Primes (montants) : admins
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'primes' loop
    execute format('drop policy %I on public.primes', p.policyname);
  end loop;
end $$;
create policy primes_admin on public.primes for all to authenticated
  using (public.est_admin()) with check (public.est_admin());

-- ── 4. Absences, compteurs, signatures, plannings, présences ───────────────────
do $$ declare p record; begin
  for p in select tablename, policyname from pg_policies where schemaname = 'public'
            and tablename in ('absences', 'compteurs_employe', 'signatures', 'shifts', 'combo_presences') loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;
-- Absences (arrêts maladie compris) : managers de l'établissement, ou la personne concernée ;
-- un équipier ne crée que sa propre demande « en attente ».
create policy absences_lecture on public.absences for select to authenticated
  using (public.est_manager_etab(etablissement_id) or public.est_mon_employe(employe_id));
create policy absences_creation on public.absences for insert to authenticated
  with check (public.est_manager_etab(etablissement_id)
              or (public.est_mon_employe(employe_id) and statut = 'en_attente'));
create policy absences_modification on public.absences for update to authenticated
  using (public.est_manager_etab(etablissement_id)) with check (public.est_manager_etab(etablissement_id));
create policy absences_suppression on public.absences for delete to authenticated
  using (public.est_manager_etab(etablissement_id));

create policy compteurs_lecture on public.compteurs_employe for select to authenticated
  using (public.est_manager_etab(public.etab_de_employe(employe_id)) or public.est_mon_employe(employe_id));
create policy compteurs_ecriture on public.compteurs_employe for all to authenticated
  using (public.est_manager_etab(public.etab_de_employe(employe_id)))
  with check (public.est_manager_etab(public.etab_de_employe(employe_id)));

create policy signatures_lecture on public.signatures for select to authenticated
  using (public.est_manager_etab(public.etab_de_employe(employe_id)) or public.est_mon_employe(employe_id));
create policy signatures_ecriture on public.signatures for all to authenticated
  using (public.est_manager_etab(public.etab_de_employe(employe_id)) or public.est_mon_employe(employe_id))
  with check (public.est_manager_etab(public.etab_de_employe(employe_id)) or public.est_mon_employe(employe_id));

-- Planning : visible par l'équipe de l'établissement, modifiable par les managers
create policy shifts_lecture on public.shifts for select to authenticated
  using (public.user_has_etablissement_access(etablissement_id));
create policy shifts_ecriture on public.shifts for all to authenticated
  using (public.est_manager_etab(etablissement_id)) with check (public.est_manager_etab(etablissement_id));

create policy combo_presences_manager on public.combo_presences for all to authenticated
  using (public.est_manager_etab(etablissement_id)) with check (public.est_manager_etab(etablissement_id));

-- ── 5. Chiffres : ventes et objectifs pour les managers, charges pour les admins ──
do $$ declare p record; begin
  for p in select tablename, policyname from pg_policies where schemaname = 'public'
            and tablename in ('ventes_lignes', 'daily_sales', 'objectifs', 'charges_mensuelles', 'charges_detail') loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;
create policy ventes_lignes_lecture on public.ventes_lignes for select to authenticated
  using (public.est_manager_etab(etablissement_id));
create policy ventes_lignes_ecriture on public.ventes_lignes for all to authenticated
  using (public.est_admin()) with check (public.est_admin());
create policy daily_sales_lecture on public.daily_sales for select to authenticated
  using (public.est_manager_etab(etablissement_id));
create policy daily_sales_ecriture on public.daily_sales for all to authenticated
  using (public.est_admin()) with check (public.est_admin());
create policy objectifs_lecture on public.objectifs for select to authenticated
  using (public.est_manager_etab(etablissement_id));
create policy objectifs_ecriture on public.objectifs for all to authenticated
  using (public.est_admin()) with check (public.est_admin());
create policy charges_mensuelles_admin on public.charges_mensuelles for select to authenticated
  using (public.est_admin());
create policy charges_detail_admin on public.charges_detail for select to authenticated
  using (public.est_admin());

-- ── 6. Profils : l'ancienne règle « user_role() = 'admin' » (rôle disparu) est remplacée ──
drop policy if exists "Admin full access" on public.profiles;
drop policy if exists profiles_lecture_admin on public.profiles;
create policy profiles_lecture_admin on public.profiles for select to authenticated
  using (public.est_admin());
-- Aucune écriture de profil depuis l'écran : rôles et établissements passent par les routes admin.
