# Preferred guide as RAG: "assistant given a book"

Build plan. Not built yet. Written 2026-07-19.

## The vision (narrow, on purpose)

When the player fills in a **preferred guide** URL, the app behaves like an
assistant handed one book: player asks, assistant looks in *that book*, finds the
relevant part, answers from it. Quote its steps, use its exact names. When the
answer genuinely isn't in the book, say so in one line, then fall back to its own
knowledge + web search.

When **no preferred guide** is set, keep today's behaviour untouched: model
answers from its own knowledge, cross-checked against tiered web search as backup.

Strictly **two-mode**. Empty preferred URL = current system. Filled = RAG over
that guide.

## Why RAG (decided)

- **Multi-guide is planned (days away).** Feeding whole books can't scale to N
  guides per turn (token blow-up, context overflow). RAG is the only architecture
  that serves many guides, so we build it now — but **validate on one guide first**
  before exposing multi-guide.
- **Cost over a long game.** Full-book feeding is linear in turns; a 300-turn
  playthrough on a big guide is ~$2–9 of input. RAG (retrieve a few chunks) is
  ~$0.55. See cost recap below.
- **The retrieval quality is the risk to de-risk.** Single-guide RAG *is*
  multi-guide RAG with the filter `WHERE guide_url = ?`. Chunking, ingest,
  retrieval, prompt — all identical. So one-guide first proves the hard part
  before we widen the filter.

## Decided stack

- **Embedder:** `nomic-embed-text` on Replicate (same provider/key as the LLM,
  8192-token context, 768-dim, beats OpenAI 3-small on MTEB long-context). NOT
  CLIP — CLIP's text encoder caps at 77 tokens (~20 effective) and is an
  image-caption model, useless for guide chunks.
  - Ingest-ergonomics alt (only if the Replicate model won't batch): OpenAI
    `text-embedding-3-small` batches up to 2048 inputs per call and is per-token
    cheap, at the cost of one new API key. Default stays nomic-on-Replicate.
- **Vector store:** Supabase **pgvector** (already have Supabase; no new infra).
- **Generation:** Gemini 2.5 Flash on Replicate (unchanged).

## The flow

Per question, when `preferredUrl` is set:

1. **Ensure ingested** (lazy, first-question, shared cache): if
   `guide_chunks` has no rows for this `guide_url`, ingest the page now (fetch →
   chunk → embed → insert). Keyed by URL, so it happens once *ever* per guide,
   shared across all users and chats. Show an "indexing your guide" state on that
   first question.
2. **Embed the question** (the rewritten standalone query from `resolveQuestion`,
   which we already compute) → one embed call.
3. **Retrieve** top-K chunks for this guide by cosine similarity
   (`WHERE guide_url = ? ORDER BY embedding <=> $q LIMIT K`).
4. **Route on similarity** (the elegant part):
   - **Top similarity ≥ `GUIDE_HIT`** → the book covers this. Feed the retrieved
     chunks as the PREFERRED GUIDE source, mark them, skip the tiered web search
     entirely (cheaper than today).
   - **Top similarity < `GUIDE_HIT`** → the book probably doesn't cover it (or the
     URL was a thin hub page). Fall back to the existing tiered web search +
     knowledge — today's exact path. Optionally still pass the best guide chunk so
     the model can use it if partially relevant.
5. **Generate** with the fidelity prompt (below).

When `preferredUrl` is empty: none of the above runs; the current tiered-search
path is unchanged.

`ponytail:` `GUIDE_HIT` is a single hand-tuned cosine threshold (start ~0.35 for
nomic, calibrate on a few real queries), not a learned router. Tune it in one
place. It doubles as the hub/thin-page guard.

## Data model

`db/guide-chunks.sql` (new), following the existing shared-cache pattern
(`search_cache`, `hltb_cache`):

```sql
create extension if not exists vector;

create table public.guide_chunks (
  id          bigint generated always as identity primary key,
  guide_url   text not null,           -- normalized; the retrieval filter key
  chunk_index int  not null,
  chunk_text  text not null,
  embedding   vector(768) not null,    -- nomic-embed-text dim
  created_at  timestamptz default now()
);
create index on public.guide_chunks (guide_url);
create index on public.guide_chunks
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);
```

- **Shared, not per-user.** Guide text is public web content the model already
  treats as untrusted, so same permissive RLS as `search_cache` (public
  select/insert). Ceiling is cache pollution, not a data leak; TTL-less is fine
  (guides change rarely). `ponytail:` re-ingest only if a guide is stale; add a
  content-hash column + refresh later if it matters.
- Multi-guide later: no schema change. Retrieval filter goes from
  `guide_url = $1` to `guide_url = any($1)`.

## Ingest

`lib/guide-ingest.ts` (new): fetch → chunk → embed → insert. Idempotent per URL
(check-then-insert; a unique index on `(guide_url, chunk_index)` guards double
ingest under a race — good enough; a proper lease is the upgrade path).

### Fetch

Reuse Tavily `extract` (already wired in `lib/tavily.ts`) to get `raw_content`,
then `cleanSnippet`. **Given page only** — do not follow child links. If the
extracted text is short or the URL `looksLikeHub(...)` (reuse the existing helper
in `lib/tavily.ts`), surface a UI hint: *"Paste the page with the actual full
walkthrough, not an index/hub page."* (copy per the brand voice).

