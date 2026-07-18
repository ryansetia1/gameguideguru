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

  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error: userError } = await supabase.auth.getUser();
  if (userError || !data.user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  if (steamIdFromMetadata(data.user.user_metadata) === steamId) {
    return NextResponse.json({ ok: true, steamId, alreadyLinked: true });
  }

  const { error: linkError } = await supabase.auth.updateUser({
    data: { steam_id: steamId },
  });
  if (linkError) {
    console.error("Steam link failed:", linkError.message);
    return NextResponse.json({ ok: false, error: "link_failed" }, { status: 500 });
  }

  const response = NextResponse.json({ ok: true, steamId });
  return response;
}
