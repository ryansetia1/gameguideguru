import { NextResponse } from "next/server";

import { mapGames, prepareAutocompleteGames } from "@/lib/games";

export const runtime = "nodejs";

const TGDB_SEARCH_URL = "https://api.thegamesdb.net/v1/Games/ByGameName";
const MAX_RESULTS = 8;

export async function GET(request: Request) {
  const query = (new URL(request.url).searchParams.get("q") ?? "")
    .trim()
    .slice(0, 100);

  const apiKey = process.env.THEGAMESDB_API_KEY;
  // ponytail: no key (or any failure) => autocomplete silently off, the field
  // still works as free text. Provider swap (IGDB later) is this file only.
  if (!apiKey) {
    return NextResponse.json({ games: [], available: false });
  }

  if (query.length < 2) {
    return NextResponse.json({ games: [], available: true });
  }

  try {
    const url = new URL(TGDB_SEARCH_URL);
    url.searchParams.set("apikey", apiKey);
    url.searchParams.set("name", query);
    url.searchParams.set("fields", "release_date,platform");
    url.searchParams.set("include", "boxart,platform");

    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });

    if (!response.ok) {
      throw new Error(`TheGamesDB search failed with status ${response.status}`);
    }

    const payload: unknown = await response.json();
    return NextResponse.json({
      games: prepareAutocompleteGames(mapGames(payload)).slice(0, MAX_RESULTS),
      available: true,
    });
  } catch (error) {
    console.error("Game search failed:", error);
    return NextResponse.json({ games: [], available: false });
  }
}
