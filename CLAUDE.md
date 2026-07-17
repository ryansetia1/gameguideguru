# GameGuide Guru

## Purpose

Mobile-first Next.js prototype that turns a player's game question into a
web-researched, AI-summarized walkthrough with visible source links.

## Architecture

- `app/page.tsx`: Indonesian client UI and `/api/solve` consumer.
- `app/api/solve/route.ts`: validates input and orchestrates search then summary.
- `lib/tavily.ts`: Tavily Search API adapter and external-result validation.
- `lib/replicate.ts`: Replicate model adapter and output normalization.
- `lib/prompt.js`: shared prompt builder, covered by `npm run check`.

## Commands

```bash
npm run dev
npm run check
npm run build
```

## Environment

Required server-only variables:

- `TAVILY_API_KEY`
- `REPLICATE_API_TOKEN`

Optional: `REPLICATE_MODEL` in `owner/name` format. Never expose these through a
`NEXT_PUBLIC_` variable or commit `.env.local`.

## Working conventions

- Keep provider calls server-side.
- Validate browser input and all external API data.
- Keep the UI dependency-free and accessible.
- Preserve source links alongside every generated guide.
- Update this file when architecture, providers, commands, or environment
  requirements change significantly.
