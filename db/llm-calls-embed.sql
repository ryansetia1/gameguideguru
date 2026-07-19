-- Extend llm_calls for embedding audit (guide ingest + per-turn RAG query).
-- Run once in the Supabase SQL editor after db/llm-calls.sql.

alter table public.llm_calls drop constraint if exists llm_calls_kind_check;

alter table public.llm_calls
  add constraint llm_calls_kind_check
  check (kind in ('rewrite', 'summarize', 'censor', 'embed_index', 'embed_query'));
