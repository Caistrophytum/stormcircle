
-- Extensions for scheduled HTTP-driven polling
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- =========================================================================
-- spc_outlook_state: single-row table holding the current SPC Day 1 outlook
-- =========================================================================
create table if not exists public.spc_outlook_state (
  id integer primary key default 1,
  issue text,
  groups jsonb,
  timing text,
  valid_window jsonb,
  last_run_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now(),
  constraint spc_outlook_state_singleton check (id = 1)
);
insert into public.spc_outlook_state (id) values (1) on conflict do nothing;

alter table public.spc_outlook_state enable row level security;
create policy "Anyone can read spc outlook"
  on public.spc_outlook_state for select using (true);
create policy "Service role can write spc outlook"
  on public.spc_outlook_state for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- =========================================================================
-- nhc_storms: one row per active tropical cyclone
-- =========================================================================
create table if not exists public.nhc_storms (
  storm_id text primary key,
  name text not null,
  basin text,
  classification text,
  classification_label text,
  intensity_kt integer,
  intensity_mph integer,
  pressure integer,
  lat numeric,
  lon numeric,
  lat_str text,
  lon_str text,
  movement_dir_compass text,
  movement_speed numeric,
  is_dangerous boolean default false,
  danger_level text,
  advisory_url text,
  discussion_url text,
  forecast_graphics_url text,
  last_update timestamptz,
  raw jsonb,
  updated_at timestamptz not null default now()
);

alter table public.nhc_storms enable row level security;
create policy "Anyone can read nhc storms"
  on public.nhc_storms for select using (true);
create policy "Service role can write nhc storms"
  on public.nhc_storms for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- =========================================================================
-- active_alerts: one row per current NWS alert
-- =========================================================================
create table if not exists public.active_alerts (
  alert_id text primary key,
  event text,
  severity text,
  certainty text,
  urgency text,
  headline text,
  area_desc text,
  sent timestamptz,
  effective timestamptz,
  onset timestamptz,
  expires_at timestamptz,
  ends timestamptz,
  status text,
  message_type text,
  geometry jsonb,
  properties jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists active_alerts_expires_idx on public.active_alerts (expires_at);
create index if not exists active_alerts_event_idx on public.active_alerts (event);

alter table public.active_alerts enable row level security;
create policy "Anyone can read active alerts"
  on public.active_alerts for select using (true);
create policy "Service role can write active alerts"
  on public.active_alerts for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- =========================================================================
-- enso_state: single-row table for the latest ENSO reading
-- =========================================================================
create table if not exists public.enso_state (
  id integer primary key default 1,
  source text,
  region text,
  oni numeric,
  phase text,
  lean text,
  season text,
  year text,
  last_run_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now(),
  constraint enso_state_singleton check (id = 1)
);
insert into public.enso_state (id) values (1) on conflict do nothing;

alter table public.enso_state enable row level security;
create policy "Anyone can read enso state"
  on public.enso_state for select using (true);
create policy "Service role can write enso state"
  on public.enso_state for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- =========================================================================
-- Realtime: publish all four tables so clients can subscribe
-- =========================================================================
alter publication supabase_realtime add table public.spc_outlook_state;
alter publication supabase_realtime add table public.nhc_storms;
alter publication supabase_realtime add table public.active_alerts;
alter publication supabase_realtime add table public.enso_state;
