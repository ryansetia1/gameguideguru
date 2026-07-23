"use client";

import { useMemo } from "react";
import { TraceEventsTable } from "@/app/admin/trace-events-table";
import type { ApiCostSummary, LlmCallCostInput } from "@/lib/admin-api-cost";
import { buildTraceEventCostMap } from "@/lib/admin-trace-event-cost";
import type { GroupedTrace } from "@/lib/admin-traces";

type TraceCardProps = {
  trace: GroupedTrace;
  copiedTraceId: string | null;
  onCopyTrace: (traceId: string) => void;
  defaultOpen?: boolean;
  apiCost?: ApiCostSummary;
  llmCalls?: LlmCallCostInput[];
  formatCost: (usd: number | null) => string;
};

function statusClass(status: GroupedTrace["status"]): string {
  if (status === "Finished") return "status-finished";
  if (status === "New") return "status-new";
  return "status-processing";
}

export function TraceCard({
  trace,
  copiedTraceId,
  onCopyTrace,
  defaultOpen,
  apiCost,
  llmCalls,
  formatCost,
}: TraceCardProps) {
  const open = defaultOpen ?? trace.status !== "Finished";
  const gameLine = [trace.game, trace.platform].filter(Boolean).join(" · ");
  const eventCostByIndex = useMemo(
    () => buildTraceEventCostMap(trace.events, llmCalls ?? []),
    [trace.events, llmCalls],
  );

  return (
    <details className={`trace-details ${statusClass(trace.status)}`} open={open}>
      <summary className="trace-summary">
        <div className="trace-header">
          <span className="trace-indicator" aria-hidden>
            ▶
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="trace-header-row">
              <button
                type="button"
                className="activity-trace-btn trace-id"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onCopyTrace(trace.traceId);
                }}
              >
                {copiedTraceId === trace.traceId ? "Copied" : trace.traceId.slice(0, 8)}
              </button>
              <span className="activity-badge">{trace.category}</span>
              <span className="activity-status" style={{ color: trace.statusColor }}>
                {trace.status}
              </span>
              {trace.pipelineType ? <span className="trace-pipeline">{trace.pipelineType}</span> : null}
            </div>
            <p className="trace-question">{trace.question || "No question logged"}</p>
            <div className="trace-meta">
              {gameLine ? <span>{gameLine}</span> : null}
              <span>{new Date(trace.startTime).toLocaleString()}</span>
              <span>{trace.rawEventCount} events</span>
              {trace.totalLatencyMs > 0 ? <span>{(trace.totalLatencyMs / 1000).toFixed(2)}s total</span> : null}
              {apiCost ? (
                <span className="trace-cost">
                  <strong>Cost</strong> {formatCost(apiCost.knownTotalUsd)}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </summary>
      <TraceEventsTable events={trace.events} formatCost={formatCost} eventCostByIndex={eventCostByIndex} />
    </details>
  );
}
