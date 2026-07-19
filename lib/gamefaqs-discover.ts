import {
  discoverGamefaqsBundle,
  mergeGamefaqsBundlePages,
  parseGamefaqsFaqUrl,
  parseGamefaqsGuideTitle,
  parseGamefaqsPagesFromUrls,
  parseGamefaqsTocFromHtml,
  shouldSkipGamefaqsSlug,
  titleFromGamefaqsSlug,
} from "@/lib/gamefaqs-bundle.js";
import { extractGuidePage, searchDiscoveryUrls } from "@/lib/tavily";

type BundleDiscovery = Awaited<ReturnType<typeof discoverGamefaqsBundle>>;
type ParsedFaq = NonNullable<ReturnType<typeof parseGamefaqsFaqUrl>>;
type BundlePage = { title: string; url: string; slug: string };

function buildBundleDiscovery(
  parsed: ParsedFaq,
  pages: BundlePage[],
  title = "GameFAQs guide",
): BundleDiscovery {
  return {
    bundle: true,
    provider: "gamefaqs",
    bundleKey: parsed.bundleKey,
    canonicalUrl: parsed.canonicalUrl,
    title,
    pageCount: pages.length,
    pages,
  };
}

function isBlockedGuideContent(text: string): boolean {
  return /Social Media Cookies|Just a moment|challenges\.cloudflare/i.test(text);
}

async function enrichBundlePagesFromExtracts(
  parsed: ParsedFaq,
  seedPages: BundlePage[],
  signal?: AbortSignal,
): Promise<BundlePage[]> {
  const merged = [...seedPages];
  const seeds = seedPages.filter(
    (page) =>
      page.slug === "walkthrough" ||
      page.slug === "introduction" ||
      page.slug.startsWith("part-1") ||
      page.slug === "frequently-asked-questions",
  );

  for (const page of seeds.slice(0, 4)) {
    const extracted = await extractGuidePage(page.url, signal);
    if (!extracted?.content || isBlockedGuideContent(extracted.content)) continue;
    const found = parseGamefaqsTocFromHtml(extracted.content, parsed);
    if (found.length) merged.push(...found);
  }

  return mergeGamefaqsBundlePages(merged);
}

async function discoverGamefaqsBundleViaSearch(
  parsed: ParsedFaq,
  signal?: AbortSignal,
): Promise<BundleDiscovery | null> {
  const path = new URL(parsed.canonicalUrl).pathname;
  const queries = [
    `site:gamefaqs.gamespot.com${path}`,
    `site:gamefaqs.gamespot.com "${path}/"`,
    `site:gamefaqs.gamespot.com "${path}/part-"`,
    `site:gamefaqs.gamespot.com "${path}/boss"`,
    `${path.replace(/\//g, " ")} walkthrough`,
    `gamefaqs ${parsed.gameSlug.replace(/-/g, " ")} faq ${parsed.faqId}`,
  ];

  const seenUrls = new Set<string>();
  const mergedHits: { url: string }[] = [];

  for (const query of queries) {
    let hits = [];
    try {
      hits = await searchDiscoveryUrls(query, signal, {
        domains: ["gamefaqs.gamespot.com"],
        maxResults: 30,
      });
    } catch {
      continue;
    }
    for (const hit of hits) {
      if (seenUrls.has(hit.url)) continue;
      seenUrls.add(hit.url);
      mergedHits.push(hit);
    }
  }

  let pages = parseGamefaqsPagesFromUrls(
    mergedHits.map((hit) => hit.url),
    parsed,
  );
  if (pages.length <= 1) return null;

  pages = await enrichBundlePagesFromExtracts(parsed, pages, signal);
  if (pages.length <= 1) return null;

  return buildBundleDiscovery(parsed, pages);
}

/**
 * GameFAQs blocks direct HTML fetch (Cloudflare). Fall back to Tavily extract,
 * site search (+ extract TOC enrichment), when the plain fetch finds 0–1 pages.
 */
export async function discoverGamefaqsBundleResolved(
  rawUrl: string,
  signal?: AbortSignal,
): Promise<BundleDiscovery> {
  const direct = await discoverGamefaqsBundle(rawUrl, signal);
  if (direct.bundle) return direct;

  const parsed = parseGamefaqsFaqUrl(rawUrl);
  if (!parsed) return direct;

  const candidates = [
    `${parsed.canonicalUrl}/introduction`,
    parsed.canonicalUrl,
  ];

  for (const url of candidates) {
    const extracted = await extractGuidePage(url, signal);
    const pages = extracted?.content
      ? parseGamefaqsTocFromHtml(extracted.content, parsed)
      : [];
    if (!extracted?.content || pages.length <= 1) continue;

    const enriched = await enrichBundlePagesFromExtracts(parsed, pages, signal);
    return buildBundleDiscovery(
      parsed,
      enriched,
      parseGamefaqsGuideTitle(extracted.content) || "GameFAQs guide",
    );
  }

  const fromSearch = await discoverGamefaqsBundleViaSearch(parsed, signal);
  if (fromSearch) return fromSearch;

  return direct;
}
