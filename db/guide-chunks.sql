-- Preferred-guide RAG chunks (shared public cache). One row per text chunk per
-- guide URL. Written by the server via the anon key (same pattern as
-- search_cache / hltb_cache). Apply after enabling the `vector` extension in
-- the Supabase dashboard (Database -> Extensions -> vector).

create extension if not exists vector;

create table if not exists public.guide_chunks (
  id          bigint generated always as identity primary key,
  guide_url   text not null,
  chunk_index int  not null,
  chunk_text  text not null,
  embedding   vector(1024) not null,
  created_at  timestamptz not null default now()
);

create index if not exists guide_chunks_guide_url_idx
  on public.guide_chunks (guide_url);

create unique index if not exists guide_chunks_url_chunk_idx
  on public.guide_chunks (guide_url, chunk_index);

create index if not exists guide_chunks_embedding_idx
  on public.guide_chunks
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

alter table public.guide_chunks enable row level security;

create policy "guide_chunks read"
  on public.guide_chunks for select
  using (true);

create policy "guide_chunks insert"
  on public.guide_chunks for insert
  with check (true);

-- Cosine similarity retrieval for a single guide URL.
create or replace function public.match_guide_chunks(
  p_guide_url text,
  p_embedding vector(1024),
  p_limit int default 5
)
returns table (
  chunk_text text,
  similarity float
)
language sql stable
as $$
  select
    chunk_text,
    1 - (embedding <=> p_embedding) as similarity
  from public.guide_chunks
  where guide_url = p_guide_url
  order by embedding <=> p_embedding
  limit p_limit;
$$;

grant execute on function public.match_guide_chunks(text, vector, int)
  to anon, authenticated, service_role;
