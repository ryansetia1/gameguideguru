import { NextResponse } from "next/server";

import { discoverGamefaqsBundleResolved } from "@/lib/gamefaqs-discover";
import { cleanGuideUrl } from "@/lib/guide-urls.js";
import { runWithTrace, logTraceEvent } from "@/lib/trace";

export const runtime = "nodejs";

// ponytail: in-memory per-process cooldown so a hammering `?refresh=1` loop can't
// re-run the full Tavily discovery fan-out on every hit. Resets on cold start and
// is per-instance (serverless), but caps a single-instance drain cheaply. Upgrade
// path: durable rate-limit if abuse spreads across instances.
const REFRESH_COOLDOWN_MS = 30_000;
const lastRefresh = new Map<string, number>();

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const preferredUrl = cleanGuideUrl(searchParams.get("url"));

  if (!preferredUrl) {
    return NextResponse.json({ error: "Missing guide URL." }, { status: 400 });
  }

  try {
    let refresh = searchParams.get("refresh") === "1";
    if (refresh) {
      const now = Date.now();
      const previous = lastRefresh.get(preferredUrl) ?? 0;
      if (now - previous < REFRESH_COOLDOWN_MS) {
        // Too soon — serve the cheap cache-first path instead of re-fanning out.
        refresh = false;
      } else {
        lastRefresh.set(preferredUrl, now);
      }
    }
    const traceId = crypto.randomUUID();
    const preview = await runWithTrace(traceId, async () => {
      void logTraceEvent("discovery_start", `Checking GameFAQs bundle: ${preferredUrl}`, undefined, { url: preferredUrl });
      const result = await discoverGamefaqsBundleResolved(preferredUrl, request.signal, {
        refresh,
      });
      void logTraceEvent("discovery_complete", `Finished checking bundle`);
      return result;
    });
    return NextResponse.json(preview);
  } catch (error) {
    const traceId = crypto.randomUUID();
    void runWithTrace(traceId, () => {
      void logTraceEvent("discovery_error", `Error checking bundle: ${error instanceof Error ? error.message : "Unknown error"}`);
    });
    console.error("Guide bundle preview failed:", error);
    const timedOut =
      error instanceof Error &&
      (error.name === "AbortError" || error.name === "TimeoutError");
    return NextResponse.json(
      { error: timedOut ? "Preview took too long. Try again." : "Couldn't preview that guide." },
      { status: timedOut ? 504 : 502 },
    );
  }
}
