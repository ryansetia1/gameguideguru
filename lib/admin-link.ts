import type { GroupedTrace } from "@/lib/admin-traces";

type SolveLinkRow = {
  trace_id?: string | null;
  created_at: string;
  game: string | null;
  question: string;
  total_latency_ms?: number | null;
};

type IngestLinkRow = {
  trace_id?: string | null;
  created_at: string;
  game: string | null;
  latency_ms?: number | null;
};

type LlmLinkRow = {
  trace_id: string | null;
  created_at: string;
  kind: string;
  game?: string | null;
};

const SOLVE_TRACE_MAX_MS = 120_000;

export function resolveSolveTraceId(solve: SolveLinkRow, traces: GroupedTrace[]): string | undefined {
  if (solve.trace_id) return solve.trace_id;
  const solveTime = new Date(solve.created_at).getTime();
  let best: { traceId: string; delta: number } | undefined;

  for (const trace of traces) {
    if (trace.category !== "Chat") continue;
    if (trace.question && trace.question !== solve.question) continue;
    if (trace.game && solve.game && trace.game !== solve.game) continue;
    const start = new Date(trace.startTime).getTime();
    if (start > solveTime) continue;
    const delta = solveTime - start;
    if (delta > SOLVE_TRACE_MAX_MS) continue;
    if (!best || delta < best.delta) best = { traceId: trace.traceId, delta };
  }
  return best?.traceId;
}

export function resolveTracePlayerName(traceId: string | undefined, traces: GroupedTrace[]): string | undefined {
  if (!traceId) return undefined;
  const trace = traces.find((row) => row.traceId === traceId);
  return trace?.userName?.trim() || undefined;
}

export function linkLlmCallsForSolve(
  solve: SolveLinkRow,
  calls: LlmLinkRow[],
  traceId?: string,
  traceStartMs?: number,
): LlmLinkRow[] {
  const tid = traceId ?? solve.trace_id ?? undefined;
  if (tid) {
    const byTrace = calls.filter((call) => call.trace_id === tid);
    if (byTrace.length) return sortLlmCalls(byTrace);
  }

  const endMs = new Date(solve.created_at).getTime();
  const startMs = traceStartMs ?? endMs - (solve.total_latency_ms ?? 30_000) - 8_000;
  const game = (solve.game || "").toLowerCase();

  return sortLlmCalls(
    calls.filter((call) => {
      const at = new Date(call.created_at).getTime();
      if (at < startMs || at > endMs + 2_000) return false;
      const callGame = (call.game || "").toLowerCase();
      return !game || !callGame || callGame === game;
    }),
  );
}

export function linkLlmCallsForIngest(
  ingest: IngestLinkRow,
  calls: LlmLinkRow[],
  traceId?: string,
): LlmLinkRow[] {
  const tid = traceId ?? ingest.trace_id ?? undefined;
  if (tid) {
    const byTrace = calls.filter((call) => call.trace_id === tid);
    if (byTrace.length) return sortLlmCalls(byTrace);
  }

  const endMs = new Date(ingest.created_at).getTime();
  const startMs = endMs - (ingest.latency_ms ?? 120_000) - 5_000;

  return sortLlmCalls(
    calls.filter((call) => {
      if (call.kind !== "embed_index" && call.kind !== "embed_query") return false;
      const at = new Date(call.created_at).getTime();
      if (at < startMs || at > endMs + 2_000) return false;
      const game = (ingest.game || "").toLowerCase();
      const callGame = (call.game || "").toLowerCase();
      return !game || !callGame || callGame === game;
    }),
  );
}

function sortLlmCalls<T extends { created_at: string }>(calls: T[]): T[] {
  return [...calls].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

export function traceStartMs(traceId: string | undefined, traces: GroupedTrace[]): number | undefined {
  if (!traceId) return undefined;
  const trace = traces.find((row) => row.traceId === traceId);
  return trace ? new Date(trace.startTime).getTime() : undefined;
}
