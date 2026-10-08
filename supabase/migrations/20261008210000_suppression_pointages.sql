-- Suppression du pointage (08/10/2026) : la page et son code sont retirés. En production, la table
-- pointages créée par 20260318000000_stabilisation.sql n'existe pas (jamais appliquée ou déjà
-- supprimée) et aucun réglage de pointeuse n'est stocké (etablissement_params). Cette migration
-- garantit l'état cible sur toute base où la table existerait encore.
drop policy if exists "Authenticated users can read pointages" on public.pointages;
drop policy if exists "Admins can manage pointages" on public.pointages;
drop index if exists public.idx_pointages_etab_date;
drop table if exists public.pointages;
