-- Sécurité des accès — partie 1 (suite) : colonnes confidentielles masquées aux comptes connectés.
-- Appliquée au moment du merge : le code précédent lisait ces tables avec select("*").
-- Les admins lisent ces champs par les fonctions employe_confidentiel() et contrats_admin().

-- Données personnelles : réservées aux admins (lues par la fonction employe_confidentiel)
do $$
declare
  confidentiel text[] := array[
    'numero_secu', 'iban', 'bic', 'titulaire_compte',
    'adresse', 'code_postal', 'ville',
    'date_naissance', 'lieu_naissance', 'departement_naissance', 'nationalite',
    'situation_familiale', 'nb_personnes_charge', 'handicap', 'type_handicap',
    'travailleur_etranger', 'autorisation_travail_type', 'autorisation_travail_numero', 'autorisation_travail_fin',
    'visite_renforcee', 'note', 'motif_sortie'];
  visibles text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into visibles
    from information_schema.columns
   where table_schema = 'public' and table_name = 'employes' and column_name <> all(confidentiel);
  execute 'revoke select on public.employes from anon, authenticated';
  execute format('grant select (%s) on public.employes to authenticated', visibles);
end $$;


do $$
declare visibles text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into visibles
    from information_schema.columns
   where table_schema = 'public' and table_name = 'contrats' and column_name <> 'remuneration';
  execute 'revoke select on public.contrats from anon, authenticated';
  execute format('grant select (%s) on public.contrats to authenticated', visibles);
end $$;

