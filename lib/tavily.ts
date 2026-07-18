import { cleanSnippet } from "@/lib/clean";
import { selectSources } from "@/lib/rank";

const TAVILY_URL = "https://api.tavily.com/search";
const TAVILY_EXTRACT_URL = "https://api.tavily.com/extract";

export type SearchResult = {
  title: string;
  url: string;
  content: string;
  score: number;
};

// Video/social results the text LLM cannot read; always excluded.
const EXCLUDE_DOMAINS = [
  "youtube.com",
  "m.youtube.com",
  "youtu.be",
  "twitch.tv",
  "tiktok.com",
  "instagram.com",
  "facebook.com",
  "x.com",
  "twitter.com",
  "pinterest.com",
];

// Searched in order, stopping once enough results are collected. GameFAQs is the
// primary source, then trusted text walkthrough providers, then forums, then the
// open web as a last resort.
const TIERS: string[][] = [
  ["gamefaqs.gamespot.com"],
  [
    "ign.com",
    "gamespot.com",
    "game8.co",
    "powerpyx.com",
    "fextralife.com",
    "polygon.com",
    "gamesradar.com",
    "neoseeker.com",
    "primagames.com",
    "gameskinny.com",
  ],
  ["reddit.com", "steamcommunity.com", "gamefaqs.gamespot.com"],
  [],
];

// Enough collected results to stop querying further tiers; final relevance
// gating/trimming happens in selectSources.
const MIN_RESULTS = 3;
const CONTENT_CAP = 800;
// The user's preferred page is a whole trusted walkthrough, so give it far more
// room than a search snippet. ponytail: whole-page chunk, not the section that
// answers the question; upgrade path is section-targeting/chunk re-ranking.
const EXTRACT_CONTENT_CAP = 6000;
// Snippets shorter than this after cleaning are almost always pure navigation.
const MIN_CONTENT = 60;

async function runSearch(
  apiKey: string,
  query: string,
  includeDomains: string[],
): Promise<SearchResult[]> {
  const response = await fetch(TAVILY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      // "advanced" extracts more relevant page chunks and re-ranks better than
      // "basic" (which let an unrelated game outrank the correct guides).
      search_depth: "advanced",
      max_results: 5,
      include_answer: false,
      exclude_domains: EXCLUDE_DOMAINS,
      ...(includeDomains.length ? { include_domains: includeDomains } : {}),
    }),
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) {
    throw new Error(`Tavily search failed with status ${response.status}`);
  }

  const payload: unknown = await response.json();
  const results =
    payload && typeof payload === "object" && "results" in payload
      ? (payload.results as unknown)
      : null;

  if (!Array.isArray(results)) return [];

  return results.flatMap((result): SearchResult[] => {
    if (
      !result ||
      typeof result !== "object" ||
      !("title" in result) ||
      !("url" in result) ||
      !("content" in result) ||
      typeof result.title !== "string" ||
      typeof result.url !== "string" ||
      typeof result.content !== "string"
    ) {
      return [];
    }

    try {
      const url = new URL(result.url);
      if (url.protocol !== "http:" && url.protocol !== "https:") return [];

      const content = cleanSnippet(result.content).slice(0, CONTENT_CAP);
      if (content.length < MIN_CONTENT) return [];

      const score =
        "score" in result && typeof result.score === "number"
          ? result.score
          : 0;

      return [
        {
          title: cleanSnippet(result.title) || url.hostname,
          url: url.toString(),
          content,
          score,
        },
      ];
    } catch {
      return [];
    }
  });
}

// Pull the full content of the user's preferred guide page directly. Returns a
// single source or null (bad URL, unreachable page, or too little text). The
// user explicitly trusts this page, so callers use it without a confidence gate.
async function extractPreferred(
  apiKey: string,
  rawUrl: string,
): Promise<SearchResult | null> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;

  const response = await fetch(TAVILY_EXTRACT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ urls: [parsed.toString()] }),
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) return null;

  const payload: unknown = await response.json();
  const results =
    payload && typeof payload === "object" && "results" in payload
      ? (payload.results as unknown)
      : null;
  if (!Array.isArray(results) || results.length === 0) return null;

  const first = results[0];
  if (!first || typeof first !== "object" || !("raw_content" in first)) return null;
  const raw = (first as { raw_content: unknown }).raw_content;
  if (typeof raw !== "string") return null;

  const content = cleanSnippet(raw).slice(0, EXTRACT_CONTENT_CAP);
  if (content.length < MIN_CONTENT) return null;

  return {
    title: parsed.hostname.replace(/^www\./, ""),
    url: parsed.toString(),
    content,
    score: 1,
  };
}

/**
 * Find supporting web sources for a query. When `preferredUrl` is set, cascade:
 * (1) pull that exact page, else (2) search only that page's domain, else
 * (3) fall back to the normal tiered search. Steps 1-2 return sources solely
 * from the preferred site; step 3 uses the usual mix.
 */
export async function searchGuides(
  query: string,
  preferredUrl?: string,
): Promise<SearchResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error("TAVILY_API_KEY is not configured");

  const preferred = (preferredUrl ?? "").trim();
  if (preferred) {
    // 1. Exact page — trusted, so skip the confidence gate.
    let exact: SearchResult | null = null;
    try {
      exact = await extractPreferred(apiKey, preferred);
    } catch {
      // ponytail: extract failures fall through to the domain step.
    }
    if (exact) return [exact];

    // 2. Whole preferred site — keep only that domain's results when relevant.
    let host = "";
    try {
      host = new URL(preferred).hostname;
    } catch {
      host = "";
    }
    if (host) {
      let domainResults: SearchResult[] = [];
      try {
        domainResults = await runSearch(apiKey, query, [host]);
      } catch {
        domainResults = [];
      }
      const selected = selectSources(domainResults);
      if (selected.length) return selected;
    }
  }

  // 3. Normal tiered search.
  const seen = new Set<string>();
  const collected: SearchResult[] = [];

  for (const includeDomains of TIERS) {
    let tier: SearchResult[] = [];
    try {
      tier = await runSearch(apiKey, query, includeDomains);
    } catch {
      // ponytail: per-tier failures are non-fatal; search is supporting evidence.
      continue;
    }

    for (const result of tier) {
      // Dedupe by URL and by title: GameFAQs splits one guide across several
      // URLs, so the same walkthrough can otherwise appear multiple times.
      const urlKey = `u:${result.url.replace(/\/+$/, "").toLowerCase()}`;
      const titleKey = `t:${result.title.toLowerCase()}`;
      if (seen.has(urlKey) || seen.has(titleKey)) continue;
      seen.add(urlKey);
      seen.add(titleKey);
      collected.push(result);
    }

    if (collected.length >= MIN_RESULTS) break;
  }

  // Confidence gate + trim: returns [] when nothing is clearly relevant, so the
  // model answers from its own knowledge instead of a weak snippet.
  return selectSources(collected);
}
