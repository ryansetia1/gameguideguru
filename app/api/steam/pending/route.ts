import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const PENDING_COOKIE = "pending_steam_id";

export async function GET() {
  const cookieStore = await cookies();
  const steamId = cookieStore.get(PENDING_COOKIE)?.value ?? "";
  if (!/^\d{5,}$/.test(steamId)) {
    return NextResponse.json({ steamId: null });
  }
  return NextResponse.json({ steamId });
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete(PENDING_COOKIE);
  return NextResponse.json({ ok: true });
}
