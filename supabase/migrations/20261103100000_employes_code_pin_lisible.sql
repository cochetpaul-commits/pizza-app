-- Code tablette lisible par la direction (03/11/2026, Paul) : pour rappeler son code à un employé qui l'a perdu.
-- Colonne réservée au serveur : aucun droit de lecture pour le navigateur ; l'API /api/tablette/code la rend
-- aux responsables seulement. Le haché (code_pin_hash) reste la référence pour l'identification.
alter table public.employes add column if not exists code_pin text;
revoke select (code_pin) on public.employes from authenticated, anon;
