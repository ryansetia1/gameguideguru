import { AsyncLocalStorage } from "async_hooks";
import { getServerClient } from "@/lib/supabase-server";

// Store trace context for the current request
export type TraceContext = {
  traceId: string;
};

const traceStorage = new AsyncLocalStorage<TraceContext>();

/**
 * Runs a function within a trace context.
 */
export function runWithTrace<T>(traceId: string, callback: () => T): T {
  return traceStorage.run({ traceId }, callback);
}

/**
 * Gets the current trace ID if one exists.
 */
export function getTraceId(): string | undefined {
  return traceStorage.getStore()?.traceId;
}

function coerceInt(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.max(0, Math.round(value));
}

// Log when Supabase vars are set.
const ENABLED = process.env.LLM_DB_LOG !== "0";

/**
 * Logs a trace event to the database if a trace context is active.
 * Best-effort, does not block the main thread.
 */
export async function logTraceEvent(
  eventType: string,
  message: string,
  latencyMs?: number,
  metadata?: Record<string, unknown>
): Promise<void> {
  if (!ENABLED) return;
  const traceId = getTraceId();
  if (!traceId) return;

  const supabase = getServerClient();
  if (!supabase) return;

  try {
    const { error } = await supabase.from("trace_events").insert({
      trace_id: traceId,
      event_type: eventType,
      message: message.slice(0, 5000),
      latency_ms: coerceInt(latencyMs),
      metadata: metadata ?? null,
    });
    if (error) {
      console.error("Failed to insert trace event:", error);
    }
  } catch (err) {
    console.error("Error inserting trace event:", err);
  }
}
