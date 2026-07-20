-- Trace Events Log for granular backend process tracking.
-- Run once in the Supabase SQL editor. Inserts use the anon key from the server;
-- SELECTs are restricted to service-role (for the Admin Dashboard).

create table if not exists public.trace_events (
  id uuid primary key default gen_random_uuid(),
  trace_id text not null,
  created_at timestamptz not null default now(),
  event_type text not null, -- e.g., 'tavily_search', 'replicate_generation', 'db_check'
  message text not null,
  latency_ms integer,
  metadata jsonb
);

create index if not exists trace_events_trace_id_idx on public.trace_events (trace_id);
create index if not exists trace_events_created_at_idx on public.trace_events (created_at desc);

alter table public.trace_events enable row level security;

drop policy if exists "trace_events_insert_anon" on public.trace_events;
create policy "trace_events_insert_anon"
  on public.trace_events
  for insert
  to anon, authenticated
  with check (true);

-- Only the specified admin email can read the trace events
drop policy if exists "trace_events_select_admin" on public.trace_events;
create policy "trace_events_select_admin"
  on public.trace_events
  for select
  to authenticated
  using (
    auth.jwt() ->> 'email' = 'ryansetiawan.works@gmail.com'
  );

-- Enable Supabase Realtime for this table
alter publication supabase_realtime add table public.trace_events;
