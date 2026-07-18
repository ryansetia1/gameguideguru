# GameGuide Guru

## Purpose

Mobile-first, installable (PWA) Next.js prototype that answers a player's game
question. The model (Gemini 2.5 Flash on Replicate) answers from its own
knowledge; tiered web search provides supporting evidence. Supports IGDB-backed
game-name autocomplete, a fuzzy/acronym-aware platform selector, multi-turn
follow-up chat, an optional preferred-guide source, and optional Supabase
accounts that save per-game chats. The UI is English; the model still answers in
the player's input language. No login wall: signed-out users keep full access
and simply cannot save.

## Architecture

- `app/page.tsx`: English client chat UI (game field, platform, optional
  preferred-guide link, message feed, docked composer) and `/api/solve` consumer.
  Keeps `messages` state and sends the last 10 messages (5 turns) as `history`
  plus `preferredUrl`. Also owns Supabase auth state, the "Your games" menu
  (list/resume/new), per-turn chat persistence, a dismissable examples strip
  (remembered in `localStorage`), and auto-scroll (smooth on new turns, instant
  jump when opening a saved game).
- `app/auth-panel.tsx`: themed sign-in/sign-up modal (email+password and Google
  OAuth via `getSupabase().auth`). Surfaces the "check your email" state when the
  project has email confirmation enabled.
- `lib/supabase.ts`: `getSupabase()` singleton browser client from the
  `NEXT_PUBLIC_SUPABASE_*` vars; returns `null` when unset so the app degrades to
  anonymous-only. Exports the `Chat` row type.
- `app/platform-select.tsx`: custom themed, searchable, keyboard-accessible
  platform combobox. Delegates filtering to `lib/platforms.js`.
- `lib/platforms.js`: owns the `PLATFORMS` list and `matchPlatforms(query)`, a
  normalized-substring + acronym/alias matcher (n64, nds, psx, ps1, ps2, gba,
  xsx, ...). Covered by `npm run check`.
- `app/game-autocomplete.tsx`: debounced game-name autocomplete for the game
  field; queries `/api/games`, reuses the `.combo` styling, allows free text, and
  hides itself when the DB is unavailable (`available: false`).
- `app/api/games/route.ts`: IGDB proxy. Fetches a Twitch app access token
  (cached in-memory), runs an Apicalypse `search` query, and returns
  `{ games, available }`. Missing creds or any failure => `available: false` so
  the field degrades to free text. `lib/games.js#mapGames` shapes IGDB rows.
- `app/api/solve/route.ts`: validates/sanitizes `{ game, platform, question,
  history, preferredUrl }` at the trust boundary (history capped to 10, content
  truncated, `preferredUrl` must be http/https). For follow-ups (history present)
  it calls `resolveQuestion` to rewrite the query into a standalone form before
  searching; first questions skip that call. Wraps the search in a cache
  (`lib/search-cache.ts`) keyed by `searchQuery + preferredUrl`. Search is
  best-effort (skipped if no `TAVILY_API_KEY`, failures swallowed); the model
  still answers. Only `REPLICATE_API_TOKEN` is mandatory.
- `lib/tavily.ts`: `searchGuides(query, preferredUrl?)`. With no `preferredUrl`
  it runs the normal tiered search (GameFAQs -> trusted walkthrough providers ->
  forums -> general). With one it cascades: (1) `/extract` the exact page (trusted,
  so no confidence gate; content capped at `EXTRACT_CONTENT_CAP`), else (2) search
  only that page's domain, else (3) fall back to the tiers. Steps 1-2 return
  sources solely from the preferred site. All paths use `search_depth: "advanced"`,
  exclude video/social domains, dedupe by URL+title, clean via `cleanSnippet`, and
  gate/trim via `selectSources`.
- `lib/search-cache.ts`: best-effort Supabase-backed cache of `searchGuides`
  output (`getCachedSearch`/`setCachedSearch`, 7-day TTL). Uses a server client
  built from the `NEXT_PUBLIC_SUPABASE_*` vars (no session); no-ops when unset or
  on any error so answers never depend on it.
- `lib/rank.js`: `selectSources(results)` applies a confidence gate (returns
  `[]` when even the best score is below `CONFIDENCE_MIN`, so the model answers
  from knowledge alone), keeps results within `SCORE_WINDOW` of the top score,
  and caps at 3. Covered by `npm run check`.
- `lib/clean.js`: `cleanSnippet(text)` strips markdown link soup, bare URLs,
  GameFAQs CTAs, and Q&A vote/user lines. Covered by `npm run check`.
- `lib/replicate.ts`: Replicate adapter. `summarize(input)` sends
  `system_instruction` + `prompt` separately with Gemini fields
  (`max_output_tokens`, `thinking_budget: 0`). `resolveQuestion({ question,
  history })` does a small, low-token call to rewrite a follow-up into a
  standalone English search query, falling back to the raw question on any
  failure. Exports the `Turn` type.
