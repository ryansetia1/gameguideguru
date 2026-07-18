import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Guides change slowly, so a long TTL maximises cache hits (the point is saving
// Tavily credits). Tune here. ponytail: no eviction job — stale rows are simply
// overwritten on the next miss.
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

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

/**
 * Read a cached search result. Best-effort: returns null when Supabase is
 * unconfigured/unreachable, the key is missing, or the row is past its TTL.
 */
export async function getCachedSearch(key: string): Promise<unknown | null> {
  const supabase = getClient();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("search_cache")
      .select("results, created_at")
      .eq("cache_key", key)
      .maybeSingle();
    if (error || !data) return null;

    const createdAt = new Date((data as { created_at: string }).created_at).getTime();
    if (Number.isNaN(createdAt) || Date.now() - createdAt > TTL_MS) return null;

    return (data as { results: unknown }).results;
  } catch {
    return null;
  }
}

/** Write a search result to the cache. Best-effort; failures never block. */
export async function setCachedSearch(key: string, results: unknown): Promise<void> {
  const supabase = getClient();
  if (!supabase) return;
  try {
    await supabase
      .from("search_cache")
      .upsert({ cache_key: key, results, created_at: new Date().toISOString() });
  } catch {
    // Swallowed on purpose: the answer must not depend on the cache.
  }
}
