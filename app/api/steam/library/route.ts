import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { fetchOwnedGames, steamIdFromMetadata } from "@/lib/steam.js";

export const runtime = "nodejs";

function bearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
}

export async function GET(request: Request) {
  const token = bearerToken(request);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const steamKey = process.env.STEAM_API_KEY;

  if (!token || !url || !anonKey) {
    return NextResponse.json({ games: [], connected: false, available: false }, { status: 401 });
  }

  if (!steamKey) {
    return NextResponse.json({ games: [], connected: false, available: false });
  }

  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return NextResponse.json({ games: [], connected: false, available: true }, { status: 401 });
  }

  const steamId = steamIdFromMetadata(data.user.user_metadata);
  if (!steamId) {
    return NextResponse.json({ games: [], connected: false, available: true });
  }

  try {
    const games = await fetchOwnedGames(steamId, steamKey);
    return NextResponse.json({ games, connected: true, available: true });
  } catch (caught) {
    console.error("Steam library fetch failed:", caught);
    return NextResponse.json({
      games: [],
      connected: true,
      available: true,
      error: "fetch_failed",
    });
  }
}
