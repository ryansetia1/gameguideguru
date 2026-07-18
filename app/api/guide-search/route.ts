import { NextResponse } from "next/server";

import { discoverGuideLinks } from "@/lib/tavily";

export const runtime = "nodejs";

function cleanText(value: string | null, maxLength: number): string {
  return (value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const game = cleanText(url.searchParams.get("game"), 120);
  const platform = cleanText(url.searchParams.get("platform"), 80);
  const q = cleanText(url.searchParams.get("q"), 120);

  if (!game && !q) {
    return NextResponse.json({ results: [], available: true });
  }

  try {
    const results = await discoverGuideLinks(game, platform, q);
    return NextResponse.json({
      results: results.map((hit) => ({
        title: hit.title,
        url: hit.url,
        snippet: hit.content.slice(0, 220),
      })),
      available: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("No search provider configured")) {
      return NextResponse.json({ results: [], available: false });
    }
    console.error("Guide search failed:", error);
    return NextResponse.json({ results: [], available: true });
  }
}
