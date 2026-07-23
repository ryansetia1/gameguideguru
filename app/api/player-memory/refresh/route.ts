import { NextResponse } from "next/server";

import {
  bearerToken,
  createAuthedSupabase,
  getAuthedUser,
  loadPlayerMemoryState,
  refreshPlayerMemory,
} from "@/lib/player-memory-server";
import { runWithTrace } from "@/lib/trace";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const token = bearerToken(request);
  const supabase = createAuthedSupabase(token);
  if (!supabase) {
    return NextResponse.json({ error: "Accounts are not configured." }, { status: 503 });
  }

  const auth = await getAuthedUser(supabase);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const traceId = crypto.randomUUID();
  const result = await runWithTrace(traceId, () =>
    refreshPlayerMemory(supabase, auth.user.id, { manual: true, trigger: "profile_update" }),
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  }

  const state = await loadPlayerMemoryState(supabase, auth.user.id);
  return NextResponse.json({ ok: true, skipped: result.skipped ?? null, state, traceId });
}
