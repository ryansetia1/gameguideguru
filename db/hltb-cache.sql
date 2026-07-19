-- HowLongToBeat playtime cache (near-static per-game data). One row per
-- normalized game title, 30-day TTL enforced in lib/hltb-cache.js. Mirrors
-- search_cache: shared public cache written by the server via the anon key.
-- `data` is nullable: a fresh row with data = null means "searched HLTB, no match".

create table if not exists public.hltb_cache (
  cache_key text primary key,
  data jsonb,
  fetched_at timestamptz not null default now()
);

alter table public.hltb_cache enable row level security;

create policy "hltb_cache read"
  on public.hltb_cache for select
  using (true);

create policy "hltb_cache insert"
  on public.hltb_cache for insert
  with check (true);

create policy "hltb_cache update"
  on public.hltb_cache for update
  using (true);
