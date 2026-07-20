import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;

/**
 * Shared server-side Supabase client (anon key, no session).
 * All server modules (caches, logs, RAG, ingest) share this single instance
 * instead of each maintaining its own singleton. Returns `null` when env vars
 * are absent, so every caller degrades gracefully.
 *
 * NOTE: This is separate from `lib/supabase.ts` (`getSupabase`) which is the
 * browser-side client used by `page.tsx` (with session/auth).
 */
export function getServerClient(): SupabaseClient | null {
  if (!url || !anonKey) return null;
  if (!client) {
    client = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
