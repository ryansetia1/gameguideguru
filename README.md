# GameGuide Guru

A mobile-first, installable (PWA) game companion. An AI model on Replicate
(default `google/gemini-2.5-flash`) answers from its own knowledge, and Tavily
web search provides supporting evidence. The interface is English, but the model
answers in whatever language you ask your question in.

## Features

- Game-name field with autocomplete from the IGDB game database, and a
  fuzzy, acronym-aware platform selector (a searchable custom combobox: type
  `n64`, `nds`, `psx`, `ps1`, `ps2`, `gba`, `xsx`, ... and it resolves the
  right console). Covers NES through Switch 2, PS5, Xbox Series, PC, and more.
- Optional **preferred guide link**: paste the guide you trust and search sources
  from it first. The cascade is: (1) pull that exact page, else (2) search only
  that page's domain, else (3) fall back to the normal tiered search. When a
  preferred source works, the Sources list shows only that site.
- **Accounts (optional, no login wall)**: sign in with email/password or Google
  (via Supabase) to save a separate chat per game and resume it later. Signed-out
  visitors keep full access; they just cannot save.
- Multi-turn follow-up chat: up to the last 5 exchanges are sent as context, so
  follow-ups like "and after that boss?" are understood.
- Tiered search: GameFAQs first, then trusted walkthrough providers, then forums,
  then the open web. Video/social domains (YouTube, Twitch, etc.) are excluded
  because the text model cannot read them.
- Noise filtering: Tavily `advanced` extraction, relevance-score filtering
  (drops unrelated same-series games), snippet cleaning, dedupe by title+URL, and
  only the 3 strongest sources are sent to the model.
- Confidence gate: if nothing is clearly relevant, sources are dropped and the
  model answers from its own knowledge (or says it is unsure) rather than being
  nudged by a half-relevant snippet.
- Shared web-search cache (Supabase, 7-day TTL): repeat/popular queries skip the
  Tavily calls entirely to save credits and latency.
- Collapsible, sourced answers; a dismissable examples strip (remembered per
  browser); and auto-scroll to the newest reply.

## Running the app

Requirements: Node.js 20.9 or newer.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Fill `.env.local` with real credentials:

```dotenv
TAVILY_API_KEY=tvly-...
REPLICATE_API_TOKEN=r8_...
REPLICATE_MODEL=google/gemini-2.5-flash
TWITCH_CLIENT_ID=...
TWITCH_CLIENT_SECRET=...
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
```

Only `REPLICATE_API_TOKEN` is required. `TAVILY_API_KEY` (web search),
`REPLICATE_MODEL`, the Twitch pair (IGDB autocomplete), and the Supabase pair
(accounts + cache) are all optional; each feature degrades gracefully when its
variables are absent.

The model input fields (`system_instruction`, `max_output_tokens`,
`thinking_budget`) are tuned for Gemini on Replicate; only swap `REPLICATE_MODEL`
for a model with equivalent fields.

### Game-name autocomplete (IGDB)

Autocomplete uses [IGDB](https://api-docs.igdb.com/), authenticated via Twitch
OAuth. Create an app at
[dev.twitch.tv/console/apps](https://dev.twitch.tv/console/apps) for
`TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET`. Without them the game field still
works as free text (autocomplete silently turns off).

### Accounts and saved chats (Supabase)

Accounts, per-game saved chats, and the shared search cache use
[Supabase](https://supabase.com). The schema (a `chats` table with row-level
security and a public `search_cache` table) is managed as a migration on the
`GameGuideGuru` project. Set `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY` (the publishable key) to enable it — both are
safe to expose because access is protected by row-level security.

Two manual dashboard steps in Supabase:

- **Google sign-in**: enable the Google provider under Authentication ->
  Providers, add your Google OAuth client ID/secret, and add your app origin(s)
  to the allowed redirect URLs.
- **Email sign-in**: for a frictionless flow, disable "Confirm email" under
  Authentication -> Providers -> Email. If left on, new sign-ups see a
  "check your email to confirm" message before they can sign in.

Open [http://localhost:3000](http://localhost:3000), enter a game and platform,
then ask your question and follow up.

## Flow

1. The browser sends `{ game, platform, question, history, preferredUrl }` to
   `POST /api/solve`.
2. For follow-ups, the route rewrites the question into a standalone English
   query (via the LLM) so conversation context ("point 3") is carried; first
   questions are used as-is.
3. It checks the Supabase search cache; on a miss it runs the search (preferred
   cascade or normal tiers), cleans snippets, filters by relevance score, keeps
   the 3 strongest sources, and caches the result.
4. `system_instruction` (persona + rules) and `prompt` (game/platform, history,
   web evidence) are sent separately to the Gemini model on Replicate.
5. The browser renders the answer and its sources, and (when signed in) saves the
   whole chat to Supabase so it can be resumed later.

Provider secrets stay on the server and are never sent to the browser. Source
text and game/platform input are treated as untrusted; the model is instructed
not to follow instructions embedded in them.

## Commands

- `npm run dev` — development server
- `npm run build` — production build
- `npm start` — run the production build
- `npm run check` — small self-check for the prompt builder, snippet cleaner,
  source selection, IGDB mapping, and platform matching
