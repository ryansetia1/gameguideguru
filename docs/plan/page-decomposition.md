# `app/page.tsx` decomposition plan

**Status:** Draft  
**Depends on:** [chat-persistence-refactor.md](./chat-persistence-refactor.md) Phase 1 (optional but recommended)

## Problem

`app/page.tsx` is ~4800 lines and owns:

- Auth, Steam, sidebar, library overlays
- Chat state, `runTurn`, `persistChat`, variant navigation
- Game setup, cover upload, guide ingest UI
- Composer, message rendering, spoilers, examples

Every chat persistence fix touches this file. That is a merge-conflict and regression
magnet for daily-driver use.

## Goal

Split by **vertical slice** without changing behaviour. Persistence moves first;
UI shells follow.

## Target modules

| Module | Responsibility |
|--------|----------------|
| `lib/chat-messages.js` | Done | `coerceMessages`, `snapshotAssistantVariants`, `pollRecoveredMessages` |
| `lib/chat-thread.ts` | After Phase 1 single-writer decision | Supabase load/save |
| `lib/chat-session.ts` | Already exists: draft/sessionStorage sync |
| `app/chat/use-chat-turn.ts` | `runTurn`, abort, background poll, regen |
| `app/chat/message-list.tsx` | Render user/assistant bubbles, variant nav |
| `app/chat/composer-shell.tsx` | Composer + extras wiring |
| `app/page.tsx` | Layout orchestration only (~800–1200 lines) |

## Rules

1. **No behaviour change per PR.** Extract + re-export; same tests pass.
2. **Hooks stay in client components.** Do not extract hooks into `.ts` files.
3. **One extraction per PR** where possible (messages → thread → runTurn → list).
4. Run `npm run build` after each extraction.

## Order

1. `lib/chat-messages.js` — done (Phase 0); `check.mjs` coverage
2. `lib/chat-thread.ts` — after Phase 1 single-writer decision
3. `use-chat-turn.ts` — largest risk; do last before UI splits

## Exit criteria

- `page.tsx` under 3000 lines
- Chat bugs fixed in `lib/chat-*` without scrolling a monolith
- No new circular imports (`page.tsx` → chat modules → `page.tsx`)
