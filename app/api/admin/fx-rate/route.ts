import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { isAdminEmail } from "@/lib/admin-constants";
import { getUsdToIdrRate } from "@/lib/admin-fx-server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json({ error: "Server not configured" }, { status: 501 });
  }

  const authClient = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userError } = await authClient.auth.getUser(token);
  if (userError || !isAdminEmail(userData.user?.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const rate = await getUsdToIdrRate();
    return NextResponse.json(rate);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load FX rate" },
      { status: 502 },
    );
  }
}
