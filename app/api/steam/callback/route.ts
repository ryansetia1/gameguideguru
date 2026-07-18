import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { verifySteamOpenId } from "@/lib/steam.js";

export const runtime = "nodejs";

const PENDING_COOKIE = "pending_steam_id";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const returnTo = `${origin}/api/steam/callback`;
  const params = Object.fromEntries(url.searchParams.entries());

  const steamId = await verifySteamOpenId(params, origin, returnTo);
  if (!steamId) {
    return NextResponse.redirect(`${origin}/?steam=error`);
  }

  const cookieStore = await cookies();
  cookieStore.set(PENDING_COOKIE, steamId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return NextResponse.redirect(`${origin}/?steam=linked`);
}
