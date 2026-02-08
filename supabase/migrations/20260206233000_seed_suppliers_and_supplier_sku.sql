do $$
begin
  if not exists (select 1 from public.suppliers where lower(name)=lower('METRO')) then
    insert into public.suppliers (name, is_active) values ('METRO', true);
  end if;

  if not exists (select 1 from public.suppliers where lower(name)=lower('MAEL')) then
    insert into public.suppliers (name, is_active) values ('MAEL', true);
  end if;
end
$$;

alter table public.ingredients
  add column if not exists supplier_sku text;

alter table public.ingredients
  add column if not exists supplier_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ingredients_supplier_id_fkey'
  ) then
    alter table public.ingredients
      add constraint ingredients_supplier_id_fkey
      foreign key (supplier_id) references public.suppliers(id) on delete set null;
  end if;
end
$$;
