-- Commandes Maël — étape 1 : données et modèle.
-- Uniquement des AJOUTS : aucune table, colonne, contrainte ni donnée existante n'est supprimée ou modifiée.
-- Les données produit (colisage, rayons, précommande) sont remplies à part (Claude Cowork),
-- seule la liste des rayons (configuration) est insérée ici.

-- ── Rayons de commande (ordre d'affichage dans l'écran de commande) ─────────
create table if not exists public.rayons_commande (
  code    text primary key,
  libelle text not null,
  ordre   integer not null unique
);

insert into public.rayons_commande (code, libelle, ordre) values
  ('cremerie',         'Crèmerie, fromages, œufs',          1),
  ('charcuterie',      'Charcuterie',                       2),
  ('fruits_legumes',   'Fruits, légumes, herbes',           3),
  ('base_pizza',       'Base pizza',                        4),
  ('epicerie_cuisine', 'Épicerie cuisine',                  5),
  ('epicerie_sucree',  'Épicerie sucrée, pâtisserie',       6),
  ('maree_surgeles',   'Marée, surgelés',                   7),
  ('hygiene',          'Hygiène, entretien, emballages',    8)
on conflict (code) do nothing;

alter table public.rayons_commande enable row level security;
drop policy if exists rayons_commande_lecture on public.rayons_commande;
create policy rayons_commande_lecture on public.rayons_commande
  for select to authenticated using (true);

-- Rayon porté par le produit (réutilisable si le produit est acheté ailleurs)
alter table public.ingredients
  add column if not exists rayon_commande text references public.rayons_commande(code);
create index if not exists idx_ingredients_rayon_commande on public.ingredients (rayon_commande);

-- ── Écran de commande simplifié, activé fournisseur par fournisseur ─────────
-- (les deux fiches Maël d'abord ; les autres fournisseurs gardent l'écran actuel)
alter table public.suppliers
  add column if not exists commande_simplifiee boolean not null default false;

-- ── Colisage : une seule source de vérité par fiche fournisseur × produit ───
-- Indépendant des lignes supplier_offers, qui sont recréées à chaque changement de prix.
-- Exemples :
--   crème 35 %          : colis,  contenu_nb 12, element bouteille, 1 l,  commande_element_permise = true
--   stracciatella       : colis,  contenu_nb 2,  element bac,       1 kg
--   San Marzano         : carton, contenu_nb 6,  element boite
--   œufs                : plateau, contenu_nb 30, element piece
--   fior di latte 3 kg  : piece,  contenu_nb 1,  element piece,     3 kg
create table if not exists public.commande_articles (
  id                        uuid primary key default gen_random_uuid(),
  supplier_id               uuid not null references public.suppliers(id) on delete cascade,
  ingredient_id             uuid not null references public.ingredients(id) on delete cascade,
  -- Ce qu'on commande (1 = une unité de commande)
  unite_commande            text not null check (unite_commande in (
                              'piece','colis','carton','seau','pochette','barquette','bouteille',
                              'sachet','boite','bac','pot','plateau','kg','litre')),
  -- Ce qu'elle contient : contenu_nb éléments de type « element », chacun de element_qte element_unite
  contenu_nb                numeric not null default 1 check (contenu_nb > 0),
  element                   text check (element in (
                              'piece','colis','carton','seau','pochette','barquette','bouteille',
                              'sachet','boite','bac','pot','plateau')),
  element_qte               numeric check (element_qte > 0),
  element_unite             text check (element_unite in ('pc','g','kg','ml','l')),
  -- Commande possible à l'élément (ex. crème au litre au lieu du colis de 12)
  commande_element_permise  boolean not null default false,
  -- Produit de la précommande du mercredi : exclu de la commande de tous les jours
  precommande               boolean not null default false,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  updated_by                uuid references public.profiles(id),
  constraint commande_articles_fournisseur_produit unique (supplier_id, ingredient_id),
  constraint commande_articles_element_taille check ((element_qte is null) = (element_unite is null))
);
create index if not exists idx_commande_articles_ingredient on public.commande_articles (ingredient_id);

alter table public.commande_articles enable row level security;
drop policy if exists commande_articles_authenticated_all on public.commande_articles;
create policy commande_articles_authenticated_all on public.commande_articles
  for all to authenticated using (true) with check (true);

-- ── Qui a ajouté quoi : une quantité par personne et par ligne de commande ─
-- commande_lignes.quantite reste le TOTAL, recalculé ci-dessous à chaque apport.
-- Les lignes existantes (sans apport) ne sont jamais touchées.
create table if not exists public.commande_ligne_apports (
  id          uuid primary key default gen_random_uuid(),
  ligne_id    uuid not null references public.commande_lignes(id) on delete cascade,
  user_id     uuid not null references public.profiles(id),
  quantite    numeric not null check (quantite >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint commande_ligne_apports_personne unique (ligne_id, user_id)
);
create index if not exists idx_commande_ligne_apports_user on public.commande_ligne_apports (user_id);

alter table public.commande_ligne_apports enable row level security;
drop policy if exists commande_ligne_apports_authenticated_all on public.commande_ligne_apports;
create policy commande_ligne_apports_authenticated_all on public.commande_ligne_apports
  for all to authenticated using (true) with check (true);

create or replace function public.commande_ligne_apports_total()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_ligne uuid := coalesce(new.ligne_id, old.ligne_id);
  v_total numeric;
begin
  select coalesce(sum(quantite), 0) into v_total
    from public.commande_ligne_apports where ligne_id = v_ligne;
  update public.commande_lignes
     set quantite = v_total,
         total_ligne_ht = case when prix_unitaire_ht is null then null else prix_unitaire_ht * v_total end
   where id = v_ligne;
  return null;
end;
$$;

drop trigger if exists trg_commande_ligne_apports_total on public.commande_ligne_apports;
create trigger trg_commande_ligne_apports_total
  after insert or update or delete on public.commande_ligne_apports
  for each row execute function public.commande_ligne_apports_total();
