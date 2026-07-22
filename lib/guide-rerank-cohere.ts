import { logTraceEvent } from "@/lib/trace";

const COHERE_URL = "https://api.cohere.com/v2/rerank";

export type RerankResult = {
  // Chunk indices best-first.
  order: number[];
  // Per-chunk relevance, aligned to the original chunk order.
  scores: number[];
  // Does any chunk actually cover the question? Gates the RAG hit decision.
  relevant: boolean;
};

/**
 * Cohere Rerank adapter — dedicated cross-encoder, same {order, scores, relevant}
 * shape as any rerank provider so `guide-rag.ts` can swap with no other change.
 * Opt-in: only runs when COHERE_API_KEY is set. Best-effort — returns null on any
 * error (429 rate-limit on trial keys, timeout, network) so the caller falls back
 * to the cosine order + GUIDE_HIT.
 *
 * Emits trace events so the admin dashboard shows the whole story per trace:
 * `rag_rerank_start` (using Cohere) → `rag_rerank_ok` or `rag_rerank_error`
 * (with `rateLimited` / `kind` flags so a 429 or timeout is obvious).
 *
 * `relevant` = top relevance_score >= COHERE_RELEVANCE_MIN (default 0.3). Cohere
 * scores are 0..1; calibrate the cutoff with `npm run eval:rag`.
 */
export async function cohereRerankChunks(input: {
  question: string;
  chunks: string[];
  signal?: AbortSignal;
}): Promise<RerankResult | null> {
  const apiKey = process.env.COHERE_API_KEY;
  if (!apiKey) return null;
  if (input.chunks.length <= 1) return null;

  const model = process.env.COHERE_RERANK_MODEL || "rerank-v3.5";
  const parsedMin = Number(process.env.COHERE_RELEVANCE_MIN);
  const relevanceMin = Number.isFinite(parsedMin) ? parsedMin : 0.3;
  const timeout = AbortSignal.timeout(15_000);
  const signal = input.signal ? AbortSignal.any([timeout, input.signal]) : timeout;

  const started = Date.now();
  void logTraceEvent(
    "rag_rerank_start",
    `Reranking ${input.chunks.length} chunks via Cohere ${model}`,
    undefined,
    { provider: "cohere", model, chunkCount: input.chunks.length },
  );

  try {
    const res = await fetch(COHERE_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        query: input.question,
        // Cohere caps per-doc tokens internally; trim to keep the request small.
        documents: input.chunks.map((c) => c.slice(0, 4000)),
        top_n: input.chunks.length,
      }),
      signal,
    });
    const latencyMs = Date.now() - started;

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      const rateLimited = res.status === 429;
      console.error("Cohere rerank failed:", res.status, detail.slice(0, 200));
      void logTraceEvent(
        "rag_rerank_error",
        rateLimited
          ? "Cohere rate-limited (429) — using cosine instead"
          : `Cohere rerank HTTP ${res.status} — using cosine instead`,
        latencyMs,
        { provider: "cohere", status: res.status, rateLimited },
      );
      return null;
    }

    const data = (await res.json()) as {
      results?: { index?: number; relevance_score?: number }[];
    };
    const results = Array.isArray(data?.results) ? data.results : null;

    const scores = new Array<number>(input.chunks.length).fill(0);
    const order: number[] = [];
    for (const row of results ?? []) {
      const i = Number(row?.index);
      const s = Number(row?.relevance_score);
      if (Number.isInteger(i) && i >= 0 && i < input.chunks.length) {
        if (Number.isFinite(s)) scores[i] = s;
        order.push(i);
      }
    }
    if (!order.length) {
      void logTraceEvent(
        "rag_rerank_error",
        "Cohere returned no usable results — using cosine instead",
        latencyMs,
        { provider: "cohere", empty: true },
      );
      return null;
    }

    const topScore = Number(results?.[0]?.relevance_score) || 0;
    const relevant = topScore >= relevanceMin;
    void logTraceEvent(
      "rag_rerank_ok",
      `Cohere rerank done: top=${topScore.toFixed(3)}, relevant=${relevant}`,
      latencyMs,
      { provider: "cohere", model, topScore, relevant, chunkCount: input.chunks.length },
    );
    return { order, scores, relevant };
  } catch (error) {
    const latencyMs = Date.now() - started;
    // A user Stop aborts the fetch too — that's not a Cohere failure, don't log noise.
    if (input.signal?.aborted) return null;
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    const detail = error instanceof Error ? error.message : String(error);
    console.error("Cohere rerank error, keeping cosine order:", error);
    void logTraceEvent(
      "rag_rerank_error",
      `Cohere rerank ${timedOut ? "timed out" : "network error"} — using cosine instead`,
      latencyMs,
      { provider: "cohere", kind: timedOut ? "timeout" : "network", detail: detail.slice(0, 200) },
    );
    return null;
  }
}
