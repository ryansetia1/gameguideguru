import { buildApiSpend } from "./admin-api-spend";
import type { ApiSpendKey, ApiSpendSummary } from "./admin-api-spend";
import type { TraceEventRow } from "./admin-traces";

/** USD per 1M tokens — update when provider pricing changes. */
export const API_COST_RATES = {
  replicate_input_per_m: 0.3,
  replicate_output_per_m: 2.5,
  sumopod_embed_per_m: 0.13,
} as const;

export type LlmCallCostInput = {
  kind: string;
  model?: string;
  prompt?: string;
  input_tokens?: number | null;
  output_tokens?: number | null;
};

export type ApiCostLine = {
  key: ApiSpendKey;
  label: string;
  count: number;
  costUsd: number | null;
  tokenNote?: string;
};

export type ApiCostSummary = {
  lines: ApiCostLine[];
  /** Sum of lines with known cost only. */
  knownTotalUsd: number;
  /** True when every billed line has a cost figure. */
  complete: boolean;
};

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function tokensFromUsd(tokens: number, perMillion: number): number {
  return roundUsd((tokens * perMillion) / 1_000_000);
}

function replicateCost(inputTokens: number, outputTokens: number): number {
  return roundUsd(
    tokensFromUsd(inputTokens, API_COST_RATES.replicate_input_per_m) +
      tokensFromUsd(outputTokens, API_COST_RATES.replicate_output_per_m),
  );
}

function sumopodEmbedCost(inputTokens: number): number {
  return tokensFromUsd(inputTokens, API_COST_RATES.sumopod_embed_per_m);
}

/** Parse embed audit JSON stored in `llm_calls.prompt` for token hints. */
export function embedTokensFromLlmPrompt(prompt: string | undefined): number | null {
  if (!prompt) return null;
  try {
    const parsed = JSON.parse(prompt) as Record<string, unknown>;
    if (parsed.cached === true) return 0;
    if (typeof parsed.inputTokens === "number" && Number.isFinite(parsed.inputTokens)) {
      return Math.max(0, Math.round(parsed.inputTokens));
    }
    if (typeof parsed.totalChars === "number" && parsed.totalChars > 0) {
      return Math.ceil(parsed.totalChars / 4);
    }
    const textCount = typeof parsed.textCount === "number" ? parsed.textCount : 0;
    const sample = typeof parsed.sample === "string" ? parsed.sample : "";
    if (textCount > 0 && sample.length > 0) {
      // ponytail: rough when only a sample is stored; upgrade path is inputTokens from API usage.
      return Math.ceil((sample.length * textCount) / 4);
    }
  } catch {
    // not JSON
  }
  return null;
}

function formatTokenNote(input: number | null, output: number | null): string | undefined {
  const parts: string[] = [];
  if (input != null && input > 0) parts.push(`${formatTokenCount(input)} in`);
  if (output != null && output > 0) parts.push(`${formatTokenCount(output)} out`);
  return parts.length ? parts.join(" · ") : undefined;
}

export function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(2)}M`;
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`;
  return String(tokens);
}

export function formatUsd(amount: number | null): string {
  if (amount == null) return "—";
  return `$${amount.toFixed(3)}`;
}

function costFromReplicateCalls(calls: LlmCallCostInput[]): {
  costUsd: number | null;
  tokenNote?: string;
} {
  const replicateCalls = calls.filter((call) =>
    ["rewrite", "summarize", "censor", "memory_summarize"].includes(call.kind),
  );
  if (!replicateCalls.length) return { costUsd: null };

  let inputTotal = 0;
  let outputTotal = 0;
  let hasAll = true;
  for (const call of replicateCalls) {
    const input = call.input_tokens;
    const output = call.output_tokens;
    if (input == null || output == null) {
      hasAll = false;
      continue;
    }
    inputTotal += input;
    outputTotal += output;
  }

  if (!hasAll || (inputTotal === 0 && outputTotal === 0)) {
    return { costUsd: null };
  }

  return {
    costUsd: replicateCost(inputTotal, outputTotal),
    tokenNote: formatTokenNote(inputTotal, outputTotal),
  };
}

