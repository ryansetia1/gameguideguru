import { NextResponse } from "next/server";

import { ensureGuideIngested, isGuideIndexed, isGuideRagAvailable } from "@/lib/guide-ingest";

export const runtime = "nodejs";

function cleanUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim().slice(0, 300);
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.toString();
  } catch {
    return "";
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const preferredUrl = cleanUrl(searchParams.get("url"));

  if (!preferredUrl) {
    return NextResponse.json({ error: "Missing guide URL." }, { status: 400 });
  }

  if (!isGuideRagAvailable()) {
    return NextResponse.json({ available: false, indexed: false });
  }

  const indexed = await isGuideIndexed(preferredUrl);
  return NextResponse.json({ available: true, indexed });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Could not read the request." }, { status: 400 });
  }

  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const preferredUrl = cleanUrl(record.preferredUrl);

  if (!preferredUrl) {
    return NextResponse.json({ error: "Missing guide URL." }, { status: 400 });
  }

  if (!isGuideRagAvailable()) {
    return NextResponse.json({ available: false, indexed: false });
  }

  try {
    const result = await ensureGuideIngested(preferredUrl, request.signal);
    return NextResponse.json({
      available: true,
      indexed: result.indexed,
      chunkCount: result.chunkCount,
      hubWarning: result.hubWarning,
    });
  } catch (error) {
    console.error("Guide ingest failed:", error);
    const timedOut =
      error instanceof Error &&
      (error.name === "AbortError" || error.name === "TimeoutError");
    return NextResponse.json(
      { error: timedOut ? "Indexing took too long. Try again." : "Couldn't index that guide." },
      { status: timedOut ? 504 : 502 },
    );
  }
}
