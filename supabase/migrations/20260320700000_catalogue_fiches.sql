-- Catalogue fiches techniques (PDF exportés pour consultation équipe)
create table if not exists catalogue_fiches (
  id uuid primary key default gen_random_uuid(),
  recipe_type text not null check (recipe_type in ('pizza','cuisine','cocktail','empatement')),
  recipe_id uuid not null,
  name text not null,
  category text, -- sous-catégorie cuisine (preparation, plat_cuisine, etc.)
  photo_url text,
  pdf_url text not null,
  exported_at timestamptz not null default now(),
  exported_by uuid references auth.users(id),
  unique (recipe_type, recipe_id)
);

-- RLS
alter table catalogue_fiches enable row level security;

-- Tout le monde peut lire
create policy "catalogue_read" on catalogue_fiches for select using (true);

-- Seuls les authentifiés peuvent insérer/modifier
create policy "catalogue_write" on catalogue_fiches for insert with check (auth.uid() is not null);
create policy "catalogue_update" on catalogue_fiches for update using (auth.uid() is not null);
create policy "catalogue_delete" on catalogue_fiches for delete using (auth.uid() is not null);
