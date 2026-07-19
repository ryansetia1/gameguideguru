import { cleanSnippet } from "@/lib/clean";
import { buildGuideDiscoveryQuery } from "@/lib/guide-search.js";
import { selectSources } from "@/lib/rank";

const TAVILY_URL = "https://api.tavily.com/search";
const TAVILY_EXTRACT_URL = "https://api.tavily.com/extract";

// Per-call timeout combined with an optional caller signal (client Stop), so a
// Stop mid-search aborts the outstanding provider request instead of waiting it out.
function combineSignal(ms: number, signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(ms);
  return signal ? AbortSignal.any([timeout, signal]) : timeout;
}

export type SearchResult = {
  title: string;
  url: string;
  content: string;
  score: number;
  preferred?: boolean;
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
// Snippets shorter than this after cleaning are almost always pure navigation.
const MIN_CONTENT = 60;

async function runSearch(
  apiKey: string,
  query: string,
  includeDomains: string[],
  signal?: AbortSignal,
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
    signal: combineSignal(12_000, signal),
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

// WordPress-style listing/hub paths that only carry teasers + "Read more" links,
// not the actual walkthrough text. ponytail: path-pattern heuristic, not a content
// check; extend the list if a site uses other archive prefixes.
function looksLikeIndex(rawUrl: string): boolean {
  try {
    const path = new URL(rawUrl).pathname;
    return /\/(category|categories|tag|tags|author|archives?|page)\//i.test(path);
  } catch {
    return false;
  }
}

// Site root or archive listing — not a full walkthrough page.
export function looksLikeHub(rawUrl: string): boolean {
  try {
    const path = new URL(rawUrl).pathname.replace(/\/+$/, "") || "/";
    if (path === "/") return true;
    return looksLikeIndex(rawUrl);
  } catch {
    return true;
  }
}

/**
 * Pull the full text of a guide page for RAG ingest. Given page only — does not
 * follow child links. Returns null when Tavily is unconfigured or extract fails.
 */
export async function extractGuidePage(
  rawUrl: string,
  signal?: AbortSignal,
): Promise<{ url: string; content: string } | null> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return null;

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
    signal: combineSignal(30_000, signal),
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

  const content = cleanSnippet(raw);
  if (content.length < MIN_CONTENT) return null;

  return { url: parsed.toString(), content };
}

/**
 * Tavily implementation. Tiered domain search with confidence gating in
 * selectSources. Throws when every Tavily call fails so the caller can fall back.
 */
async function searchTavily(
  apiKey: string,
  query: string,
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  return selectSources(await tieredSearch(apiKey, query, signal));
}

/** Collect tiered Tavily results without the answer-time confidence gate. */
async function tieredSearch(
  apiKey: string,
  query: string,
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  const seen = new Set<string>();
  const collected: SearchResult[] = [];
  let attempts = 0;
  let failures = 0;

  for (const includeDomains of TIERS) {
    let tier: SearchResult[] = [];
    attempts += 1;
    try {
      tier = await runSearch(apiKey, query, includeDomains, signal);
    } catch {
      // ponytail: per-tier failures are non-fatal; search is supporting evidence.
      failures += 1;
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

  // Every Tavily call failed (quota/outage) — signal the caller to try a fallback
  // instead of masking it as "no relevant results".
  if (attempts > 0 && failures === attempts) {
    throw new Error("All Tavily searches failed");
  }

  return collected;
}

const SERPER_URL = "https://google.serper.dev/search";

// Map Serper "organic" results into our SearchResult shape (snippet-only; Serper
// has no page extraction). Score is a synthetic rank so downstream trimming works.
function mapSerper(payload: unknown): SearchResult[] {
  const organic =
    payload && typeof payload === "object" && "organic" in payload
      ? (payload.organic as unknown)
      : null;
  if (!Array.isArray(organic)) return [];

  return organic.flatMap((item, index): SearchResult[] => {
    if (
      !item ||
      typeof item !== "object" ||
      typeof (item as { link?: unknown }).link !== "string" ||
      typeof (item as { title?: unknown }).title !== "string"
    ) {
      return [];
    }
    const rawSnippet = (item as { snippet?: unknown }).snippet;
    try {
      const url = new URL((item as { link: string }).link);
      if (url.protocol !== "http:" && url.protocol !== "https:") return [];
      if (EXCLUDE_DOMAINS.some((domain) => url.hostname.endsWith(domain))) return [];
      const content = cleanSnippet(typeof rawSnippet === "string" ? rawSnippet : "").slice(
        0,
        CONTENT_CAP,
      );
      if (content.length < MIN_CONTENT) return [];
      return [
        {
          title: cleanSnippet((item as { title: string }).title) || url.hostname,
          url: url.toString(),
          content,
          score: Math.max(0.5, 1 - index * 0.05),
        },
      ];
    } catch {
      return [];
    }
  });
}

async function serperQuery(
  apiKey: string,
  q: string,
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  const response = await fetch(SERPER_URL, {
    method: "POST",
    headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ q, num: 10 }),
    signal: combineSignal(12_000, signal),
  });
  if (!response.ok) throw new Error(`Serper search failed with status ${response.status}`);
  return mapSerper(await response.json());
}

/**
 * Serper.dev fallback used when Tavily is unavailable. Snippet-only (no page
 * extraction). Trimmed to the top 3.
 */
async function searchSerper(
  apiKey: string,
  query: string,
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  return (await serperQuery(apiKey, query, signal)).slice(0, 3);
}

/**
 * Find supporting web sources for a query. Uses Tavily first; if Tavily is
 * unconfigured or every call fails (quota/outage), falls back to Serper.dev when
 * `SERPER_API_KEY` is set. Returns [] when nothing relevant; throws only when no
 * provider is configured or the sole provider fails with no backup.
 */
export async function searchGuides(
  query: string,
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  const tavilyKey = process.env.TAVILY_API_KEY;
  const serperKey = process.env.SERPER_API_KEY;
  if (!tavilyKey && !serperKey) {
    throw new Error("No search provider configured (TAVILY_API_KEY or SERPER_API_KEY)");
  }

  if (tavilyKey) {
    try {
      return await searchTavily(tavilyKey, query, signal);
    } catch (error) {
      if (!serperKey) throw error;
      console.error("Tavily unavailable; falling back to Serper:", error);
    }
  }
  return searchSerper(serperKey as string, query, signal);
}

const DISCOVER_MAX = 8;

export { buildGuideDiscoveryQuery } from "@/lib/guide-search.js";

/** Browse guide links for the preferred-guide picker (no confidence gate). */
export async function discoverGuideLinks(
  game: string,
  platform: string,
  query = "",
): Promise<SearchResult[]> {
  const searchQuery = buildGuideDiscoveryQuery(game, platform, query);
  if (!searchQuery) return [];

  const tavilyKey = process.env.TAVILY_API_KEY;
  const serperKey = process.env.SERPER_API_KEY;
  if (!tavilyKey && !serperKey) {
    throw new Error("No search provider configured (TAVILY_API_KEY or SERPER_API_KEY)");
  }

  if (tavilyKey) {
    try {
      return (await tieredSearch(tavilyKey, searchQuery))
        .sort((a, b) => b.score - a.score)
        .slice(0, DISCOVER_MAX);
    } catch (error) {
      if (!serperKey) throw error;
      console.error("Tavily unavailable; falling back to Serper:", error);
    }
  }

  return (await searchSerper(serperKey as string, searchQuery)).slice(0, DISCOVER_MAX);
}
