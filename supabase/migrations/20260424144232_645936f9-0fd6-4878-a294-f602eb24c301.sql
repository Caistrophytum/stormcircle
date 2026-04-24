-- Enable pg_cron extension for scheduled cleanup
create extension if not exists pg_cron with schema extensions;

-- Messages table for public chat
create table public.messages (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  username text not null,
  badge text not null default 'Citizen',
  content text not null,
  created_at timestamp with time zone default timezone('utc', now())
);

-- Row Level Security
alter table public.messages enable row level security;

create policy "Anyone can read messages"
  on public.messages for select using (true);

create policy "Logged in users can insert"
  on public.messages for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own messages"
  on public.messages for delete using (auth.uid() = user_id);

-- Index for chronological queries and cleanup
create index messages_created_at_idx on public.messages (created_at);

-- Schedule auto-delete of messages older than 2 hours, runs every 5 minutes
select cron.schedule(
  'delete-old-messages',
  '*/5 * * * *',
  $$
    delete from public.messages
    where created_at < now() - interval '2 hours';
  $$
);