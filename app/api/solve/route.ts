import { NextResponse } from "next/server";

import { summarize } from "@/lib/replicate";
import { searchWeb } from "@/lib/tavily";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Permintaan tidak dapat dibaca." },
      { status: 400 },
    );
  }

  const query =
    body && typeof body === "object" && "query" in body
      ? body.query
      : undefined;

  if (typeof query !== "string" || query.trim().length < 3) {
    return NextResponse.json(
      { error: "Ceritakan kendalamu dalam minimal 3 karakter." },
      { status: 400 },
    );
  }

  if (query.length > 300) {
    return NextResponse.json(
      { error: "Pertanyaan terlalu panjang. Maksimal 300 karakter." },
      { status: 400 },
    );
  }

  if (!process.env.TAVILY_API_KEY || !process.env.REPLICATE_API_TOKEN) {
    return NextResponse.json(
      { error: "Server belum memiliki API key yang diperlukan." },
      { status: 503 },
    );
  }

  try {
    const question = query.trim();
    const sources = await searchWeb(
      `${question} video game walkthrough guide strategy`,
    );

    if (sources.length === 0) {
      return NextResponse.json(
        { error: "Belum ada panduan tepercaya yang ditemukan." },
        { status: 404 },
      );
    }

    const summary = await summarize(question, sources);
    return NextResponse.json({
      summary,
      sources: sources.map(({ title, url }) => ({ title, url })),
    });
  } catch (error) {
    console.error("Guide generation failed:", error);
    const timedOut =
      error instanceof Error &&
      (error.name === "AbortError" || error.name === "TimeoutError");

    return NextResponse.json(
      {
        error: timedOut
          ? "Pencarian memakan waktu terlalu lama. Coba lagi."
          : "Panduan belum dapat dibuat. Coba beberapa saat lagi.",
      },
      { status: timedOut ? 504 : 502 },
    );
  }
}
