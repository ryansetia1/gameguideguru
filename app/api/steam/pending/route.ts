import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { STEAM_SESSION_COOKIE, verifySteamSession } from "@/lib/steam-session.js";

export const runtime = "nodejs";

export async function GET() {
  const cookieStore = await cookies();
  const steamId = verifySteamSession(cookieStore.get(STEAM_SESSION_COOKIE)?.value);
  if (!steamId) {
    return NextResponse.json({ steamId: null });
  }
  return NextResponse.json({ steamId });
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(STEAM_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return response;
}
