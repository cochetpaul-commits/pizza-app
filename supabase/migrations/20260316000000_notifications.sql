-- Notifications in-app
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  type        text not null default 'info', -- 'info' | 'planning' | 'rh' | 'alerte' | 'message'
  titre       text not null,
  corps       text,
  lien        text,              -- optional deep-link path e.g. '/plannings'
  lu          boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists idx_notifications_user on public.notifications (user_id, lu, created_at desc);

alter table public.notifications enable row level security;

create policy "Users can read own notifications"
  on public.notifications for select
  using (auth.uid() = user_id);

create policy "Users can update own notifications"
  on public.notifications for update
  using (auth.uid() = user_id);

-- Admins/direction can insert notifications for anyone
create policy "Staff can insert notifications"
  on public.notifications for insert
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('admin', 'direction')
    )
  );

create policy "Users can delete own notifications"
  on public.notifications for delete
  using (auth.uid() = user_id);
