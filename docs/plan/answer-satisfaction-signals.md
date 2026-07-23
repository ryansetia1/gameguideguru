# Answer satisfaction signals (retry & feedback)

**Status:** Future experiment backlog — not implemented  
**Audience:** Future agents planning answer-quality or player-memory work  
**Last updated:** 2026-07-24  
**Related:** [user-memory.md](./user-memory.md), `app/chat/use-chat-turn.tsx`, `app/api/solve/route.ts`, `lib/prompt.js`

## Purpose

Capture product and engineering intent for using **regenerate / retry** (and later
explicit feedback) as signals that an answer was not good enough. The goal is better
answers without guessing wrong user intent.

This doc does **not** change runtime behaviour. It records a phased experiment plan
after a design discussion (July 2026).

---

## Problem

Players sometimes tap **Regenerate** when the first answer misses the mark (too vague,
wrong, too long, off-guide, etc.). That behaviour is a weak but real proxy for
dissatisfaction.

**Tempting idea:** store *"user often retries"* in opt-in player memory so future
turns adapt tone/depth automatically.

**Honest assessment:** the insight is valid, but retry count alone is a **noisy,
delayed** signal. Better split into immediate turn-level handling vs slow aggregate
memory.

---

## What exists today (baseline)

| Piece | Location | Notes |
|-------|----------|-------|
| Regenerate | `use-chat-turn.tsx` `retry()` | Drops follow-up turns; re-runs `/api/solve` |
| Answer variants | `lib/chat-messages.js`, message UI | Multiple assistant versions per turn; user can flip between them |
| Player memory | [user-memory.md](./user-memory.md) | Opt-in style card; daily / **Update now** summarize; inject in `buildPrompt()` |
| Solve prompt | `lib/prompt.js` `buildPrompt()` | History + sources + optional `playerMemory`; no retry-aware branch |

**Gap:** regenerate does not tell `summarize` that the previous answer was rejected.
Memory summarize only sees chat text deltas, not structured retry metadata.

---

## Why retry-alone is weak

| Issue | Detail |
|-------|--------|
| **Noisy** | Retry can mean wrong answer, curiosity (compare variants), mis-tap, or edit-then-retry |
| **Delayed** | Memory refresh is milestone + daily + manual; frustration is **this turn** |
| **Vague for LLM** | *"Often retries"* does not say *too long* vs *wrong fact* vs *wrong tone* |
| **Overfit risk** | A few hard bosses → globally verbose answers forever |
| **Scope** | Retry pattern may be per-game, not a global trait |

Retry is still worth **counting** as one signal among many — not as the primary lever.

---

## Recommended phases (priority order)

### Phase A — Turn-level regenerate context (highest ROI)

**When:** user regenerates an assistant message (not edit-with-drop).

**Do:** pass a flag into `/api/solve` → `summarize` prompt, e.g.:

- `retryRejectedPrevious: true`
- Short excerpt or bullet summary of the **rejected** answer (cap ~300 chars)
- Optional: variant count for this turn (`activeVariantIndex + 1`)

**Prompt rule (sketch):**

> The player rejected your previous answer to this question. Do not repeat the same
> structure or opening. Try a different angle: more specific steps, shorter, or
> address a likely gap. Do not apologize or mention that you were retried.

**Why first:** zero new UI, immediate effect, no memory latency, works for anon too
(if desired) or signed-in only.

**Files likely touched:** `use-chat-turn.tsx`, `execute-chat-turn.ts`, `app/api/solve/route.ts`, `lib/replicate.ts`, `lib/prompt.js`.

**Experiment metric:** retry rate per question **within the same turn** (second attempt
accepted without another regenerate or edit).

---

### Phase B — Explicit feedback (cleanest long-term signal)

**When:** optional after regenerate or on answer foot (thumbs / chips).

**Do:** lightweight reasons, not free text:

- Too vague
- Wrong / inaccurate
- Too long
- Wrong language
- Off-topic

Store per-turn (analytics + optional memory input). Inject **reason** on the **next**
summarize for that thread when user retries with feedback.

**Why:** disambiguates retry noise; gives the model an actionable directive.

**Non-goal v1:** star ratings, NPS, or open-ended complaint boxes.

---

### Phase C — Player memory aggregate (slow, opt-in only)

**When:** only for `player_memory_enabled` users, after enough data.

**Do:** compute retry rate server-side (not in every solve path):

```
retryRate = regenerates / assistant_answers   (rolling window or all-time)
```

**Threshold sketch (tune with data):**

- Minimum sample: e.g. ≥ 20 assistant answers with memory on
- Flag only if retry rate ≥ ~25–30% sustained

**Memory bullet copy (neutral, editable in `/profile`):**

- *"Often regenerates answers; may want thorough or alternate explanations"*
- Not: *"Hard to please"* or moral framing

**Inject rule:** same as [user-memory.md](./user-memory.md) — adapt **length, tone,
structure** only; never change factual game guidance.

**Per-game optional:** store `retryRate` or a note on `player_game_memory` when
pattern is game-specific.

**Why last:** memory is the wrong layer for moment-of-frustration; aggregate is a
style hint, not a quality guarantee.

---

## Guardrails (all phases)

1. **Transparency** — anything in memory is visible and editable on `/profile`.
2. **Fail-open** — missing or broken signals → solve path unchanged.
3. **No login wall** — Phase A can work anon; Phase C stays signed-in only.
4. **Temporary chats** — exclude from memory counters (same as player memory today).
5. **Do not punish** — copy and prompts must not shame the user.
6. **Traceability** — log `retry_rejected`, `feedback_reason` in `trace_events` when
   implemented (admin traces).

---

## Non-goals

- Using retry rate for billing, ranking users, or moderation.
- Auto-deleting "bad" answers from history.
- Replacing RAG / web search with "try harder" prompting alone.
- Full personality profiling beyond existing player style memory scope.

---

## Open questions (decide before Phase A ships)

1. **Anon users:** inject retry context for everyone, or signed-in only?
2. **Variant navigation:** does switching variants (without regenerate) count as
   dissatisfaction? (Probably **no** for v1.)
3. **Edit + drop follow-ups:** same prompt branch as regenerate? (Likely **yes** —
   user changed the question.)
4. **Cap rejected excerpt:** last answer full text vs first 300 chars vs highlights only?
5. **Success metric:** lower within-turn double-regenerate rate vs thumbs-up rate (Phase B).

---

## Success criteria (experiments)

| Phase | Signal we're looking for |
|-------|--------------------------|
| A | Fewer 2+ regenerates on the same turn; no increase in answer length p95 |
| B | Reason distribution explains retries; model follows reason in spot checks |
| C | Users with high retry rate report better fit **without** global verbosity spike |

---

## Decision log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-07-24 | Document only; no code | Validate approach before building |
| 2026-07-24 | Phase A before Phase C | Immediate user value; memory is slow |
| 2026-07-24 | Retry aggregate = weak memory bullet, not primary fix | Noisy proxy; needs thresholds |

When a phase ships, update status here and cross-link from `CLAUDE.md`.
