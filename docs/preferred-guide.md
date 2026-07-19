# Preferred guide: "assistant given a book"

Plan doc. Not built yet. Written 2026-07-19.

## The vision (narrow, on purpose)

When the player fills in a **preferred guide** URL, the app should behave like an
assistant handed one book: player asks a question, the assistant looks in *that
book*, finds the relevant part, and answers from it. Quote its steps, use its
names. Only when the answer genuinely isn't in the book does it say so and fall
back to its own knowledge + web search.

When **no preferred guide** is set, keep today's behaviour untouched: the model
answers from its own knowledge, cross-checked against tiered web search as a
backup source of truth.

So this is strictly a **two-mode** feature. Empty preferred URL = current system.
Filled preferred URL = "assistant + book".

## The two symptoms we're fixing

The retrieval side (fetching the preferred page) is already solid. The felt pain
comes from two places, both on the *generation* side:

1. **Answer drifts from the guide.** Even when the preferred page reaches the
   model, it's flattened into an anonymous `[Source 1: hostname]`
   ([lib/prompt.js](../lib/prompt.js)), and the system prompt explicitly says
   *"Answer primarily from your own game knowledge... treat web research as
   SUPPORTING evidence"* ([lib/prompt.js](../lib/prompt.js) line ~10). So the
   model is told to prefer its own knowledge and treat your chosen book as a
   bystander. That's the opposite of the vision.

2. **Right book, wrong section.** `focusSection`
   ([lib/clean.js](../lib/clean.js)) trims the extracted page to a 9000-char
   window by naive keyword density (`EXTRACT_CONTENT_CAP`). It throws away the
   book and hands the model one keyword-guessed page. Wrong guesses = wrong
   section.

## Cost facts (settled — this is why the fix is simple)

