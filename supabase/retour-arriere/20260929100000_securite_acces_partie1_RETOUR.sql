-- RETOUR ARRIÈRE de la migration 20260929100000_securite_acces_partie1.sql
-- Restaure à l'identique les règles d'accès et la fonction en place le 28/09/2026 à 22 h (relevé en base).
-- À exécuter d'un bloc (transaction) uniquement en cas de problème.
begin;

-- 1. Retirer ce que la migration ajoute
drop trigger if exists trg_employes_garde_modification on public.employes;
drop function if exists public.employes_garde_modification();
drop function if exists public.employe_confidentiel(uuid);
drop function if exists public.contrats_admin(uuid[], uuid);

do $$ declare p record; begin
  for p in select tablename, policyname from pg_policies where schemaname = 'public'
            and tablename in ('employes','contrats','contrat_elements','primes','absences','compteurs_employe','signatures',
                              'shifts','combo_presences','ventes_lignes','daily_sales','objectifs','charges_mensuelles',
                              'charges_detail','profiles') loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- 2. Fonction d'accès d'origine
CREATE OR REPLACE FUNCTION public.user_has_etablissement_access(etab_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND (
      is_group_admin = TRUE
      OR etab_id = ANY(etablissements_access)
    )
  );
$function$;

-- 3. Règles d'origine
create policy "Admin full access" on public.profiles as PERMISSIVE for ALL to public using ((user_role() = 'admin'::text));
create policy "Users read own profile" on public.profiles as PERMISSIVE for SELECT to public using ((id = auth.uid()));
create policy "absences: delete with access" on public.absences as PERMISSIVE for DELETE to public using (user_has_etablissement_access(etablissement_id));
create policy "absences: insert with access" on public.absences as PERMISSIVE for INSERT to public with check (user_has_etablissement_access(etablissement_id));
create policy "absences: select with access" on public.absences as PERMISSIVE for SELECT to public using (user_has_etablissement_access(etablissement_id));
create policy "absences: update with access" on public.absences as PERMISSIVE for UPDATE to public using (user_has_etablissement_access(etablissement_id));
create policy "combo_presences: delete via import" on public.combo_presences as PERMISSIVE for DELETE to public using (user_has_etablissement_access(etablissement_id));
create policy "combo_presences: insert with access" on public.combo_presences as PERMISSIVE for INSERT to public with check (user_has_etablissement_access(etablissement_id));
create policy "combo_presences: select with access" on public.combo_presences as PERMISSIVE for SELECT to public using (user_has_etablissement_access(etablissement_id));
create policy "combo_presences: update with access" on public.combo_presences as PERMISSIVE for UPDATE to public using (user_has_etablissement_access(etablissement_id));
create policy "compteurs_employe: delete admin only" on public.compteurs_employe as PERMISSIVE for DELETE to public using ((EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = auth.uid()) AND (profiles.is_group_admin = true)))));
create policy "compteurs_employe: insert via employe" on public.compteurs_employe as PERMISSIVE for INSERT to public with check ((employe_id IN ( SELECT employes.id FROM employes WHERE user_has_etablissement_access(employes.etablissement_id))));
create policy "compteurs_employe: select via employe" on public.compteurs_employe as PERMISSIVE for SELECT to public using ((employe_id IN ( SELECT employes.id FROM employes WHERE user_has_etablissement_access(employes.etablissement_id))));
create policy "compteurs_employe: update via employe" on public.compteurs_employe as PERMISSIVE for UPDATE to public using ((employe_id IN ( SELECT employes.id FROM employes WHERE user_has_etablissement_access(employes.etablissement_id))));
create policy "contrat_elements: delete admin only" on public.contrat_elements as PERMISSIVE for DELETE to public using ((EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = auth.uid()) AND (profiles.is_group_admin = true)))));
create policy "contrat_elements: insert via contrat" on public.contrat_elements as PERMISSIVE for INSERT to public with check ((contrat_id IN ( SELECT c.id FROM (contrats c JOIN employes e ON ((e.id = c.employe_id))) WHERE user_has_etablissement_access(e.etablissement_id))));
create policy "contrat_elements: select via contrat" on public.contrat_elements as PERMISSIVE for SELECT to public using ((contrat_id IN ( SELECT c.id FROM (contrats c JOIN employes e ON ((e.id = c.employe_id))) WHERE user_has_etablissement_access(e.etablissement_id))));
create policy "contrat_elements: update via contrat" on public.contrat_elements as PERMISSIVE for UPDATE to public using ((contrat_id IN ( SELECT c.id FROM (contrats c JOIN employes e ON ((e.id = c.employe_id))) WHERE user_has_etablissement_access(e.etablissement_id))));
create policy "contrats: delete admin only" on public.contrats as PERMISSIVE for DELETE to public using ((EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = auth.uid()) AND (profiles.is_group_admin = true)))));
create policy "contrats: insert via employe" on public.contrats as PERMISSIVE for INSERT to public with check ((employe_id IN ( SELECT employes.id FROM employes WHERE user_has_etablissement_access(employes.etablissement_id))));
create policy "contrats: select via employe" on public.contrats as PERMISSIVE for SELECT to public using ((employe_id IN ( SELECT employes.id FROM employes WHERE user_has_etablissement_access(employes.etablissement_id))));
create policy "contrats: update via employe" on public.contrats as PERMISSIVE for UPDATE to public using ((employe_id IN ( SELECT employes.id FROM employes WHERE user_has_etablissement_access(employes.etablissement_id))));
create policy "employes: delete admin only" on public.employes as PERMISSIVE for DELETE to public using ((EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = auth.uid()) AND (profiles.is_group_admin = true)))));
create policy "employes: insert with access" on public.employes as PERMISSIVE for INSERT to public with check (user_has_etablissement_access(etablissement_id));
create policy "employes: select with access" on public.employes as PERMISSIVE for SELECT to public using (user_has_etablissement_access(etablissement_id));
create policy "employes: update with access" on public.employes as PERMISSIVE for UPDATE to public using (user_has_etablissement_access(etablissement_id));
create policy "shifts: delete with access" on public.shifts as PERMISSIVE for DELETE to public using (user_has_etablissement_access(etablissement_id));
create policy "shifts: insert with access" on public.shifts as PERMISSIVE for INSERT to public with check (user_has_etablissement_access(etablissement_id));
create policy "shifts: select with access" on public.shifts as PERMISSIVE for SELECT to public using (user_has_etablissement_access(etablissement_id));
create policy "shifts: update with access" on public.shifts as PERMISSIVE for UPDATE to public using (user_has_etablissement_access(etablissement_id));
create policy "signatures: insert with access" on public.signatures as PERMISSIVE for INSERT to public with check ((employe_id IN ( SELECT employes.id FROM employes WHERE user_has_etablissement_access(employes.etablissement_id))));
create policy "signatures: select via employe" on public.signatures as PERMISSIVE for SELECT to public using ((employe_id IN ( SELECT employes.id FROM employes WHERE user_has_etablissement_access(employes.etablissement_id))));
create policy "signatures: update with access" on public.signatures as PERMISSIVE for UPDATE to public using ((employe_id IN ( SELECT employes.id FROM employes WHERE user_has_etablissement_access(employes.etablissement_id))));
create policy charges_detail_select on public.charges_detail as PERMISSIVE for SELECT to authenticated using (user_has_etablissement_access(etablissement_id));
create policy charges_mensuelles_select on public.charges_mensuelles as PERMISSIVE for SELECT to authenticated using (user_has_etablissement_access(etablissement_id));
create policy daily_sales_authenticated_all on public.daily_sales as PERMISSIVE for ALL to authenticated using (true) with check (true);
create policy objectifs_read on public.objectifs as PERMISSIVE for SELECT to public using (true);
create policy objectifs_write on public.objectifs as PERMISSIVE for ALL to public using (true);
create policy primes_delete on public.primes as PERMISSIVE for DELETE to public using (true);
create policy primes_insert on public.primes as PERMISSIVE for INSERT to public with check (true);
create policy primes_select on public.primes as PERMISSIVE for SELECT to public using (true);
create policy primes_update on public.primes as PERMISSIVE for UPDATE to public using (true);
create policy ventes_lignes_all on public.ventes_lignes as PERMISSIVE for ALL to public using (true) with check (true);

-- 4. Fonctions ajoutées (sans effet une fois les règles restaurées)
drop function if exists public.est_mon_employe(uuid);
drop function if exists public.etab_de_employe(uuid);
drop function if exists public.est_manager_etab(uuid);
drop function if exists public.est_admin();

commit;