### Chunking (structure-aware, fits the vision best)

A guide's natural "parts" are its sections (areas, chapters, bosses). Retrieval
should return whole parts, not arbitrary slices. So:

1. Split on the strongest boundary available: markdown headings (`#`, `##`), then
   GameFAQs-style section rules (lines of `===`/`---`, numbered `1.` section
   headers), then blank-line paragraphs.
2. Pack adjacent pieces into chunks of **~500 tokens** (never split mid-paragraph),
   with **~15% overlap** so a boss strategy straddling a boundary isn't halved.

This is a small pure function (`chunkGuide(text) -> string[]`) — one runnable
assert in `npm run check` (a doc with two headings yields ≥2 chunks; an
oversized section splits; chunks carry overlap). `ponytail:` recursive
boundary-split, not semantic segmentation; upgrade to semantic chunking only if
retrieval misses trace back to bad splits.

### Embed

Send chunks to `nomic-embed-text`. If the Replicate model takes one text per run,
embed with a **bounded concurrency pool** (~10–20 in flight) so a ~200-chunk book
ingests in ~20–40s rather than serially. It's one-time and shared, so a first-
question "indexing" spinner is acceptable. Prefer a batched embed endpoint if the
model exposes one (cuts ingest to a few calls).

## Prompt fidelity (carries over regardless of retrieval backend)

This is the part that fixes "answers drift from the guide", and it's identical
whether chunks come from RAG or (in the fallback) from web search.

`lib/prompt.js` `buildPrompt(...)`:

- Add `preferred?: boolean` to the source shape. When a source is preferred, label
  it `[PREFERRED GUIDE — the player chose this; treat it as the source of truth]`
  instead of `[Source N: host]`.
- When any preferred source is present, inject a directive:
  > The player chose a specific guide (marked PREFERRED GUIDE). For this game,
  > treat it as the primary source of truth: answer from it, follow its steps, use
  > its exact names. If the specific answer genuinely isn't in it, say so in one
  > line, then fall back to your own knowledge and the other sources.
- `SYSTEM_INSTRUCTION` stays knowledge-first (correct for no-guide mode); the
  per-turn directive overrides it only when a preferred source is present.
- Check: one assert that a preferred source produces the label + directive and a
  plain source does not.

## What gets deleted / changed

- **Delete** the preferred-URL cascade in `lib/tavily.ts` (`searchTavily` lines
  ~237–300: `extractPreferred` deep-link/site-search/hub logic) and the now-unused
  `EXTRACT_CONTENT_CAP` / `focusSection` preferred path. RAG replaces it. Net
  deletion. `focusSection` in `lib/clean.js` can stay only if still used elsewhere
  (grep first); otherwise delete it too.
- **Keep** the tiered search (`tieredSearch`/`selectSources`) — it's the fallback
  for both no-guide mode and the low-similarity route.
- `app/api/solve/route.ts`: branch on `preferredUrl` → RAG path vs current path.
  The `preferred` flag rides on the `sources` array into `summarize`/`buildPrompt`;
  no new params.

## Config / env

- Reuses `REPLICATE_API_TOKEN` (embedder + LLM same provider).
- New optional: `EMBED_MODEL` (default `nomic-embed-text` owner/name) so the model
  is swappable like `REPLICATE_MODEL`.
- pgvector requires the `vector` extension enabled in Supabase (one dashboard
  toggle / the migration's `create extension`).
- Degrade gracefully: if Supabase/pgvector is unset, the preferred-guide RAG path
  can't run — fall back to today's tiered search (log once). No hard dependency.

## Checks

- `chunkGuide` — one assert (`npm run check`).
- `buildPrompt` preferred labeling — one assert (`npm run check`).
- Retrieval SQL / ingest — smoke test manually against a real guide URL end to end
  (the `verify` skill covers driving the flow).

## Phasing

1. **Now:** single-guide RAG end to end (ingest, retrieve, similarity-route,
   fidelity prompt). Validate reliability on real guides.
2. **Multi-guide (days later):** widen the retrieval filter to several URLs + UI
   to attach more than one guide. No schema/ingest/prompt changes.

## Cost recap (Replicate; confirmed on the model pages)

- Gemini 2.5 Flash: **$0.30/1M input**, $2.50/1M output.
- `nomic-embed-text`: ~$0.0004/run.

Per guide (100k-token book, ~200 chunks): ingest ≈ **$0.08 once, shared**. Per
question: 1 query-embed (~$0.0004) + feeding ~K chunks (~3k tokens ≈ $0.001) to
Gemini. A 300-turn playthrough ≈ **~$0.55** vs ~$2–9 for full-book. And on the
high-similarity route we *skip the web search*, so many turns cost less than today.

## Known ceilings (`ponytail:`)

- `GUIDE_HIT` similarity threshold is hand-tuned, one constant.
- Chunking is recursive boundary-split, not semantic.
- Ingest has no single-flight lease (unique index guards dup rows; concurrent
  first-time ingests of the same URL can duplicate upstream embed work). Upgrade:
  a `claim_guide_lease` like the HLTB pattern.
- Retrieval is top-K cosine; an answer spread across many sections can still be
  partially missed. Overlap + a slightly higher K mitigate, not solve.
- Given page only; hub/multi-page guides rely on the user pasting the real page
  (guarded by a hint, not enforced).
