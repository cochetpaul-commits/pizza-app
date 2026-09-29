-- Inventaire « feuille » : nom tel qu'imprimé, fournisseur et rattachement du fichier ;
-- un même produit peut figurer deux fois dans une zone (deux factures) : plus d'unicité produit × zone.
alter table public.inventaire_lignes
  add column if not exists nom_feuille text,
  add column if not exists fournisseur_feuille text,
  add column if not exists rattachement text;
drop index if exists public.idx_inventaire_lignes_upsert;
create index if not exists idx_inventaire_lignes_produit_zone on public.inventaire_lignes (inventaire_id, ingredient_id, zone);
