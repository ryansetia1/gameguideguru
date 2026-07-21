# `app/page.tsx` decomposition plan

**Status:** In progress (Phase 4 — major UI slices extracted)  
**Depends on:** [chat-persistence-refactor.md](./chat-persistence-refactor.md) Phase 3 (complete)

## Problem

`app/page.tsx` was ~4800 lines and owned auth, Steam, sidebar, library overlays, chat
state, game setup, guide ingest UI, composer, and message rendering. Every chat fix
touched this file.

## Goal

Split by **vertical slice** without changing behaviour.

## Target modules

| Module | Responsibility | Status |
|--------|----------------|--------|
| `lib/chat-messages.js` | `coerceMessages`, variant snapshot/poll | Done |
| `lib/chat-thread.js` + `lib/chat-thread-persist.js` | Normalized load/save | Done |
| `lib/chat-message-ui.js` | Source labels, highlight grouping | Done |
| `lib/guide-card-ui.js` | Bundle prefs merge, guide row state, panel loading | Done |
| `app/chat/types.ts` | Shared `Message` type | Done |
| `app/chat/answer-body.tsx` | Markdown answer rendering | Done |
| `app/chat/message-list.tsx` | User/assistant bubbles, variant nav | Done |
| `app/chat/composer-shell.tsx` | Composer + extras wiring | Done |
| `app/chat/use-chat-turn.tsx` | `runTurn`, persist, edit/retry, variant nav | Done |
| `app/chat/cover-thumb.tsx` | Cover thumb + `displayPlatform` | Done |
| `app/chat/guide-status-chip.tsx` | Guide index status chip | Done |
| `app/chat/spoiler-toggle.tsx` | Per-game spoiler toggle | Done |
| `app/chat/hero-marketing.tsx` | Home hero headline + rotating role | Done |
| `app/chat/games-sidebar.tsx` | Sidebar + saved library + Steam library overlay | Done |
| `app/chat/active-game-card.tsx` | In-chat game card, guide stacks, bundle panels | Done |
| `app/chat/home-setup.tsx` | Hero, Jump back in carousel, setup form | Done |
| `app/page.tsx` | Layout orchestration, auth/Steam, bundle ingest effects | ~2484 lines |

## Rules

1. **No behaviour change per PR.** Extract + wire; `npm run build` passes.
2. **Hooks stay in client components.** Do not extract hooks into `.ts` files.
3. **One extraction per PR** where possible.
4. Run `npm run build` after each extraction.

## Order

1. `lib/chat-messages.js` — done
2. `lib/chat-thread` + persist — done (Phase 2–3)
3. `message-list.tsx` + `composer-shell.tsx` + `use-chat-turn.tsx` — done
4. Game card + guide ingest UI, sidebar/library, setup/hero — done

## Remaining (optional)

- Extract auth/Steam/session effects into `use-home-session.tsx` or similar
- Extract bundle ingest effects (`bundlePanelLoad`, `guideIndexState`) into a hook
- Deduplicate `buildBundlePrefsBody` / `mergedBundlePrefs` between `page.tsx` and `use-chat-turn.tsx`

## Exit criteria

- `page.tsx` under 3000 lines — **met** (~2484 after game card / sidebar / setup splits)
- Chat bugs fixed in `lib/chat-*` without scrolling a monolith
- No new circular imports (`page.tsx` → chat modules → `page.tsx`)
