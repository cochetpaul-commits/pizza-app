-- Sécurité des accès, partie 1 — performance (appliquée le 28/09 juste après 20260929100000).
-- Les règles appelaient une fonction PAR LIGNE (est_manager_etab(etablissement_id)) : 219 000 lignes de ventes
-- dépassaient le délai de la base. Ici, la liste des établissements / employés de la personne connectée est
-- calculée UNE fois par requête (« (select …) ») et comparée à chaque ligne.

create or replace function public.etabs_manager() returns uuid[]
language sql stable security definer set search_path = public as $$
  select case when public.est_admin() then array(select id from etablissements)
              else coalesce((select etablissements_access from profiles where id = auth.uid() and role = 'manager'), '{}') end;
$$;
create or replace function public.etabs_acces() returns uuid[]
language sql stable security definer set search_path = public as $$
  select case when public.est_admin() then array(select id from etablissements)
              else coalesce((select etablissements_access from profiles where id = auth.uid()), '{}') end;
$$;
create or replace function public.employes_geres() returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array(select id from employes where etablissement_id = any(public.etabs_manager())), '{}');
$$;
create or replace function public.mes_employes() returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array(select id from employes where auth_user_id = auth.uid()), '{}');
$$;
revoke execute on function public.etabs_manager(), public.etabs_acces(), public.employes_geres(), public.mes_employes() from anon;

-- Fiches employés
drop policy if exists employes_lecture on public.employes;
drop policy if exists employes_creation on public.employes;
drop policy if exists employes_modification on public.employes;
drop policy if exists employes_suppression on public.employes;
create policy employes_lecture on public.employes for select to authenticated
  using (etablissement_id = any ((select public.etabs_manager())::uuid[]) or auth_user_id = (select auth.uid()));
create policy employes_creation on public.employes for insert to authenticated
  with check (etablissement_id = any ((select public.etabs_manager())::uuid[]));
create policy employes_modification on public.employes for update to authenticated
  using (etablissement_id = any ((select public.etabs_manager())::uuid[]) or auth_user_id = (select auth.uid()))
  with check (etablissement_id = any ((select public.etabs_manager())::uuid[]) or auth_user_id = (select auth.uid()));
create policy employes_suppression on public.employes for delete to authenticated
  using ((select public.est_admin()));

-- Contrats, éléments de paie, primes
drop policy if exists contrats_lecture on public.contrats;
drop policy if exists contrats_ecriture on public.contrats;
create policy contrats_lecture on public.contrats for select to authenticated
  using (employe_id = any ((select public.employes_geres())::uuid[]));
create policy contrats_ecriture on public.contrats for all to authenticated
  using ((select public.est_admin())) with check ((select public.est_admin()));
drop policy if exists contrat_elements_admin on public.contrat_elements;
create policy contrat_elements_admin on public.contrat_elements for all to authenticated
  using ((select public.est_admin())) with check ((select public.est_admin()));
drop policy if exists primes_admin on public.primes;
create policy primes_admin on public.primes for all to authenticated
  using ((select public.est_admin())) with check ((select public.est_admin()));

-- Absences, compteurs, signatures, planning, présences
drop policy if exists absences_lecture on public.absences;
drop policy if exists absences_creation on public.absences;
drop policy if exists absences_modification on public.absences;
drop policy if exists absences_suppression on public.absences;
create policy absences_lecture on public.absences for select to authenticated
  using (etablissement_id = any ((select public.etabs_manager())::uuid[]) or employe_id = any ((select public.mes_employes())::uuid[]));
create policy absences_creation on public.absences for insert to authenticated
  with check (etablissement_id = any ((select public.etabs_manager())::uuid[])
              or (employe_id = any ((select public.mes_employes())::uuid[]) and statut = 'en_attente'));
create policy absences_modification on public.absences for update to authenticated
  using (etablissement_id = any ((select public.etabs_manager())::uuid[]))
  with check (etablissement_id = any ((select public.etabs_manager())::uuid[]));