Gemini 2.5 Flash on Replicate (confirmed on Replicate's own model page):

- **Input: $0.30 / 1M tokens** (~3.3M tokens per $1)
- **Output: $2.50 / 1M tokens**

Feeding the whole book each turn (~4 chars/token):

| Guide size | ~tokens | input cost/turn |
|---|---|---|
| Small (~20k char) | 5k | $0.0015 |
| Medium (~100k char) | 25k | $0.0075 |
| Big FF mega-FAQ (~400k char) | 100k | $0.03 |

A 20-question session on a big guide ≈ **$0.70**. Feeding the full book is cheap
*per session*.

**But cost is linear in turn count.** A long game is hundreds of turns, and each
turn re-feeds the whole book from scratch:

| Approach | tokens/turn | 300 turns | input cost |
|---|---|---|---|
| Full-book, medium guide (100k char) | 25k | 7.5M | $2.25 |
| Full-book, big FF FAQ (400k char) | 100k | 30M | $9.00 |
| Embeddings/RAG (5 chunks) | ~6k | 1.8M | ~$0.55 |

So over a full playthrough RAG is ~4–16x cheaper on input, and embedding the book
itself is negligible (~$0.002 once). $9/playthrough is fine for a few prototype
users; times 1000 players it's real money. This is a **scale** concern, not a
prototype one.

**Multi-guide kills full-book outright.** If the player supplies 3–5 guides,
full-book has to feed *all* of them every turn (3–5x tokens, may overflow the
context window). RAG is the natural fit: all chunks from all guides in one table,
retrieve the most relevant across books. A planned multi-guide feature effectively
*forces* RAG — it arrives with that feature, not before.

**The honest trade-off (not just cost):**

| | Full-book | Embeddings/RAG |
|---|---|---|
| Section accuracy | Best (model sees the whole book, can't "miss" a section) | Retrieval-miss risk (top-N can skip the answer) |
| Cost over hundreds of turns | Bloats | Cheap |
| Multi-guide | Doesn't work | Native |
| Build complexity | Trivial | Real (embed provider, pgvector, chunking, ingest) |

**Sequencing conclusion.** Langkah #1 is **not** wasted work either way: its real
value is the generation-side fidelity fix (label + directive), which is
backend-agnostic and carries over to RAG **unchanged**. The only full-book-specific
piece is one constant (the cap). So:

- **Multi-guide imminent (weeks/months)** → build RAG now, skip the full-book cap
  change; do the fidelity fix as part of it.
- **Multi-guide "someday, maybe"** → ship langkah #1 (full-book, single guide) to
  validate the UX cheaply, and let the multi-guide feature be the trigger that
  brings RAG later (swap retrieval, keep the prompt work).

## The plan (langkah #1 — do this)

Small, localized changes. No new files, no new dependencies. The flag "this
source IS the player's chosen guide" travels from the fetch layer to the prompt.

### 1. Mark the preferred source

- `lib/tavily.ts`: add optional `preferred?: boolean` to `SearchResult`.
- `extractPreferred(...)` returns `preferred: true` on its result. This function
  is only ever called on the preferred-guide path, so both preferred sub-paths
  (deep-link extract + site-search-then-extract) inherit the flag for free.
- The tiered/Serper fallback results stay `preferred` undefined.

### 2. Stop over-trimming in preferred mode

`extractPreferred` is exclusive to the preferred path, so its cap is purely the
"how much of the book do we hand the model" knob.

- Raise `EXTRACT_CONTENT_CAP` from `9000` to something generous, e.g.
  **`180_000` chars (~45k tokens, ~$0.015/turn input)**. `focusSection` returns
  the whole text when it's under the cap, so almost every single-page guide now
  passes through **whole** and the model does the locating. `focusSection` only
  kicks in for the rare monster guide, as a last-resort keyword narrower.
- `ponytail:` leave the `focusSection` keyword scan as the >cap fallback. Don't
  replace it with embeddings unless a real guide blows the cap.

### 3. Label + instruct in the prompt

`lib/prompt.js` `buildPrompt(...)`:

- When a source has `preferred: true`, label it distinctly, e.g.
  `[PREFERRED GUIDE — the player chose this; treat it as the source of truth]`
  instead of `[Source N: hostname]`.
- Add a directive block (only when a preferred source is present) roughly:

  > The player chose a specific guide (marked PREFERRED GUIDE). For this game,
  > treat it as the primary source of truth: answer from it, follow its steps,
  > and use its exact names. If the specific answer genuinely isn't in it, say so
  > in one line, then fall back to your own knowledge and the other sources.

- The static `SYSTEM_INSTRUCTION` stays knowledge-first (correct for no-guide
  mode). The per-turn directive overrides it *only* when a preferred source is
  present — local and reversible, no branching of the system prompt.

### 4. Plumbing

`preferred` rides inside the `SearchResult` objects already threaded
`searchGuides → route.ts → summarize → buildPrompt`. No new parameters on
`summarize`/`solve` — the flag is just a field on the sources array. Confirm the
`Source` typedef in [lib/prompt.js](../lib/prompt.js) is widened to read it.

### 5. Check

`lib/prompt.js` is covered by `npm run check`. Add one assertion: a `buildPrompt`
call with a `preferred: true` source contains the PREFERRED GUIDE label + the
directive, and a call with only plain sources does not. One assert, no framework.

### What this deliberately does NOT do

- No position tracking / "you were at chapter X" state. Rejected: an assistant
  with a book doesn't need your bookmark; you ask, it looks. Adds state, no gain.
- No provider migration. Replicate input is already $0.30/1M.
- No embeddings. See appendix.

## Appendix — embeddings/RAG (break-glass only)

Build this when **multi-guide** lands, or sooner if hundreds-of-turns cost on a
big single guide starts to hurt at your user scale (see the cost table above — it
becomes materially cheaper than full-book over a long playthrough). It's also the
only option that supports searching across *many* guides at once. Not needed for a
single-guide prototype validating the UX.

### What it is

An embedding turns a chunk of text into a vector (a list of numbers) that
represents its *meaning*. Similar meaning = nearby vectors. So you can retrieve
"closest in meaning to the question" instead of "most keyword overlap" — the
semantic upgrade over `focusSection`.

### The RAG flow, for a single guide

1. **Ingest (once per guide):** fetch the guide text → split into chunks
   (~500–1000 words, small overlap so sections don't get cut mid-thought) →
   send each chunk to an embedding API → store `{chunk_text, embedding}` in a DB.
2. **Query (per question):** embed the player's question → find the N nearest
   chunk vectors (cosine similarity) → hand those N chunks to Gemini as context
   → answer.

### What you'd set up (in this stack)

- **Embedding provider:** a new API + key (Gemini has an embeddings endpoint, or
  OpenAI `text-embedding-3-small`). One adapter file.
- **Vector storage:** Supabase already ships **pgvector** — no separate vector
  DB. One table `guide_chunks(url text, chunk_text text, embedding vector)` with
  an ivfflat/hnsw index. Query via a `security definer` RPC or the client SDK.
- **Chunking logic:** the fiddly part. Bad splits = answers missing context.
- **Ingest trigger:** run the embed pipeline once when the player picks a guide,
  cache by URL, re-embed only if the guide changes. Embed in the background so the
  first question doesn't wait on it.

### Pros

- Reads guides bigger than the context window.
- Cheaper input per turn at scale (send a few chunks, not the whole book).
- Foundation for future multi-guide search.
- Meaning-based localization, more robust than keyword density.

### Cons / hidden cost

- Real complexity jump: new provider, ingest pipeline, pgvector table + index,
  re-embed handling, chunking edge cases. A new surface area of bugs.
- Chunking is an art; bad chunking is the usual reason RAG comes out *worse*.
- First-question latency while ingest runs (mitigate with background embed).
- Still fallible: top-N can miss an answer spread across many sections. Not magic.

### Verdict

Given the cost facts above, embeddings is the "correct CS answer" that this app
doesn't need yet. Ship langkah #1, run it for a few weeks, and only reach for
this if a real guide actually overflows the context window.
