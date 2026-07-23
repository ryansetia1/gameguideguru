import type { TraceEventRow } from "./admin-traces";

export type ApiSpendKey =
  | "tavily"
  | "replicate"
  | "cohere"
  | "sumopod_embed"
  | "sumopod_resolve"
  | "sumopod_summarize";

export type ApiSpendLine = {
  key: ApiSpendKey;
  label: string;
  count: number;
};

export type ApiSpendSummary = {
  counts: Record<ApiSpendKey, number>;
  lines: ApiSpendLine[];
  total: number;
};

const REPLICATE_KINDS = new Set(["rewrite", "summarize", "censor"]);

const SPEND_LABELS: Record<ApiSpendKey, string> = {
  tavily: "Tavily",
  replicate: "Replicate",
  cohere: "Cohere",
  sumopod_embed: "Sumopod embed",
  sumopod_resolve: "Sumopod resolve",
  sumopod_summarize: "Sumopod summarize",
};

const SPEND_KEYS = Object.keys(SPEND_LABELS) as ApiSpendKey[];

function emptyCounts(): Record<ApiSpendKey, number> {
  return {
    tavily: 0,
    replicate: 0,
    cohere: 0,
    sumopod_embed: 0,
    sumopod_resolve: 0,
    sumopod_summarize: 0,
  };
}

/** Map Sumopod billable LLM kinds. Replicate rewrite/summarize/censor stay under `replicate`. */
function sumopodSpendKey(kind: string): ApiSpendKey | null {
  if (kind === "embed_index" || kind === "embed_query") return "sumopod_embed";
  return null;
}

function linesFromCounts(counts: Record<ApiSpendKey, number>): ApiSpendLine[] {
  return SPEND_KEYS.map((key) => ({ key, label: SPEND_LABELS[key], count: counts[key] })).filter(
    (line) => line.count > 0,
  );
}

/** Billable Tavily + Cohere + Sumopod embed calls from trace events. */
export function countApiSpendFromTrace(events: TraceEventRow[]): Record<ApiSpendKey, number> {
  const counts = emptyCounts();
  let embedQueryBillable = false;

  for (const event of events) {
    switch (event.event_type) {
      case "tavily_search_start":
      case "discovery_search_query":
      case "tavily_extract_start":
      case "discovery_extract_start":
        counts.tavily += 1;
        break;
      case "rag_rerank_start":
        counts.cohere += 1;
        break;
      case "embed_query_start":
        embedQueryBillable = true;
        break;
      case "embed_query_cache_hit":
        embedQueryBillable = false;
        break;
      case "embed_query_end":
        if (embedQueryBillable) counts.sumopod_embed += 1;
        embedQueryBillable = false;
        break;
      case "embed_texts_start":
        counts.sumopod_embed += 1;
        break;
      default:
        break;
    }
  }

  return counts;
}

/** Replicate + Sumopod calls from `llm_calls` rows. */
export function countApiSpendFromLlm(calls: Array<{ kind: string }>): Record<ApiSpendKey, number> {
  const counts = emptyCounts();
  for (const call of calls) {
    if (REPLICATE_KINDS.has(call.kind)) counts.replicate += 1;
    const sumopodKey = sumopodSpendKey(call.kind);
    if (sumopodKey) counts[sumopodKey] += 1;
  }
  return counts;
}

export function buildApiSpend(
  traceEvents: TraceEventRow[] | undefined,
  llmCalls: Array<{ kind: string }> | undefined,
): ApiSpendSummary | undefined {
  const fromTrace = countApiSpendFromTrace(traceEvents ?? []);
  const fromLlm = countApiSpendFromLlm(llmCalls ?? []);

  const counts = emptyCounts();
  counts.tavily = fromTrace.tavily;
  counts.cohere = fromTrace.cohere;
  counts.replicate = fromLlm.replicate;
  counts.sumopod_embed = fromLlm.sumopod_embed > 0 ? fromLlm.sumopod_embed : fromTrace.sumopod_embed;
  counts.sumopod_resolve = fromLlm.sumopod_resolve;
  counts.sumopod_summarize = fromLlm.sumopod_summarize;

  const lines = linesFromCounts(counts);
  if (!lines.length) return undefined;

  return {
    counts,
    lines,
    total: lines.reduce((sum, line) => sum + line.count, 0),
  };
}

export function formatApiSpendCompact(summary: ApiSpendSummary): string {
  return summary.lines.map((line) => `${line.label.toLowerCase()}: ${line.count}`).join(" · ");
}

export function mergeApiSpendTotals(rows: Array<ApiSpendSummary | undefined>): ApiSpendSummary | undefined {
  const counts = emptyCounts();
  for (const row of rows) {
    if (!row) continue;
    for (const key of SPEND_KEYS) {
      counts[key] += row.counts[key];
    }
  }
  const lines = linesFromCounts(counts);
  if (!lines.length) return undefined;
  return {
    counts,
    lines,
    total: lines.reduce((sum, line) => sum + line.count, 0),
  };
}
