import { renderIcon } from "@/lib/icon";

export const runtime = "nodejs";

// Parametric PNG icon for the web app manifest: /app-icon?size=192[&maskable=1].
export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const size = Math.min(Math.max(Number(params.get("size")) || 512, 16), 1024);
  const maskable = params.get("maskable") === "1";
  return renderIcon(size, maskable);
}
