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

// Popup flow (mobile PWA): the callback lands in a `window.open` browser tab, not
// the PWA window. Post the result to the opener (the PWA) and close, so the whole
// sign-in stays inside GGG. `intent`/`origin` are server-controlled, not user text.
function popupResult(origin: string, payload: string) {
  const target = JSON.stringify(origin);
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><title>Steam</title><script>` +
      `try{if(window.opener)window.opener.postMessage(${payload},${target});}catch(e){}` +
      `window.close();</script>` +
      `<p style="font-family:system-ui;padding:24px">You can close this window.</p>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export async function GET(request: Request) {
  const origin = getAuthOrigin(request);
  const secure = origin.startsWith("https");
  const url = new URL(request.url);
  const incoming = url.searchParams;
  const popup = incoming.get("p") === "1";

  const fail = () => {
    const res = popup
      ? popupResult(origin, `{gg:"steam",error:true}`)
      : NextResponse.redirect(`${origin}/?steam=error`);
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

  // "signin" returns to the login-bridge handler; "link" (default) to the
  // attach-to-account handler. Both carry the same verified gg_steam cookie.
  const intent = incoming.get("i") === "signin" ? "signin" : "linked";
  const response = popup
    ? popupResult(origin, `{gg:"steam",intent:${JSON.stringify(intent)}}`)
    : NextResponse.redirect(`${origin}/?steam=${intent}`);
  clearOpenIdState(response, secure);
  try {
    response.cookies.set(STEAM_SESSION_COOKIE, signSteamSession(steamId), {
      httpOnly: true,
      secure,
      sameSite: "lax",
      maxAge: STEAM_SESSION_MAX_AGE,
      path: "/",
    });
  } catch (caught) {
    console.error("Steam session cookie failed:", caught);
    return fail();
  }

  return response;
}