create policy absences_suppression on public.absences for delete to authenticated
  using (etablissement_id = any ((select public.etabs_manager())::uuid[]));

drop policy if exists compteurs_lecture on public.compteurs_employe;
drop policy if exists compteurs_ecriture on public.compteurs_employe;
create policy compteurs_lecture on public.compteurs_employe for select to authenticated
  using (employe_id = any ((select public.employes_geres())::uuid[]) or employe_id = any ((select public.mes_employes())::uuid[]));
create policy compteurs_ecriture on public.compteurs_employe for all to authenticated
  using (employe_id = any ((select public.employes_geres())::uuid[]))
  with check (employe_id = any ((select public.employes_geres())::uuid[]));

drop policy if exists signatures_lecture on public.signatures;
drop policy if exists signatures_ecriture on public.signatures;
create policy signatures_lecture on public.signatures for select to authenticated
  using (employe_id = any ((select public.employes_geres())::uuid[]) or employe_id = any ((select public.mes_employes())::uuid[]));
create policy signatures_ecriture on public.signatures for all to authenticated
  using (employe_id = any ((select public.employes_geres())::uuid[]) or employe_id = any ((select public.mes_employes())::uuid[]))
  with check (employe_id = any ((select public.employes_geres())::uuid[]) or employe_id = any ((select public.mes_employes())::uuid[]));

drop policy if exists shifts_lecture on public.shifts;
drop policy if exists shifts_ecriture on public.shifts;
create policy shifts_lecture on public.shifts for select to authenticated
  using (etablissement_id = any ((select public.etabs_acces())::uuid[]));
create policy shifts_ecriture on public.shifts for all to authenticated
  using (etablissement_id = any ((select public.etabs_manager())::uuid[]))
  with check (etablissement_id = any ((select public.etabs_manager())::uuid[]));

drop policy if exists combo_presences_manager on public.combo_presences;
create policy combo_presences_manager on public.combo_presences for all to authenticated
  using (etablissement_id = any ((select public.etabs_manager())::uuid[]))
  with check (etablissement_id = any ((select public.etabs_manager())::uuid[]));

-- Chiffres
drop policy if exists ventes_lignes_lecture on public.ventes_lignes;
drop policy if exists ventes_lignes_ecriture on public.ventes_lignes;
create policy ventes_lignes_lecture on public.ventes_lignes for select to authenticated
  using (etablissement_id = any ((select public.etabs_manager())::uuid[]));
create policy ventes_lignes_ecriture on public.ventes_lignes for all to authenticated
  using ((select public.est_admin())) with check ((select public.est_admin()));
drop policy if exists daily_sales_lecture on public.daily_sales;
drop policy if exists daily_sales_ecriture on public.daily_sales;
create policy daily_sales_lecture on public.daily_sales for select to authenticated
  using (etablissement_id = any ((select public.etabs_manager())::uuid[]));
create policy daily_sales_ecriture on public.daily_sales for all to authenticated
  using ((select public.est_admin())) with check ((select public.est_admin()));
drop policy if exists objectifs_lecture on public.objectifs;
drop policy if exists objectifs_ecriture on public.objectifs;
create policy objectifs_lecture on public.objectifs for select to authenticated
  using (etablissement_id = any ((select public.etabs_manager())::uuid[]));
create policy objectifs_ecriture on public.objectifs for all to authenticated
  using ((select public.est_admin())) with check ((select public.est_admin()));
drop policy if exists charges_mensuelles_admin on public.charges_mensuelles;
drop policy if exists charges_detail_admin on public.charges_detail;
create policy charges_mensuelles_admin on public.charges_mensuelles for select to authenticated
  using ((select public.est_admin()));
create policy charges_detail_admin on public.charges_detail for select to authenticated
  using ((select public.est_admin()));

drop policy if exists profiles_lecture_admin on public.profiles;
create policy profiles_lecture_admin on public.profiles for select to authenticated
  using ((select public.est_admin()));