function costFromSumopodEmbedCalls(calls: LlmCallCostInput[]): {
  costUsd: number | null;
  tokenNote?: string;
  estimated: boolean;
} {
  const embedCalls = calls.filter((call) => call.kind === "embed_index" || call.kind === "embed_query");
  if (!embedCalls.length) return { costUsd: null, estimated: false };

  let tokenTotal = 0;
  let hasAny = false;
  let hasAll = true;
  let estimated = false;

  for (const call of embedCalls) {
    const tokens = embedTokensFromLlmPrompt(call.prompt);
    if (tokens == null) {
      hasAll = false;
      continue;
    }
    hasAny = true;
    tokenTotal += tokens;
    try {
      const parsed = JSON.parse(call.prompt ?? "{}") as Record<string, unknown>;
      if (parsed.inputTokens == null && tokens > 0) estimated = true;
    } catch {
      estimated = true;
    }
  }

  if (!hasAny || !hasAll) return { costUsd: null, estimated };

  return {
    costUsd: sumopodEmbedCost(tokenTotal),
    tokenNote: `${formatTokenCount(tokenTotal)} in`,
    estimated,
  };
}

export function buildTraceApiCost(
  events: TraceEventRow[],
  llmCalls: LlmCallCostInput[],
): ApiCostSummary | undefined {
  return buildApiCost(buildApiSpend(events, llmCalls), llmCalls);
}

export function buildApiCost(
  spend: ApiSpendSummary | undefined,
  llmCalls: LlmCallCostInput[] | undefined,
): ApiCostSummary | undefined {
  if (!spend?.lines.length) return undefined;

  const calls = llmCalls ?? [];
  const replicateCostInfo = costFromReplicateCalls(calls);
  const embedCostInfo = costFromSumopodEmbedCalls(calls);

  const lines: ApiCostLine[] = spend.lines.map((line) => {
    if (line.key === "replicate") {
      return {
        key: line.key,
        label: line.label,
        count: line.count,
        costUsd: replicateCostInfo.costUsd,
        tokenNote: replicateCostInfo.tokenNote,
      };
    }
    if (line.key === "sumopod_embed") {
      return {
        key: line.key,
        label: line.label,
        count: line.count,
        costUsd: embedCostInfo.costUsd,
        tokenNote: embedCostInfo.tokenNote,
      };
    }
    return {
      key: line.key,
      label: line.label,
      count: line.count,
      costUsd: null,
    };
  });

  const priced = lines.filter((line) => line.costUsd != null);
  if (!priced.length) return undefined;

  const knownTotalUsd = roundUsd(priced.reduce((sum, line) => sum + (line.costUsd ?? 0), 0));
  const complete = lines.every((line) => line.count === 0 || line.costUsd != null);

  return { lines, knownTotalUsd, complete };
}

export function formatApiCostCompact(summary: ApiCostSummary): string {
  return summary.lines
    .filter((line) => line.costUsd != null)
    .map((line) => `${line.label.toLowerCase()}: ${formatUsd(line.costUsd)}`)
    .join(" · ");
}

export function mergeApiCostTotals(rows: Array<ApiCostSummary | undefined>): ApiCostSummary | undefined {
  const byKey = new Map<ApiSpendKey, ApiCostLine>();

  for (const row of rows) {
    if (!row) continue;
    for (const line of row.lines) {
      const prev = byKey.get(line.key);
      if (!prev) {
        byKey.set(line.key, { ...line });
        continue;
      }
      byKey.set(line.key, {
        ...prev,
        count: prev.count + line.count,
        costUsd:
          prev.costUsd != null && line.costUsd != null
            ? roundUsd(prev.costUsd + line.costUsd)
            : prev.costUsd ?? line.costUsd,
      });
    }
  }

  const lines = [...byKey.values()].filter((line) => line.count > 0);
  if (!lines.length) return undefined;

  const priced = lines.filter((line) => line.costUsd != null);
  return {
    lines,
    knownTotalUsd: roundUsd(priced.reduce((sum, line) => sum + (line.costUsd ?? 0), 0)),
    complete: lines.every((line) => line.costUsd != null),
  };
}
