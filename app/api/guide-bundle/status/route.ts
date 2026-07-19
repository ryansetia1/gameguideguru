import { NextResponse } from "next/server";

import { getBundleIndexStatus } from "@/lib/guide-ingest";
import { cleanGuideUrl } from "@/lib/guide-urls.js";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const preferredUrl = cleanGuideUrl(searchParams.get("url"));

  if (!preferredUrl) {
    return NextResponse.json({ error: "Missing guide URL." }, { status: 400 });
  }

  const status = await getBundleIndexStatus(preferredUrl);
  if (!status) {
    return NextResponse.json({ indexed: false, pages: [], pagesIndexed: 0, chunkCount: 0 });
  }

  return NextResponse.json({ indexed: status.pagesIndexed > 0, ...status });
}
