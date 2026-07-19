-- Ingest Log for guide indexing telemetry.
-- Run once in the Supabase SQL editor. Inserts use the anon key from the server.

create table if not exists public.ingest_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users (id) on delete set null,
  game text,
  platform text,
  url text not null,
  latency_ms integer,
  status text not null check (status in ('success', 'error')),
  pages_indexed integer,
  pages_missing integer,
  hub_warning boolean,
  error_message text
);

create index if not exists ingest_logs_created_at_idx on public.ingest_logs (created_at desc);
create index if not exists ingest_logs_status_idx on public.ingest_logs (status);
create index if not exists ingest_logs_url_idx on public.ingest_logs (url);

alter table public.ingest_logs enable row level security;

drop policy if exists "ingest_logs_insert_anon" on public.ingest_logs;
create policy "ingest_logs_insert_anon"
  on public.ingest_logs
  for insert
  to anon, authenticated
  with check (true);
