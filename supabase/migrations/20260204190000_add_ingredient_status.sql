alter table public.ingredients
add column if not exists status text not null default 'to_check';

alter table public.ingredients
add column if not exists status_note text;

alter table public.ingredients
add column if not exists validated_at timestamptz;

alter table public.ingredients
add column if not exists validated_by uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ingredients_status_check'
  ) then
    alter table public.ingredients
    add constraint ingredients_status_check
    check (status in ('to_check','validated','unknown'));
  end if;
end $$;

create index if not exists idx_ingredients_status on public.ingredients(status);