- `lib/prompt.js`: exports `SYSTEM_INSTRUCTION` (persona + rules: knowledge-first,
  web-as-support, injection safety), `buildPrompt({ game, platform, question,
  sources, history })`, plus `REWRITE_INSTRUCTION` + `buildRewritePrompt({
  question, history })` for query rewriting. Covered by `npm run check`.
- `lib/games.js`: `mapGames(results)` maps raw IGDB rows to `{ id, name, year }`
  (year derived from unix `first_release_date`), dropping malformed entries.
  Covered by `npm run check`.
- PWA: `app/manifest.ts` (standalone manifest), `lib/icon.tsx#renderIcon` (shared
  "G on signal-green" mark via `next/og` `ImageResponse`), used by `app/icon.tsx`
  (favicon), `app/apple-icon.tsx` (apple-touch), and `app/app-icon/route.tsx`
  (parametric manifest icons: `/app-icon?size=192[&maskable=1]`). `public/sw.js`
  is a minimal network-first service worker registered by `app/sw-register.tsx`.
- Persistence model: one `public.chats` row per saved game (`game`, `platform`,
  `preferred_guide_url`, `messages` jsonb), RLS-scoped to `auth.uid()`; the client
  upserts the whole `messages` array each turn. `public.search_cache` is a shared
  public cache table (see Known limits).

## Known limits (ponytail)

- Model-call input fields are Gemini-specific; switching `REPLICATE_MODEL` to a
  non-Gemini model would silently drop `system_instruction`/`thinking_budget`.
- Chat history is sent as plain text inside the prompt and trimmed by turn count,
  not token count.
- Searches are cached in `public.search_cache` (7-day TTL) keyed by rewritten
  query + preferred URL, so repeat/popular queries skip Tavily. Follow-ups still
  pay the `resolveQuestion` rewrite call (needed to build the key) even on a hit.
  Without Supabase env vars the cache no-ops and every turn re-runs the tiered
  search (up to 4 sequential `advanced` Tavily calls, ~2x credits vs `basic`).
- `search_cache` has permissive RLS (public select/insert/update via the anon
  key) so the server can write without a service-role secret. It only holds
  non-sensitive public web results the model already treats as untrusted, and the
  TTL self-heals; the ceiling is cache pollution, not a data leak. Upgrade path:
  move writes behind the service-role key or a `security definer` RPC.
- Preferred-guide step 1 feeds the model the whole extracted page (capped at
  `EXTRACT_CONTENT_CAP`), not the section that answers the question; it trusts the
  user's choice and skips the confidence gate.
- Follow-ups add one extra Gemini call (`resolveQuestion`) before search, so
  they run two sequential model calls. `max_output_tokens` there must stay
  generous (~200); too tight a cap returns empty even with thinking off.
- Flash on Replicate consumes ~1k tokens of reasoning overhead against
  `max_output_tokens` even with `thinking_budget: 0`, so `summarize` uses 4096
  to avoid truncated answers (1200 cut answers off after ~100 visible tokens).
- Relevance filtering can't separate same-series wrong-game guides (RE0 vs RE
  Code: Veronica score alike); the top-3 trim plus the "ignore off-game
  snippets" system rule mitigate it rather than fully solving it.
- The `CONFIDENCE_MIN`/`SCORE_WINDOW` thresholds in `lib/rank.js` are heuristics
  calibrated on a handful of real queries, not a learned cutoff; tune them there
  if answers cite too much or fall back to knowledge too often.
- Tavily still returns arbitrary page chunks (control lists, TOCs), not the
  section that answers the question; the model leans on its own knowledge.
- Game autocomplete uses IGDB (RAWG was tried first but proved unreliable). The
  Twitch token cache is per server instance, not shared across instances.

## Commands

```bash
npm run dev
npm run check
npm run build
```

## Environment

Server-only secrets (never expose via `NEXT_PUBLIC_`, never commit `.env.local`):

- `REPLICATE_API_TOKEN` (required to answer).
- `TAVILY_API_KEY` (optional; enables supporting web search).
- `REPLICATE_MODEL` (optional, default `google/gemini-2.5-flash`).
- `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` (optional; enable IGDB game-name
  autocomplete).

Public client vars (safe to expose; protected by RLS), optional — enable
accounts, saved chats, and the search cache:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable key).
  Project `GameGuideGuru` (ref `luoymycbpnvamdtlzjem`). Google OAuth and email
  confirmation are configured in the Supabase dashboard.

## Working conventions

- Keep model/search provider calls server-side; Supabase auth/DB reads are
  client-side under RLS (the anon key is public by design).
- Validate browser input and all external API data.
- Keep the UI accessible; the only runtime dependency is `@supabase/supabase-js`.
- No login wall: signed-out users must keep full access.
- Preserve source links alongside every generated guide.
- Update this file when architecture, providers, commands, or environment
  requirements change significantly.
