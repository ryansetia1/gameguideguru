import { NextResponse } from "next/server";

import {
  bearerToken,
  createAuthedSupabase,
  getAuthedUser,
  loadAllPlayerGameMemory,
  loadPlayerMemoryState,
} from "@/lib/player-memory-server";

export const runtime = "nodejs";

/** Read-only state for debugging; profile UI uses the browser client directly. */
export async function GET(request: Request) {
  const token = bearerToken(request);
  const supabase = createAuthedSupabase(token);
  if (!supabase) {
    return NextResponse.json({ error: "Accounts are not configured." }, { status: 503 });
  }

  const auth = await getAuthedUser(supabase);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const state = await loadPlayerMemoryState(supabase, auth.user.id);
  const games = state ? await loadAllPlayerGameMemory(supabase, auth.user.id) : [];

  return NextResponse.json({
    enabled: Boolean(state),
    state,
    games,
  });
}
