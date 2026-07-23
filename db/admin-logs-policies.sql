-- Admin read access for journey logs (Activity dashboard).
-- Run once in the Supabase SQL editor after solve-logs.sql / ingest-logs.sql / llm-calls.sql.

alter table public.solve_logs add column if not exists player_name text;
alter table public.solve_logs add column if not exists trace_id text;
alter table public.ingest_logs add column if not exists player_name text;
alter table public.ingest_logs add column if not exists trace_id text;
alter table public.llm_calls add column if not exists trace_id text;

create index if not exists solve_logs_trace_id_idx on public.solve_logs (trace_id);
create index if not exists solve_logs_created_at_idx on public.solve_logs (created_at desc);
create index if not exists ingest_logs_trace_id_idx on public.ingest_logs (trace_id);
create index if not exists llm_calls_trace_id_idx on public.llm_calls (trace_id);

drop policy if exists "solve_logs_select_admin" on public.solve_logs;
create policy "solve_logs_select_admin"
  on public.solve_logs
  for select
  to authenticated
  using (auth.jwt() ->> 'email' = 'ryansetiawan.works@gmail.com');

drop policy if exists "ingest_logs_select_admin" on public.ingest_logs;
create policy "ingest_logs_select_admin"
  on public.ingest_logs
  for select
  to authenticated
  using (auth.jwt() ->> 'email' = 'ryansetiawan.works@gmail.com');

drop policy if exists "llm_calls_select_admin" on public.llm_calls;
create policy "llm_calls_select_admin"
  on public.llm_calls
  for select
  to authenticated
  using (auth.jwt() ->> 'email' = 'ryansetiawan.works@gmail.com');

-- Realtime for Activity dashboard (ignore errors if already added).
do $$ begin
  alter publication supabase_realtime add table public.solve_logs;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.ingest_logs;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.llm_calls;
exception when duplicate_object then null;
end $$;
