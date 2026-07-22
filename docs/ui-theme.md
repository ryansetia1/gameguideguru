# GameGuide Go — UI theme

Reference for agents and contributors. Tokens live in `app/globals.css` (`:root` and
`[data-theme="dark"]`).

## Shape

**No rounded corners.** The product uses a sharp, editorial layout:

- `border-radius: 0` on cards, panels, buttons, inputs, tags, and progress bars.
- Status markers are **square dots**, not circles.
- Loaders/spinners may stay circular (functional affordance).
- Avatar images may stay circular when sourced from OAuth/Steam.

Do not introduce `rounded-*`, `border-radius`, or pill-shaped chips unless the
user explicitly changes this rule.

## Color

| Token | Role |
|-------|------|
| `--paper` / `--paper-strong` | Page and card backgrounds |
| `--ink` | Primary text, strong borders (1.5px on cards) |
| `--muted` / `--text-subtle` | Secondary text, meta labels |
| `--line` | Default 1px borders |
| `--signal` (`#00ffaa`) | Brand accent, progress, primary CTA hover |
| `--signal-dark` | Accent text on light surfaces, link color |
| `--on-signal` | Text on `--signal` fills |
| `--danger` | Errors, pending-index warnings |

Prefer existing CSS variables over hard-coded hex. Dark mode overrides the same
tokens via `[data-theme="dark"]`.

## Typography

- **Font:** Rubik (`--font-sans`), loaded in `app/layout.tsx`.
- **Meta / labels:** small caps feel — `font-weight: 700`, `letter-spacing: 0.04–0.08em`,
  `text-transform: uppercase` on buttons and platform/year lines.
- **Body:** normal case, relaxed line-height for readable answers.

## Components

- **Cards** (`.game-card`, setup panels): `border: 1.5px solid var(--ink)`,
  `background: var(--paper-strong)`, no radius.
- **Buttons:** square, bordered; hover often fills `--signal`.
- **GameFAQs bundle panel** (`.bundle-index-panel`): grouped with its guide link in
  `.game-card-guide-stack` (full card width); spoiler toggle sits below all guides
  in `.game-card-spoiler`.
- **Links:** `--signal-dark` with external-link icon pattern (`.icon-inline`).

## Motion (juicy but editorial)

Micro-interactions should feel tactile without clashing with the sharp, flat
look. One shared overshoot easing token, `--ease-pop`
(`cubic-bezier(0.22, 1.2, 0.36, 1)`), drives the springy feedback.

- **Tappable cards** (`.quick-card`, `.library-card`) — hover **lifts** with the
  signature hard offset shadow (`translate(-2px, -2px)` + `box-shadow: Npx Npx 0
  var(--ink)`), press **settles** back down with a smaller shadow. This is the
  canonical "juice" pattern; reuse it, don't invent bouncy/rounded variants.
- **Buttons** (`.submit`, `.quick-new`, `.quick-lib-btn`, `.turn-action`,
  `.nav-icon-btn`, `.nav-button`, `.composer-attach`, sidebar buttons) — quick
  `:active` press (`scale(0.9–0.98)` or `translate` settle). Hover keeps the
  existing `--signal` fill.
- **Send button** — the icon leans into a "launch" nudge on hover and pops back
  on press.
- **Answer arrival** — `.turn.guide` plays a one-time `answer-pop` spring on
  mount (the single moment that earns extra juice). Keep rewards to meaningful
  moments; don't animate every state change.
- Keep durations short (90–200ms for feedback, ~440ms for the answer pop). The
  global `prefers-reduced-motion` block neutralises keyframe animations; scale/
  transform *transitions* are subtle and left on, matching existing convention.

## Copy

See **Copywriting** in `CLAUDE.md` (buddy tone, no em-dash AI tells).

## PWA / brand assets

Logo `#00FFAA` background, maskable icon padded square. Details in `CLAUDE.md`
(PWA + brand section).
