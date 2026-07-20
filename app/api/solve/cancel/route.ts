import { NextResponse } from "next/server";
import Replicate from "replicate";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { predictionId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const authHeader = request.headers.get("Authorization");
  if (!authHeader) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { predictionId } = body;
  if (!predictionId) {
    return NextResponse.json({ error: "Missing predictionId" }, { status: 400 });
  }

  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "Replicate token missing" }, { status: 500 });
  }

  try {
    const replicate = new Replicate({ auth: token });
    await replicate.predictions.cancel(predictionId);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Cancel prediction failed:", err);
    return NextResponse.json({ error: "Failed to cancel prediction" }, { status: 500 });
  }
}
