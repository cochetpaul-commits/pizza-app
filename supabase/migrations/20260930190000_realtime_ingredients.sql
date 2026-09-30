-- Fiches produits en temps réel : la feuille d'inventaire (et demain la commande) se met à jour
-- quand une fiche change (catégorie, sous-catégorie, rayon, conditionnement, nom), y compris depuis un autre poste.
-- Les changements passent par la RLS de la table : chacun ne reçoit que ce qu'il peut lire.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'ingredients') then
    alter publication supabase_realtime add table public.ingredients;
  end if;
end $$;
