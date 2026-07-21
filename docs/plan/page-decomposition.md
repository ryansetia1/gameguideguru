# `app/page.tsx` decomposition plan

**Status:** Phase 4 complete (optional hooks landed)  
**Depends on:** [chat-persistence-refactor.md](./chat-persistence-refactor.md) Phase 3 (complete)

## Problem

`app/page.tsx` was ~4800 lines and owned auth, Steam, sidebar, library overlays, chat
state, game setup, guide ingest UI, composer, and message rendering.

## Goal

Split by **vertical slice** without changing behaviour.

## Modules

| Module | Responsibility | Status |
|--------|----------------|--------|
| `lib/chat-messages.js` | `coerceMessages`, variant snapshot/poll | Done |
| `lib/chat-thread.js` + `lib/chat-thread-persist.js` | Normalized load/save | Done |
| `lib/chat-message-ui.js` | Source labels, highlight grouping | Done |
| `lib/guide-card-ui.js` | Bundle prefs, `buildBundlePrefsBody`, `guideUrlNeedsIngest`, guide row state | Done |
| `app/chat/types.ts` | Shared `Message` type | Done |
| `app/chat/answer-body.tsx` | Markdown answer rendering | Done |
| `app/chat/message-list.tsx` | User/assistant bubbles, variant nav | Done |
| `app/chat/composer-shell.tsx` | Composer + extras wiring | Done |
| `app/chat/use-chat-turn.tsx` | `runTurn`, persist, edit/retry, variant nav | Done |
| `app/chat/use-guide-bundle.tsx` | Guide bundle state, ingest effects, panel handlers | Done |
| `app/chat/use-home-session.tsx` | Auth, Steam OpenID return, connect/sign-out | Done |
| `app/chat/cover-thumb.tsx` | Cover thumb + `displayPlatform` | Done |
| `app/chat/guide-status-chip.tsx` | Guide index status chip | Done |
| `app/chat/spoiler-toggle.tsx` | Per-game spoiler toggle | Done |
| `app/chat/hero-marketing.tsx` | Home hero headline + rotating role | Done |
| `app/chat/games-sidebar.tsx` | Sidebar + saved library + Steam library overlay | Done |
| `app/chat/active-game-card.tsx` | In-chat game card, guide stacks, bundle panels | Done |
| `app/chat/home-setup.tsx` | Hero, Jump back in carousel, setup form | Done |
| `app/page.tsx` | Layout orchestration, chat list, overlays, composer wiring | **~1788 lines** |

## Rules

1. **No behaviour change per PR.** Extract + wire; `npm run build` passes.
2. **Hooks stay in client components.**
3. Run `npm run build` after each extraction.

## Exit criteria

- `page.tsx` under 3000 lines — **met** (~1788)
- Chat bugs fixed in `lib/chat-*` without scrolling a monolith
- No circular imports

## Future (only if needed)

- Extract `loadChats` / session hydration into `use-chat-session.tsx`
- Extract overlay history (`pushOverlayHistory` / `dismissOverlay`) into a tiny hook
