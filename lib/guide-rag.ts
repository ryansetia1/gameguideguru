import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { embedQuery } from "@/lib/embed";
import { toVectorString } from "@/lib/embed-cache";
import { ensureGuideIngested, isGuideRagAvailable, normalizeGuideUrl } from "@/lib/guide-ingest";
import type { SearchResult } from "@/lib/tavily";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// ponytail: hand-tuned cosine threshold for Qwen3; tune in one place.
export const GUIDE_HIT = 0.35;
const RETRIEVE_K = 5;

let client: SupabaseClient | null = null;
let ragUnavailableLogged = false;

function getClient(): SupabaseClient | null {
  if (!url || !anonKey) return null;
  if (!client) {
    client = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

type MatchRow = {
  chunk_text: string;
  similarity: number;
};

export type GuideRagResult = {
  sources: SearchResult[];
  skipWebSearch: boolean;
  hubWarning: boolean;
};

function hostLabel(guideUrl: string): string {
  try {
    return new URL(guideUrl).hostname.replace(/^www\./, "");
  } catch {
    return "Preferred guide";
  }
}

/**
 * Preferred-guide RAG path: ingest (lazy), embed query, retrieve top-K chunks,
 * route on similarity. Returns null when RAG infra is unavailable so the caller
 * can fall back to tiered web search.
 */
export async function retrieveFromPreferredGuide(input: {
  guideUrl: string;
  query: string;
  signal?: AbortSignal;
}): Promise<GuideRagResult | null> {
  if (!isGuideRagAvailable()) {
    if (!ragUnavailableLogged) {
      console.warn("Preferred-guide RAG unavailable; falling back to web search.");
      ragUnavailableLogged = true;
    }
    return null;
  }

  const guideUrl = normalizeGuideUrl(input.guideUrl);
  const ingest = await ensureGuideIngested(guideUrl, input.signal);
  if (!ingest.indexed) {
    return {
      sources: [],
      skipWebSearch: false,
      hubWarning: ingest.hubWarning,
    };
  }

  const queryEmbedding = await embedQuery(input.query, input.signal);
  if (!queryEmbedding?.length) {
    return { sources: [], skipWebSearch: false, hubWarning: ingest.hubWarning };
  }

  const supabase = getClient();
  if (!supabase) return null;

  let matches: MatchRow[] = [];
  try {
    const { data, error } = await supabase.rpc("match_guide_chunks", {
      p_guide_url: guideUrl,
      p_embedding: toVectorString(queryEmbedding),
      p_limit: RETRIEVE_K,
    });
    if (error) throw error;
    matches = (data ?? []) as MatchRow[];
  } catch (error) {
    console.error("Guide chunk retrieval failed:", error);
    return { sources: [], skipWebSearch: false, hubWarning: ingest.hubWarning };
  }

  if (!matches.length) {
    return { sources: [], skipWebSearch: false, hubWarning: ingest.hubWarning };
  }

  const topSimilarity = matches[0]?.similarity ?? 0;
  const label = hostLabel(guideUrl);
  const hit = topSimilarity >= GUIDE_HIT;

  const sources: SearchResult[] = matches.map((row, index) => ({
    title: hit ? `${label} (section ${index + 1})` : label,
    url: guideUrl,
    content: row.chunk_text,
    score: row.similarity,
    preferred: hit,
  }));

  return {
    sources: hit ? sources : sources.slice(0, 1),
    skipWebSearch: hit,
    hubWarning: ingest.hubWarning,
  };
}
