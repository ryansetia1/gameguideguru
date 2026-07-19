-- Solve Journey Log for end-to-end pipeline telemetry.
-- Run once in the Supabase SQL editor. Inserts use the anon key from the server.

create table if not exists public.solve_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users (id) on delete set null,
  game text,
  platform text,
  question text not null,
  preferred_urls jsonb,
  pipeline_type text check (pipeline_type in ('rag', 'web', 'fallback_web', 'knowledge_only')),
  rewrite_latency_ms integer,
  retrieval_latency_ms integer,
  generation_latency_ms integer,
  total_latency_ms integer,
  status text not null check (status in ('success', 'error')),
  error_message text,
  answer text,
  sources jsonb
);

create index if not exists solve_logs_created_at_idx on public.solve_logs (created_at desc);
create index if not exists solve_logs_pipeline_type_idx on public.solve_logs (pipeline_type);
create index if not exists solve_logs_status_idx on public.solve_logs (status);

alter table public.solve_logs enable row level security;

drop policy if exists "solve_logs_insert_anon" on public.solve_logs;
create policy "solve_logs_insert_anon"
  on public.solve_logs
  for insert
  to anon, authenticated
  with check (true);
