import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { chunkGuide } from "@/lib/chunk-guide.js";
import { embedTexts } from "@/lib/embed";
import { toVectorString } from "@/lib/embed-cache";
import { cleanSnippet } from "@/lib/clean.js";
import { extractGuidePage, looksLikeHub } from "@/lib/tavily";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Extracted text shorter than this is probably a hub/index page, not a walkthrough.
const MIN_GUIDE_CHARS = 400;

let client: SupabaseClient | null = null;

function getClient(): SupabaseClient | null {
  if (!url || !anonKey) return null;
  if (!client) {
    client = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

/** Normalize a guide URL for storage and retrieval keys. */
export function normalizeGuideUrl(raw: string): string {
  const parsed = new URL(raw);
  parsed.hostname = parsed.hostname.toLowerCase();
  if (parsed.pathname.length > 1) {
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  }
  return parsed.toString();
}

export function isGuideRagAvailable(): boolean {
  return Boolean(url && anonKey && process.env.REPLICATE_API_TOKEN);
}

/** True when guide_chunks already has rows for this URL. */
export async function isGuideIndexed(guideUrl: string): Promise<boolean> {
  const supabase = getClient();
  if (!supabase) return false;
  try {
    const normalized = normalizeGuideUrl(guideUrl);
    const { count, error } = await supabase
      .from("guide_chunks")
      .select("*", { count: "exact", head: true })
      .eq("guide_url", normalized);
    return !error && (count ?? 0) > 0;
  } catch {
    return false;
  }
}

export type IngestResult = {
  indexed: boolean;
  chunkCount: number;
  hubWarning: boolean;
};

/**
 * Fetch, chunk, embed, and store a preferred guide page. Idempotent per URL.
 * Best-effort: returns indexed=false when Supabase/Tavily/embed is unavailable.
 */
export async function ensureGuideIngested(
  rawUrl: string,
  signal?: AbortSignal,
): Promise<IngestResult> {
  const supabase = getClient();
  if (!supabase || !process.env.REPLICATE_API_TOKEN) {
    return { indexed: false, chunkCount: 0, hubWarning: false };
  }

  const guideUrl = normalizeGuideUrl(rawUrl);

  if (await isGuideIndexed(guideUrl)) {
    const { count } = await supabase
      .from("guide_chunks")
      .select("*", { count: "exact", head: true })
      .eq("guide_url", guideUrl);
    return { indexed: true, chunkCount: count ?? 0, hubWarning: false };
  }

  const extracted = await extractGuidePage(guideUrl, signal);
  if (!extracted) {
    return { indexed: false, chunkCount: 0, hubWarning: looksLikeHub(guideUrl) };
  }

  const text = cleanSnippet(extracted.content);
  const hubWarning =
    looksLikeHub(guideUrl) || text.length < MIN_GUIDE_CHARS;
  const chunks = chunkGuide(text);
  if (!chunks.length) {
    return { indexed: false, chunkCount: 0, hubWarning: true };
  }

  let embeddings: number[][];
  try {
    embeddings = await embedTexts(chunks, signal);
  } catch (error) {
    console.error("Guide ingest embed failed:", error);
    return { indexed: false, chunkCount: 0, hubWarning };
  }

  if (embeddings.length !== chunks.length) {
    console.error("Guide ingest embed count mismatch");
    return { indexed: false, chunkCount: 0, hubWarning };
  }

  const rows = chunks.map((chunk_text, chunk_index) => ({
    guide_url: guideUrl,
    chunk_index,
    chunk_text,
    embedding: toVectorString(embeddings[chunk_index]),
  }));

  try {
    const { error } = await supabase.from("guide_chunks").insert(rows);
    if (error) {
      // Race: another request may have inserted first — treat as success if indexed.
      if (await isGuideIndexed(guideUrl)) {
        const { count } = await supabase
          .from("guide_chunks")
          .select("*", { count: "exact", head: true })
          .eq("guide_url", guideUrl);
        return { indexed: true, chunkCount: count ?? chunks.length, hubWarning };
      }
      console.error("Guide ingest insert failed:", error);
      return { indexed: false, chunkCount: 0, hubWarning };
    }
  } catch (error) {
    console.error("Guide ingest insert failed:", error);
    return { indexed: false, chunkCount: 0, hubWarning };
  }

  return { indexed: true, chunkCount: chunks.length, hubWarning };
}
