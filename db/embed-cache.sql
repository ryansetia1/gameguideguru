-- Query-embedding cache for preferred-guide RAG. Keyed by normalized rewritten
-- query text; 7-day TTL enforced in lib/embed-cache.ts. Mirrors search_cache.

create table if not exists public.embed_cache (
  cache_key text primary key,
  embedding vector(1024) not null,
  created_at timestamptz not null default now()
);

alter table public.embed_cache enable row level security;

create policy "embed_cache read"
  on public.embed_cache for select
  using (true);

create policy "embed_cache insert"
  on public.embed_cache for insert
  with check (true);

create policy "embed_cache update"
  on public.embed_cache for update
  using (true);
