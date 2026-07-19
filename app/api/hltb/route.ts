import { NextResponse } from "next/server";

import { fetchHltb } from "@/lib/hltb-cache.js";

export const runtime = "nodejs";

const MAX_TITLE_LEN = 200;

// Thin cache-backed proxy for HowLongToBeat playtime on the game card. Keyed by
// normalized title; optional Steam appId improves matching on a cache miss.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const title = (searchParams.get("title") ?? "").trim().slice(0, MAX_TITLE_LEN);
  const appId = (searchParams.get("appId") ?? "").trim();

  if (!title) {
    return NextResponse.json({ error: "Title required." }, { status: 400 });
  }
  if (appId && !/^\d+$/.test(appId)) {
    return NextResponse.json({ error: "Invalid appId." }, { status: 400 });
  }

  try {
    const { data, fetchedAt, pending } = await fetchHltb(title, appId);
    return NextResponse.json(
      { data, fetchedAt, pending },
      { headers: { "Cache-Control": "public, max-age=3600" } },
    );
  } catch (err) {
    console.error("HLTB fetch failed:", err);
    return NextResponse.json(
      { error: "Could not reach HowLongToBeat." },
      { status: 502 },
    );
  }
}
