import { NextResponse } from "next/server";

import { mapGames } from "@/lib/games";

export const runtime = "nodejs";

const TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const IGDB_GAMES_URL = "https://api.igdb.com/v4/games";

// IGDB app access tokens live ~60 days; cache in-memory per server instance to
// avoid a token round-trip on every keystroke.
// ponytail: single-instance cache, no cross-instance sharing; fine for a proxy.
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(
  clientId: string,
  clientSecret: string,
): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  const url = new URL(TWITCH_TOKEN_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("client_secret", clientSecret);
  url.searchParams.set("grant_type", "client_credentials");

  const response = await fetch(url, {
    method: "POST",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    throw new Error(`Twitch token request failed with status ${response.status}`);
  }

  const data: unknown = await response.json();
  if (
    !data ||
    typeof data !== "object" ||
    !("access_token" in data) ||
    typeof (data as { access_token: unknown }).access_token !== "string"
  ) {
    throw new Error("Twitch token response was malformed");
  }

  const value = (data as { access_token: string }).access_token;
  const expiresIn =
    "expires_in" in data &&
    typeof (data as { expires_in: unknown }).expires_in === "number"
      ? (data as { expires_in: number }).expires_in
      : 3600;
  cachedToken = { value, expiresAt: Date.now() + expiresIn * 1000 };
  return value;
}

export async function GET(request: Request) {
  const query = (new URL(request.url).searchParams.get("q") ?? "")
    .trim()
    .slice(0, 100);

  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  // ponytail: no credentials (or any failure) => autocomplete silently off, the
  // field still works as free text.
  if (!clientId || !clientSecret) {
    return NextResponse.json({ games: [], available: false });
  }

  if (query.length < 2) {
    return NextResponse.json({ games: [], available: true });
  }

  try {
    const token = await getAccessToken(clientId, clientSecret);
    // Apicalypse query; neutralise quotes/backslashes in the search term.
    const term = query.replace(/["\\]/g, " ");
    const body = `search "${term}"; fields name, first_release_date; limit 8;`;

    const response = await fetch(IGDB_GAMES_URL, {
      method: "POST",
      headers: {
        "Client-ID": clientId,
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      body,
      signal: AbortSignal.timeout(8_000),
    });

    if (!response.ok) {
      throw new Error(`IGDB search failed with status ${response.status}`);
    }

    const payload: unknown = await response.json();
    return NextResponse.json({ games: mapGames(payload), available: true });
  } catch (error) {
    console.error("Game search failed:", error);
    return NextResponse.json({ games: [], available: false });
  }
}
