-- Conditionnement de commande : LA FICHE PRODUIT FAIT FOI.
--
-- Vécu 30/09 : la tuile « Commande chez … » (commande_articles édités à part) doublonnait le
-- paramétrage de la fiche (Unité cmd, Qté, type de pièce, poids / volume d'une pièce) et le faussait.
-- Désormais : les champs de commande vivent sur la fiche (order_unit_label, order_quantity,
-- order_element, order_element_permis, piece_weight_g / piece_volume_ml) et commande_articles
-- (unite_commande, contenu_nb, element, element_qte, element_unite, commande_element_permise)
-- en est DÉRIVÉ par trigger pour tous les fournisseurs du produit. Seul `precommande` reste
-- propre au fournisseur. Les lignes des brouillons en cours suivent les nouveaux libellés.

-- 1. Une seule liste d'unités (fiche et commande) ────────────────────────────────────────
alter table public.commande_articles drop constraint if exists commande_articles_unite_commande_check;
alter table public.commande_articles add constraint commande_articles_unite_commande_check check (unite_commande = any (array[
  'piece','colis','carton','seau','pochette','barquette','bouteille','sachet','paquet','boite','bac','pot','plateau',
  'filet','botte','fut','bidon','bloc','brick','cagette','meule','pack','poche','sac','kg','litre']));
alter table public.commande_articles drop constraint if exists commande_articles_element_check;
alter table public.commande_articles add constraint commande_articles_element_check check (element = any (array[
  'piece','colis','carton','seau','pochette','barquette','bouteille','sachet','paquet','boite','bac','pot','plateau',
  'filet','botte','fut','bidon','bloc','brick','cagette','meule','pack','poche','sac']));

-- 2. Champs de commande sur la fiche ───────────────────────────────────────────────────────
alter table public.ingredients add column if not exists order_element text;
alter table public.ingredients add column if not exists order_element_permis boolean not null default false;
comment on column public.ingredients.order_unit_label is 'Unité de commande (code : colis, carton, paquet, kg, litre…) ; la commande en est dérivée (commande_articles)';
comment on column public.ingredients.order_quantity is 'Nombre d''éléments par unité de commande (1 si au poids ou à la pièce)';
comment on column public.ingredients.order_element is 'Élément contenu dans l''unité de commande quand elle en contient plusieurs (bouteille, pot, filet…) ; vide = type de pièce du prix';
comment on column public.ingredients.order_element_permis is 'Commande possible à l''élément (ex. à la bouteille au lieu du carton)';

-- 3. Fonctions de libellé (miroir de src/lib/commandeArticles.ts) ──────────────────────────
create or replace function public.cmd_unite_code(p text)
returns text language sql immutable set search_path = public as $$
  with n as (select lower(trim(translate(coalesce(p, ''), 'àâäéèêëîïôöùûüç', 'aaaeeeeiioouuuc'))) u),
  l as (select array['colis','carton','seau','pochette','barquette','bouteille','sachet','paquet','bac','pot','plateau',
                     'filet','botte','bidon','bloc','brick','cagette','meule','pack','poche','sac'] liste)
  select case
    when n.u in ('piece','pieces','pc','pcs') then 'piece'
    when n.u in ('l','litre','litres') then 'litre'
    when n.u in ('kg','kilo','kilos') then 'kg'
    when n.u in ('boite','boites') then 'boite'
    when n.u in ('fut','futs') then 'fut'
    when n.u = any (l.liste) then n.u
    when rtrim(n.u, 's') = any (l.liste) then rtrim(n.u, 's')
    else null end
  from n, l
$$;

create or replace function public.cmd_nom_unite(u text, n numeric default 1)
returns text language sql immutable as $$
  select case u
    when 'piece' then case when n > 1 then 'pièces' else 'pièce' end
    when 'colis' then 'colis'
    when 'boite' then case when n > 1 then 'boîtes' else 'boîte' end
    when 'fut' then case when n > 1 then 'fûts' else 'fût' end
    when 'seau' then case when n > 1 then 'seaux' else 'seau' end
    when 'plateau' then case when n > 1 then 'plateaux' else 'plateau' end
    when 'kg' then 'kg'
    else case when n > 1 then u || 's' else u end end
$$;

create or replace function public.cmd_nombre(n numeric)
returns text language sql immutable as $$
  select replace(trim(trailing '.' from trim(trailing '0' from round(n, 3)::text)), '.', ',')
$$;

create or replace function public.cmd_taille(q numeric, u text)
returns text language sql immutable set search_path = public as $$
  select public.cmd_nombre(q) || ' ' || case u when 'l' then 'L' when 'ml' then 'mL' else u end
$$;

create or replace function public.cmd_libelle_colisage(uc text, contenu numeric, element text, qte numeric, unite_t text)
returns text language plpgsql immutable set search_path = public as $$
declare unite text := public.cmd_nom_unite(uc, 1); t text;
begin
  if uc in ('kg', 'litre') then return unite; end if;
  t := case when qte is not null and unite_t is not null then public.cmd_taille(qte, unite_t) end;
  if contenu <= 1 then return case when t is not null then unite || ' ' || t else unite end; end if;
  if t is not null and element is not null and element <> 'piece' then
    return unite || ' de ' || public.cmd_nombre(contenu) || ' ' || public.cmd_nom_unite(element, contenu) || ' ' || t; end if;
  if t is not null then return unite || ' ' || public.cmd_nombre(contenu) || ' × ' || t; end if;
  if element is not null and element <> 'piece' then return unite || ' de ' || public.cmd_nombre(contenu) || ' ' || public.cmd_nom_unite(element, contenu); end if;
  return unite || ' de ' || public.cmd_nombre(contenu);
end $$;

create or replace function public.cmd_libelle_element(permise boolean, element text, qte numeric, unite_t text)
returns text language sql immutable set search_path = public as $$
  select case when not permise or element is null then null
    when qte is not null and unite_t is not null then public.cmd_nom_unite(element, 1) || ' ' || public.cmd_taille(qte, unite_t)
    else public.cmd_nom_unite(element, 1) end
$$;

-- 4. Dérivation fiche → conditionnement de commande ────────────────────────────────────────
create or replace function public.cmd_conditionnement_fiche(i public.ingredients)
returns table (unite_commande text, contenu_nb numeric, element text, element_qte numeric, element_unite text, commande_element_permise boolean)
language plpgsql stable set search_path = public as $$
declare u text := public.cmd_unite_code(i.order_unit_label); c numeric; e text; q numeric; ut text; pt text;
begin
  if u is null then return; end if;                       -- unité non reconnue : article inchangé
  if u in ('kg', 'litre') then
    return query select u, 1::numeric, null::text, null::numeric, null::text, false; return;
  end if;
  c := case when u = 'piece' then 1 else coalesce(nullif(i.order_quantity, 0), 1) end;
  if c < 0 then c := 1; end if;
  pt := public.cmd_unite_code(i.purchase_unit_label);
  e := case when c > 1 then coalesce(public.cmd_unite_code(i.order_element), case when pt not in ('kg', 'litre', 'piece') then pt end, 'piece') else null end;
  if e in ('kg', 'litre') then e := 'piece'; end if;
  if i.piece_weight_g > 0 then
    if i.piece_weight_g >= 1000 then q := i.piece_weight_g / 1000; ut := 'kg'; else q := i.piece_weight_g; ut := 'g'; end if;
  elsif i.piece_volume_ml > 0 then
    if i.piece_volume_ml >= 1000 then q := i.piece_volume_ml / 1000; ut := 'l'; else q := i.piece_volume_ml; ut := 'ml'; end if;
  end if;
  return query select u, c, e, q, ut, (coalesce(i.order_element_permis, false) and e is not null and c > 1);
end $$;

-- Applique la fiche à tous ses articles de commande ; les brouillons en cours suivent les libellés.
create or replace function public.cmd_synchroniser_articles(p_ingredient uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare i public.ingredients; d record; a record; l record; n int := 0;
  ancien_uc text; ancien_el text; nouveau_uc text; nouveau_el text; premier text; cible text;
begin
  select * into i from ingredients where id = p_ingredient;
  if not found then return 0; end if;
  select * into d from public.cmd_conditionnement_fiche(i);
  if not found or d.unite_commande is null then return 0; end if;
  for a in select * from commande_articles where ingredient_id = p_ingredient loop
    if a.unite_commande = d.unite_commande and a.contenu_nb = d.contenu_nb and a.element is not distinct from d.element
       and a.element_qte is not distinct from d.element_qte and a.element_unite is not distinct from d.element_unite
       and a.commande_element_permise = d.commande_element_permise then continue; end if;
    ancien_uc := public.cmd_libelle_colisage(a.unite_commande, a.contenu_nb, a.element, a.element_qte, a.element_unite);
    ancien_el := public.cmd_libelle_element(a.commande_element_permise, a.element, a.element_qte, a.element_unite);
    nouveau_uc := public.cmd_libelle_colisage(d.unite_commande, d.contenu_nb, d.element, d.element_qte, d.element_unite);
    nouveau_el := public.cmd_libelle_element(d.commande_element_permise, d.element, d.element_qte, d.element_unite);
    update commande_articles set unite_commande = d.unite_commande, contenu_nb = d.contenu_nb, element = d.element,
      element_qte = d.element_qte, element_unite = d.element_unite, commande_element_permise = d.commande_element_permise, updated_at = now()
    where id = a.id;
    n := n + 1;
    -- Brouillons en cours de ce fournisseur : libellé de chaque ligne recalculé (colis ou élément)
    for l in select cl.id, cl.unite from commande_lignes cl join commande_sessions s on s.id = cl.session_id
             where s.supplier_id = a.supplier_id and s.status = 'brouillon' and cl.ingredient_id = p_ingredient loop
      premier := split_part(lower(trim(translate(coalesce(l.unite, ''), 'àâäéèêëîïôöùûüç', 'aaaeeeeiioouuuc'))), ' ', 1);
      if l.unite is null or ancien_el is null
         or premier = lower(translate(public.cmd_nom_unite(a.unite_commande, 1), 'àâäéèêëîïôöùûüç', 'aaaeeeeiioouuuc'))
         or premier = a.unite_commande then cible := nouveau_uc; else cible := nouveau_el; end if;
      if cible is not null and cible <> l.unite then update commande_lignes set unite = cible where id = l.id; end if;
    end loop;
  end loop;
  return n;
end $$;
revoke execute on function public.cmd_synchroniser_articles(uuid) from anon;

create or replace function public.ingredients_cmd_sync_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.order_unit_label is not distinct from old.order_unit_label
     and new.order_quantity is not distinct from old.order_quantity and new.order_element is not distinct from old.order_element
     and new.order_element_permis is not distinct from old.order_element_permis and new.purchase_unit_label is not distinct from old.purchase_unit_label
     and new.piece_weight_g is not distinct from old.piece_weight_g and new.piece_volume_ml is not distinct from old.piece_volume_ml then return null; end if;
  perform public.cmd_synchroniser_articles(new.id);
  return null;
end $$;
drop trigger if exists trg_ingredients_cmd_sync on public.ingredients;
create trigger trg_ingredients_cmd_sync
  after update of order_unit_label, order_quantity, order_element, order_element_permis, purchase_unit_label, piece_weight_g, piece_volume_ml
  on public.ingredients for each row execute function public.ingredients_cmd_sync_trigger();

-- Nouvelle offre chez un fournisseur en commande simplifiée : l'article de commande est créé depuis la fiche
create or replace function public.supplier_offers_cmd_article_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
declare i public.ingredients; d record;
begin
  if not coalesce(new.is_active, false) then return null; end if;
  if not exists (select 1 from suppliers s where s.id = new.supplier_id and coalesce(s.commande_simplifiee, false)) then return null; end if;
  if exists (select 1 from commande_articles where supplier_id = new.supplier_id and ingredient_id = new.ingredient_id) then return null; end if;
  select * into i from ingredients where id = new.ingredient_id;
  select * into d from public.cmd_conditionnement_fiche(i);
  if not found or d.unite_commande is null then
    insert into commande_articles (supplier_id, ingredient_id, unite_commande, contenu_nb) values (new.supplier_id, new.ingredient_id, 'piece', 1);
  else
    insert into commande_articles (supplier_id, ingredient_id, unite_commande, contenu_nb, element, element_qte, element_unite, commande_element_permise)
    values (new.supplier_id, new.ingredient_id, d.unite_commande, d.contenu_nb, d.element, d.element_qte, d.element_unite, d.commande_element_permise);
  end if;
  return null;
end $$;
drop trigger if exists trg_supplier_offers_cmd_article on public.supplier_offers;
create trigger trg_supplier_offers_cmd_article
  after insert on public.supplier_offers for each row execute function public.supplier_offers_cmd_article_trigger();

-- 5. Reprise : la fiche reçoit ce que l'écran de commande affichait (article du fournisseur de la
--    fiche, sinon le dernier corrigé), puis les articles sont redérivés de la fiche.
alter table public.ingredients disable trigger trg_ingredients_cmd_sync;
with choix as (
  select distinct on (ca.ingredient_id) ca.*
  from commande_articles ca join ingredients i on i.id = ca.ingredient_id
  order by ca.ingredient_id, (ca.contenu_nb > 1) desc, (ca.supplier_id = i.supplier_id) desc, ca.updated_at desc
), permis as (
  select ingredient_id, bool_or(commande_element_permise) p from commande_articles group by 1
)
update ingredients i set
  order_unit_label = c.unite_commande,
  order_quantity = case when c.unite_commande in ('kg', 'litre', 'piece') then i.order_quantity else c.contenu_nb end,
  order_element = case when c.contenu_nb > 1 then c.element end,
  order_element_permis = coalesce(p.p, false),
  piece_weight_g = case when i.piece_weight_g is null and c.element_unite in ('g', 'kg') then c.element_qte * case when c.element_unite = 'kg' then 1000 else 1 end else i.piece_weight_g end,
  piece_volume_ml = case when i.piece_volume_ml is null and c.element_unite in ('ml', 'l') then c.element_qte * case when c.element_unite = 'l' then 1000 else 1 end else i.piece_volume_ml end
from choix c left join permis p on p.ingredient_id = c.ingredient_id
where i.id = c.ingredient_id;
-- Produits dont les deux fiches Carniato (Bello / Piccola) se commandaient différemment (carton ou bouteille) : commande à l'élément permise
update ingredients i set order_element_permis = true
where i.id in (select ingredient_id from commande_articles group by 1 having count(distinct (unite_commande, contenu_nb, coalesce(element, ''))) > 1)
  and i.order_element is not null;
alter table public.ingredients enable trigger trg_ingredients_cmd_sync;

select count(*) filter (where public.cmd_synchroniser_articles(id) > 0) as produits_resynchronises
from ingredients where id in (select ingredient_id from commande_articles);
