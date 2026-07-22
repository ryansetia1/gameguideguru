# Image character recognition (prompt-only)

**Status:** Experimental — **patut dicoba, riskan** (July 2026)  
**Shipped:** Prompt text only in `lib/prompt.js` (+ self-check in `scripts/check.mjs`)  
**Runtime:** No new API, flag, or DB. Gemini already receives message images via Replicate `images`.

## What it does

When the player attaches screenshot(s), the model is instructed to:

- Name recognizable characters from game knowledge (not only literal appearance).
- Hedge when uncertain: `(maybe Sonic)` / `(mungkin Sonic)`.
- Name multiple characters when several appear.
- Never assert a wrong name with false certainty.

Applies to:

| Call site | Constant / function |
|-----------|---------------------|
| Answer generation | `buildPrompt` → `IMAGE_CHARACTER_RULES` |
| Web-search rewrite | `REWRITE_INSTRUCTION`, `buildRewritePrompt` → `IMAGE_REWRITE_CHARACTER_RULES` |
| Preferred-guide RAG rewrite | `REWRITE_RAG_INSTRUCTION` |

## Why it is risky

| Risk | Symptom in production |
|------|------------------------|
| **Wrong ID with confidence** | Guide answers for the wrong boss/NPC despite hedging rules |
| **Cross-game confusion** | Similar-looking character from another franchise named incorrectly |
| **Spoiler leakage** | Naming an unmasked character the player has not met yet |
| **Bad search/RAG queries** | Rewrite injects a wrong name → worse Tavily hits or guide retrieval |
| **Over-naming** | Generic mobs or custom skins forced into a famous name |
| **Mod / ROM hack art** | Vanilla-game knowledge mislabels modded sprites |

Prompt-only guardrails help but **cannot guarantee** vision accuracy. Treat as tuning, not a feature contract.

## What to watch (before reverting)

1. **`public.llm_calls`** (or `llm-log.json` in dev): `rewrite` + `summarize` rows on turns **with images** — compare query text and answer quality before/after.
2. **Admin trace** (`/admin`, `X-Trace-Id`): image turns where search or RAG returns irrelevant sources after a bad rewrite.
3. **User reports**: “it called the wrong character”, “spoilers”, “answer is for a different boss”.
4. **A/B manually**: same screenshot + question with rules on vs reverted locally.

If failures are rare and hedged (`maybe X`), consider **softening** the prompt before a full revert (see below).

## Revert (full)

No env var — revert is a **code change** in `lib/prompt.js` (and tests). Deploy after revert like any other fix.

### Option A — Git (preferred if this shipped as its own commit)

```bash
# Find the commit (message mentions image character / prompt vision)
git log --oneline -- lib/prompt.js scripts/check.mjs

# Revert that commit (creates a new revert commit)
git revert <commit-sha>

npm run check
# deploy as usual
```

### Option B — Manual edit (`lib/prompt.js`)

1. **Delete** the two constants at the top of the file:
   - `IMAGE_CHARACTER_RULES`
   - `IMAGE_REWRITE_CHARACTER_RULES`

2. **Restore** `buildPrompt` image block to:

```js
  const imageBlock =
    imageCount > 0
      ? `The player attached ${imageCount} image(s) with this question (e.g. a screenshot or photo of where they are stuck). Use them as visual context — identify the exact screen, location, item, enemy, or menu shown, and read any dialog or text present — and prioritise what they depict over guesses.\n\n`
      : "";
```

3. **Restore** `REWRITE_INSTRUCTION` image sentence to (no character naming):

```
If image(s) are attached, they are the visual context for the question ("this boss", "here", "this item"): identify what they show (the specific boss, enemy, location, screen, item, menu, or in-game dialog) and put that concrete subject into the query.
```

4. **Restore** `REWRITE_RAG_INSTRUCTION` image sentence similarly (no `character`, no `IMAGE_REWRITE_CHARACTER_RULES`).

5. **Restore** `buildRewritePrompt` image block to:

```js
  const imageBlock =
    imageCount > 0
      ? `The player attached ${imageCount} image(s) as visual context for this question. Identify the specific boss, enemy, location, screen, item, menu, or in-game dialog shown and fold it into the query.\n\n`
      : "";
```

6. **Remove** the image-character asserts in `scripts/check.mjs` (block after `namedPrompt` that matches `/maybe Sonic/`).

7. Run `npm run check`, deploy.

**Behaviour after revert:** Vision still works for screens, items, menus, and dialog; the model goes back to **literal visual description** unless the player names the character in text.

## Partial rollback (softer, not full revert)

If full revert feels too blunt, try one of these smaller edits in `IMAGE_CHARACTER_RULES` only:

- Remove the Sonic example (reduces over-eager franchise matching).
- Add: “Only name characters when the stated **Game** field matches the franchise.”
- Change confident naming to **always** require hedging: “Default to `(maybe Name)` unless dialog UI shows the name.”

Keep rewrite rules in sync if you change naming policy (search quality depends on them).

## Related code (unchanged by this experiment)

- Image upload/compress: `lib/image.js`, `app/page.tsx`
- Images passed to model: `lib/replicate.ts` (`resolveQuestion`, `summarize`), `app/api/solve/route.ts`
- Client attach UX: `app/composer-extras.tsx`, `app/chat/composer-shell.tsx`

Reverting this doc’s prompt change does **not** disable image attachments.
