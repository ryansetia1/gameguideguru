-- Multi preferred-guide URLs per saved chat + widen chunk retrieval to many guides.
-- Run once in the Supabase SQL editor after guide-chunks.sql.

alter table public.chats
  add column if not exists preferred_guide_urls text[] not null default '{}';

update public.chats
set preferred_guide_urls = array[preferred_guide_url]
where coalesce(preferred_guide_url, '') <> ''
  and coalesce(cardinality(preferred_guide_urls), 0) = 0;

-- Multi-guide cosine retrieval (replaces the single-URL overload).
drop function if exists public.match_guide_chunks(text, vector, int);

create or replace function public.match_guide_chunks(
  p_guide_urls text[],
  p_embedding vector(1024),
  p_limit int default 5
)
returns table (
  guide_url text,
  chunk_text text,
  similarity float
)
language sql stable
as $$
  select
    guide_url,
    chunk_text,
    1 - (embedding <=> p_embedding) as similarity
  from public.guide_chunks
  where guide_url = any(p_guide_urls)
  order by embedding <=> p_embedding
  limit p_limit;
$$;

grant execute on function public.match_guide_chunks(text[], vector, int)
  to anon, authenticated, service_role;
