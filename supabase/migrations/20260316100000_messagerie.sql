-- Messagerie interne (conversations + messages)
create table if not exists public.conversations (
  id              uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete cascade,
  titre           text,
  type            text not null default 'group', -- 'group' | 'direct'
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now()
);

create table if not exists public.conversation_members (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  last_read_at    timestamptz not null default now(),
  unique (conversation_id, user_id)
);

create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id         uuid not null references auth.users(id),
  contenu         text not null,
  created_at      timestamptz not null default now()
);

create index if not exists idx_messages_conv on public.messages (conversation_id, created_at desc);
create index if not exists idx_conv_members on public.conversation_members (user_id, conversation_id);

-- RLS
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

-- Conversations: members can see
create policy "Members can read conversations"
  on public.conversations for select
  using (
    exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = id and cm.user_id = auth.uid()
    )
  );

-- Staff can create conversations
create policy "Staff can create conversations"
  on public.conversations for insert
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('admin', 'direction')
    )
  );

-- Members: own membership readable
create policy "Users can read own memberships"
  on public.conversation_members for select
  using (user_id = auth.uid());

create policy "Users can update own membership"
  on public.conversation_members for update
  using (user_id = auth.uid());

-- Staff can manage members
create policy "Staff can manage members"
  on public.conversation_members for all
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('admin', 'direction')
    )
  );

-- Messages: members can read, authenticated can insert
create policy "Members can read messages"
  on public.messages for select
  using (
    exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = messages.conversation_id and cm.user_id = auth.uid()
    )
  );

create policy "Members can send messages"
  on public.messages for insert
  with check (
    auth.uid() = user_id and
    exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = messages.conversation_id and cm.user_id = auth.uid()
    )
  );
