import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { fetchSteamProfile } from "@/lib/steam.js";
import { syntheticEmail, syntheticPassword } from "@/lib/steam-account.js";
import { STEAM_SESSION_COOKIE, verifySteamSession } from "@/lib/steam-session.js";

export const runtime = "nodejs";

// "Sign in with Steam" bridge. The gg_steam cookie already holds a Steam-verified
// SteamID (set by the OpenID callback). Here we mint/reuse a Supabase user keyed
// by that SteamID (reserved email namespace, so it can never merge with a Google
// account) and return a session for the client to adopt. Needs the service-role
// key: email confirmation is on, so a synthetic-email signup can't self-confirm.
export async function POST() {
  const jar = await cookies();
  const steamId = verifySteamSession(jar.get(STEAM_SESSION_COOKIE)?.value);
  if (!steamId) {
    return NextResponse.json({ ok: false, error: "no_steam_session" }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) {
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 501 });
  }

  const email = syntheticEmail(steamId);
  const password = syntheticPassword(steamId);

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const profile = await fetchSteamProfile(steamId);

  // Find-or-create. createUser errors if the account already exists (a returning
  // Steam user) — that's fine, we just sign in below. ponytail: name/avatar are
  // set on first login only; not refreshed on return (upgrade: updateUserById).
  const { error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      steam_id: steamId,
      display_name: profile.name,
      avatar_url: profile.avatar,
      login_via: "steam",
    },
    app_metadata: { provider: "steam", providers: ["steam"] },
  });
  if (createError && !/registered|already/i.test(createError.message)) {
    console.error("Steam bridge createUser failed:", createError.message);
    return NextResponse.json({ ok: false, error: "create_failed" }, { status: 500 });
  }

  const anon = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    console.error("Steam bridge sign-in failed:", error?.message);
    return NextResponse.json({ ok: false, error: "signin_failed" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    steamId,
  });
}
