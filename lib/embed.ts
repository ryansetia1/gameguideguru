import OpenAI from "openai";

import { embedCacheKey, getCachedEmbedding, setCachedEmbedding } from "@/lib/embed-cache";
import { logEmbedCall, type EmbedLogMeta } from "@/lib/embed-log";
import { logTraceEvent } from "@/lib/trace";

const DEFAULT_EMBED_MODEL = "text-embedding-3-large";
const EMBED_DIM = 1024;
// OpenAI embeddings.create accepts up to 2048 inputs, but we keep batches
// moderate to avoid timeouts and to allow per-batch delay for rate-limit safety.
const BATCH_SIZE = 256;
// Defaults tuned for a funded account. Lower EMBED_CONCURRENCY / raise
// EMBED_BATCH_DELAY_MS via env if throttled.
const CONCURRENCY = parsePositiveInt(process.env.EMBED_CONCURRENCY, 5, 8);
const BATCH_DELAY_MS = parsePositiveInt(process.env.EMBED_BATCH_DELAY_MS, 150, 5_000);

function parsePositiveInt(
  raw: string | undefined,
  fallback: number,
  max: number,
): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 1) return fallback;
  return Math.min(Math.floor(value), max);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (!ms) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
        },
        { once: true },
      );
    }
  });
}

function resolveEmbedModel(): string {
  return process.env.EMBED_MODEL || DEFAULT_EMBED_MODEL;
}

let openaiInstance: OpenAI | null = null;

function getOpenAIEmbed(): OpenAI | null {
  const apiKey = process.env.SUMOPOD_API_KEY;
  if (!apiKey) return null;
  if (!openaiInstance) {
    openaiInstance = new OpenAI({
      apiKey,
      baseURL: process.env.SUMOPOD_BASE_URL || "https://ai.sumopod.com/v1",
      maxRetries: 3,
      timeout: 120_000,
    });
  }
  return openaiInstance;
}

async function runEmbedBatch(
  client: OpenAI,
  model: string,
  texts: string[],
): Promise<{ embeddings: number[][]; totalTokens: number | null }> {
  const response = await client.embeddings.create({
    model,
    input: texts,
    dimensions: EMBED_DIM,
  });

  // OpenAI returns data sorted by index, but sort explicitly to be safe.
  const sorted = [...response.data].sort((a, b) => a.index - b.index);
  const embeddings = sorted.map((item) => item.embedding);

  if (embeddings.length !== texts.length) {
    throw new Error(
      `Embed model returned ${embeddings.length} vectors for ${texts.length} texts`,
    );
  }
  return {
    embeddings,
    totalTokens: typeof response.usage?.total_tokens === "number" ? response.usage.total_tokens : null,
  };
}

/**
 * Embed one or more texts via OpenAI-compatible API (Sumopod). Batches
 * automatically (up to 256 per call). Best-effort: throws when the API
 * is unconfigured or the model fails.
 */
export async function embedTexts(
  texts: string[],
  signal?: AbortSignal,
  logMeta?: EmbedLogMeta,
): Promise<number[][]> {
  const client = getOpenAIEmbed();
  const model = resolveEmbedModel();
  if (!client) {
    throw new Error("SUMOPOD_API_KEY is not configured");
  }

  const cleaned = texts.map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean);
  if (!cleaned.length) return [];

  const kind = logMeta?.purpose === "rag_query" ? "embed_query" : "embed_index";
  void logTraceEvent("embed_texts_start", `Embedding ${cleaned.length} text(s) via ${model}`, undefined, { kind, textCount: cleaned.length, model });
  const started = Date.now();
  const out: number[][] = [];
  let inputTokens = 0;
  let hasTokenUsage = false;
  const totalChars = cleaned.reduce((sum, text) => sum + text.length, 0);

  for (let i = 0; i < cleaned.length; i += BATCH_SIZE) {
    if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
    const batch = cleaned.slice(i, i + BATCH_SIZE);
    try {
      const result = await runEmbedBatch(client, model, batch);
      out.push(...result.embeddings);
      if (result.totalTokens != null) {
        inputTokens += result.totalTokens;
        hasTokenUsage = true;
      }
    } catch (batchError) {
      // If batch fails, fall back to bounded concurrency singles.
      console.error("Batch embed failed, falling back to singles:", batchError);
      const singles = await mapPool(batch, CONCURRENCY, async (text) => {
        const result = await runEmbedBatch(client, model, [text]);
        if (result.totalTokens != null) {
          inputTokens += result.totalTokens;
          hasTokenUsage = true;
        }
        return result.embeddings[0];
      });
      out.push(...singles);
    }
    if (i + BATCH_SIZE < cleaned.length && BATCH_DELAY_MS) {
      await sleep(BATCH_DELAY_MS, signal);
    }
  }

  const durationMs = Date.now() - started;
  void logTraceEvent("embed_texts_end", `Embedding complete: ${cleaned.length} text(s) in ${durationMs}ms`, durationMs, {
    kind,
    textCount: cleaned.length,
    inputTokens: hasTokenUsage ? inputTokens : undefined,
  });

  logEmbedCall({
    kind,
    textCount: cleaned.length,
    durationMs,
    sampleText: cleaned[0],
    totalChars,
    inputTokens: hasTokenUsage ? inputTokens : null,
    meta: logMeta,
  });

  return out;
}

/** Embed a rewritten search query with a shared 7-day cache. */
export async function embedQuery(
  query: string,
  signal?: AbortSignal,
  logMeta?: EmbedLogMeta,
): Promise<number[] | null> {
  const key = embedCacheKey(query);
  if (!key) return null;

  const cached = await getCachedEmbedding(key);
  if (cached?.length) {
    void logTraceEvent("embed_query_cache_hit", `Embed query cache hit for: ${query.slice(0, 80)}`, undefined, { cached: true });
    logEmbedCall({
      kind: "embed_query",
      textCount: 1,
      durationMs: 0,
      sampleText: query,
      totalChars: query.length,
      inputTokens: 0,
      cached: true,
      meta: logMeta,
    });
    return cached;
  }

  void logTraceEvent("embed_query_start", `Embedding query: ${query.slice(0, 80)}`, undefined, { query: query.slice(0, 200) });
  const embedStart = Date.now();
  try {
    const [embedding] = await embedTexts(
      [query],
      signal,
      logMeta ? { ...logMeta, purpose: "rag_query" } : { purpose: "rag_query" },
    );
    const embedDuration = Date.now() - embedStart;
    if (!embedding?.length) {
      void logTraceEvent("embed_query_end", `Embed query returned empty`, embedDuration);
      return null;
    }
    void logTraceEvent("embed_query_end", `Embed query complete in ${embedDuration}ms`, embedDuration);
    void setCachedEmbedding(key, embedding);
    return embedding;
  } catch (error) {
    const embedDuration = Date.now() - embedStart;
    void logTraceEvent("embed_query_end", `Embed query failed after ${embedDuration}ms: ${error instanceof Error ? error.message : String(error)}`, embedDuration, { error: true });
    console.error("Query embed failed:", error);
    return null;
  }
}

async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
}

export const EMBEDDING_DIM = EMBED_DIM;
