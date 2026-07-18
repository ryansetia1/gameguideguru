import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { steamIdFromMetadata } from "@/lib/steam.js";
import { STEAM_SESSION_COOKIE, verifySteamSession } from "@/lib/steam-session.js";

export const runtime = "nodejs";

function bearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
}

export async function POST(request: Request) {
  const jar = await cookies();
  const steamId = verifySteamSession(jar.get(STEAM_SESSION_COOKIE)?.value);
  if (!steamId) {
    return NextResponse.json({ ok: false, error: "no_steam_session" }, { status: 400 });
  }

  const token = bearerToken(request);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !anonKey) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // ponytail: bearer-only is enough for getUser() but updateUser() needs
  // setSession — see docs/troubleshooting.md (Connect Steam).
  let refreshToken = "";
  try {
    const body = await request.json();
    refreshToken =
      typeof body?.refresh_token === "string" ? body.refresh_token.trim() : "";
  } catch {
  }
  if (!refreshToken) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
    access_token: token,
    refresh_token: refreshToken,
  });
  if (sessionError || !sessionData.user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const user = sessionData.user;
  if (steamIdFromMetadata(user.user_metadata) === steamId) {
    return NextResponse.json({ ok: true, steamId, alreadyLinked: true });
  }

  const { error: linkError } = await supabase.auth.updateUser({
    data: { steam_id: steamId },
  });
  if (linkError) {
    console.error("Steam link failed:", linkError.message);
    return NextResponse.json({ ok: false, error: "link_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, steamId });
}
