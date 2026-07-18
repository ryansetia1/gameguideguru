import { NextResponse } from "next/server";

import { buildSteamLoginUrl } from "@/lib/steam.js";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  return NextResponse.redirect(buildSteamLoginUrl(origin));
}
