import { logLlmCall } from "@/lib/llm-log";

export type EmbedLogMeta = {
  purpose: "ingest" | "rag_query";
  game?: string;
  platform?: string;
  userId?: string | null;
  guideUrl?: string;
  bundleKey?: string;
};

function resolveEmbedModel(): string {
  return process.env.EMBED_MODEL || "text-embedding-3-large";
}

/** Best-effort embed audit log (file + llm_calls when Supabase is set). */
export function logEmbedCall(input: {
  kind: "embed_index" | "embed_query";
  textCount: number;
  durationMs: number;
  sampleText?: string;
  cached?: boolean;
  meta?: EmbedLogMeta;
}): void {
  const meta = input.meta ?? { purpose: input.kind === "embed_query" ? "rag_query" : "ingest" };
  const prompt = JSON.stringify({
    purpose: meta.purpose,
    textCount: input.textCount,
    guideUrl: meta.guideUrl ?? null,
    bundleKey: meta.bundleKey ?? null,
    cached: Boolean(input.cached),
    sample: input.sampleText?.slice(0, 400) ?? "",
  });

  logLlmCall({
    kind: input.kind,
    model: resolveEmbedModel(),
    system: meta.purpose,
    prompt,
    response: JSON.stringify({
      vectors: input.textCount,
      dim: 1024,
      cached: Boolean(input.cached),
    }),
    durationMs: input.durationMs,
    game: meta.game,
    platform: meta.platform,
    userId: meta.userId,
  });
}
