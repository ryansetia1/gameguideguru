import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getAuthOrigin } from "@/lib/origin";
import {
  OPENID_STATE_COOKIE,
  safeEqual,
  verifySteamOpenId,
} from "@/lib/steam.js";
import {
  signSteamSession,
  STEAM_SESSION_COOKIE,
  STEAM_SESSION_MAX_AGE,
} from "@/lib/steam-session.js";

export const runtime = "nodejs";

function clearOpenIdState(res: NextResponse, secure: boolean) {
  res.cookies.set(OPENID_STATE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 0,
  });
}

export async function GET(request: Request) {
  const origin = getAuthOrigin(request);
  const secure = origin.startsWith("https");
  const url = new URL(request.url);
  const incoming = url.searchParams;

  const fail = () => {
    const res = NextResponse.redirect(`${origin}/?steam=error`);
    clearOpenIdState(res, secure);
    return res;
  };

  const stateParam = incoming.get("s") ?? "";
  const jar = await cookies();
  const stateCookie = jar.get(OPENID_STATE_COOKIE)?.value ?? "";
  if (!stateParam || !stateCookie || !safeEqual(stateCookie, stateParam)) {
    return fail();
  }

  const returnTo = incoming.get("openid.return_to") ?? "";
  const expectedPrefix = `${origin}/api/steam/callback`;
  if (!returnTo.startsWith(expectedPrefix)) {
    return fail();
  }

  const openidParams: Record<string, string> = {};
  incoming.forEach((value, key) => {
    if (key.startsWith("openid.")) openidParams[key] = value;
  });

  const steamId = await verifySteamOpenId(openidParams);
  if (!steamId) {
    console.error("Steam OpenID verification failed", {
      returnTo,
      mode: openidParams["openid.mode"],
    });
    return fail();
  }

  const response = NextResponse.redirect(`${origin}/?steam=linked`);
  clearOpenIdState(response, secure);
  response.cookies.set(STEAM_SESSION_COOKIE, signSteamSession(steamId), {
    httpOnly: true,
    secure,
    sameSite: "lax",
    maxAge: STEAM_SESSION_MAX_AGE,
    path: "/",
  });

  return response;
}
