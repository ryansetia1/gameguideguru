import { cleanSnippet, focusSection } from "@/lib/clean";
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
// room than a search snippet. focusSection trims a long page to the window that
// matches the question, so this cap is the size of that relevant slice, not the
// whole guide — generous enough for a full section without dumping a 100k-char FAQ.
const EXTRACT_CONTENT_CAP = 9000;
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

// Site root or archive listing — site-search should pick a child article. A deep
// link like /3-suikoden-kwanda-rosman is a specific chapter: extract it directly.
function looksLikeHub(rawUrl: string): boolean {
  try {
    const path = new URL(rawUrl).pathname.replace(/\/+$/, "") || "/";
    if (path === "/") return true;
    return looksLikeIndex(rawUrl);
  } catch {
    return true;
  }
}

// Pull the full content of the user's preferred guide page directly. Returns a
// single source or null (bad URL, unreachable page, or too little text). The
// user explicitly trusts this page, so callers use it without a confidence gate.
async function extractPreferred(
  apiKey: string,
  rawUrl: string,
  query: string,
  signal?: AbortSignal,
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
    signal: combineSignal(12_000, signal),
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

  const content = focusSection(cleanSnippet(raw), query, EXTRACT_CONTENT_CAP);
  if (content.length < MIN_CONTENT) return null;

  return {
    title: parsed.hostname.replace(/^www\./, ""),
    url: parsed.toString(),
    content,
    score: 1,
  };
}

/**
 * Tavily implementation. When `preferredUrl` is set: for a specific chapter URL,
 * extract it first; for a hub/root URL, site-search the host for the right section.
 * Falls back to site-search snippets, then the normal tiered search. Throws when
 * every Tavily call fails (e.g. quota/outage) so the caller can fall back.
 */
async function searchTavily(
  apiKey: string,
  query: string,
  preferredUrl?: string,
  focusQuery?: string,
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  const focus = (focusQuery ?? query).trim();
  const preferred = (preferredUrl ?? "").trim();
  if (preferred) {
    let host = "";
    try {
      host = new URL(preferred).hostname.replace(/^www\./, "");
    } catch {
      host = "";
    }

    const hub = looksLikeHub(preferred);

    // Deep link the user pasted — read that page, don't let site-search override it
    // with a higher-scoring index (e.g. a 108-Stars recruit list on the same host).
    if (!hub) {
      try {
        const exact = await extractPreferred(apiKey, preferred, focus, signal);
        if (exact) return [exact];
      } catch {
        // ponytail: fall through to site-search on the same host.
      }
    }

    // Site-search the preferred host for the right section, then read it in full.
    if (host) {
      let domainResults: SearchResult[] = [];
      try {
        domainResults = await runSearch(apiKey, query, [host], signal);
      } catch {
        domainResults = [];
      }
      // The user explicitly trusts this site, so rank by score but SKIP the
      // confidence gate: a niche fan-site's top hit often scores below
      // CONFIDENCE_MIN yet is exactly the right section page. Gating here made us
      // fall through to extracting the pasted hub/category URL (shallow index).
      const ranked = domainResults
        .slice()
        .sort((a, b) => b.score - a.score);
      // Prefer real article pages over listing/hub pages (a pasted /category/...
      // hub only has teasers; the actual walkthrough lives on a linked article),
      // so we drill to the section page instead of extracting the index.
      const articles = ranked.filter((result) => !looksLikeIndex(result.url));
      const picks = articles.length ? articles : ranked;
      if (picks.length) {
        try {
          const deep = await extractPreferred(apiKey, picks[0].url, focus, signal);
          if (deep) {
            return [{ ...deep, title: picks[0].title || deep.title }];
          }
        } catch {
          // ponytail: extract failures fall back to site-search snippets.
        }
        return picks.slice(0, 3);
      }
    }

    // Hub URL only: site-search found nothing useful — try extracting the paste.
    if (hub) {
      try {
        const exact = await extractPreferred(apiKey, preferred, focus, signal);
        if (exact) return [exact];
      } catch {
        // ponytail: extract failures fall through to tiered search.
      }
    }
  }

  // 3. Normal tiered search.
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
 * extraction): a preferred host becomes a `site:` filter, otherwise one general
 * query (the query already carries "walkthrough guide"). Trimmed to the top 3.
 */
async function searchSerper(
  apiKey: string,
  query: string,
  preferredUrl?: string,
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  let host = "";
  try {
    if (preferredUrl) host = new URL(preferredUrl).hostname.replace(/^www\./, "");
  } catch {
    host = "";
  }

  if (host) {
    const scoped = await serperQuery(apiKey, `site:${host} ${query}`, signal);
    if (scoped.length) return scoped.slice(0, 3);
  }
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
  preferredUrl?: string,
  focusQuery?: string,
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  const tavilyKey = process.env.TAVILY_API_KEY;
  const serperKey = process.env.SERPER_API_KEY;
  if (!tavilyKey && !serperKey) {
    throw new Error("No search provider configured (TAVILY_API_KEY or SERPER_API_KEY)");
  }

  if (tavilyKey) {
    try {
      return await searchTavily(tavilyKey, query, preferredUrl, focusQuery, signal);
    } catch (error) {
      if (!serperKey) throw error;
      console.error("Tavily unavailable; falling back to Serper:", error);
    }
  }
  return searchSerper(serperKey as string, query, preferredUrl, signal);
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
