alter table public.ingredients
add column if not exists supplier_sku text;

create unique index if not exists ingredients_supplier_id_supplier_sku_uidx
on public.ingredients (supplier_id, supplier_sku)
where supplier_sku is not null;
