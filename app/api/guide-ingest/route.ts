import { NextResponse } from "next/server";

import {
  coerceGuideUrlsFromBody,
  cleanGuideUrl,
  normalizeGuideUrlList,
} from "@/lib/guide-urls.js";
import {
  ensureGuideIngested,
  isGuideIndexed,
  isGuideRagAvailable,
} from "@/lib/guide-ingest";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const urls = normalizeGuideUrlList(
    [
      ...searchParams.getAll("url"),
      ...(searchParams.get("urls")
        ? searchParams.get("urls")!.split(",")
        : []),
    ].flatMap((value) => {
      const url = cleanGuideUrl(value);
      return url ? [url] : [];
    }),
  );

  if (!urls.length) {
    return NextResponse.json({ error: "Missing guide URL." }, { status: 400 });
  }

  if (!isGuideRagAvailable()) {
    return NextResponse.json({ available: false, indexed: false, results: [] });
  }

  const results = await Promise.all(
    urls.map(async (url) => ({
      url,
      indexed: await isGuideIndexed(url),
    })),
  );
  const indexedCount = results.filter((row) => row.indexed).length;

  return NextResponse.json({
    available: true,
    indexed: indexedCount === urls.length,
    indexedCount,
    total: urls.length,
    results,
  });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Could not read the request." }, { status: 400 });
  }

  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const urls = coerceGuideUrlsFromBody(record);

  if (!urls.length) {
    return NextResponse.json({ error: "Missing guide URL." }, { status: 400 });
  }

  if (!isGuideRagAvailable()) {
    return NextResponse.json({
      available: false,
      indexed: false,
      indexedCount: 0,
      total: urls.length,
      results: [],
    });
  }

  try {
    const settled = await Promise.all(
      urls.map(async (url) => {
        const result = await ensureGuideIngested(url, request.signal);
        return { url, ...result };
      }),
    );
    const indexedCount = settled.filter((row) => row.indexed).length;
    const hubWarning = settled.some((row) => row.hubWarning);

    return NextResponse.json({
      available: true,
      indexed: indexedCount === urls.length,
      indexedCount,
      total: urls.length,
      hubWarning,
      results: settled,
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
