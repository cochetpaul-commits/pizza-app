do $$
begin
  if not exists (select 1 from pg_type where typname = 'ingredient_status') then
    create type ingredient_status as enum ('to_check', 'validated', 'unknown');
  end if;
end
$$;

alter table public.ingredients
  add column if not exists status ingredient_status;

alter table public.ingredients
  add column if not exists status_note text;

update public.ingredients
set status = 'to_check'
where status is null;

alter table public.ingredients
  alter column status set default 'to_check';

alter table public.ingredients
  alter column status set not null;

create index if not exists idx_ingredients_status on public.ingredients(status);
