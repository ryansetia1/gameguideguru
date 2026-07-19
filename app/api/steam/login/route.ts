import { NextResponse } from "next/server";

import { getAuthOrigin } from "@/lib/origin";
import {
  buildSteamLoginUrl,
  newOpenIdState,
  OPENID_STATE_COOKIE,
  OPENID_STATE_MAX_AGE,
} from "@/lib/steam.js";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const origin = getAuthOrigin(request);
  const secure = origin.startsWith("https");
  const state = newOpenIdState();
  // "signin" => bridge to a Supabase account (logged-out user); "link" (default)
  // => attach Steam to the signed-in account (sidebar "Connect Steam").
  const intent =
    new URL(request.url).searchParams.get("intent") === "signin" ? "signin" : "link";
  const response = NextResponse.redirect(buildSteamLoginUrl(origin, state, intent));
  response.cookies.set(OPENID_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: OPENID_STATE_MAX_AGE,
  });
  return response;
}
