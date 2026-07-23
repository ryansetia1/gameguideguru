import { isReplicateInProgress, traceEventTypeLabel, type TraceEventRow } from "@/lib/admin-traces";

type TraceEventsTableProps = {
  events: TraceEventRow[];
  compact?: boolean;
  formatCost?: (usd: number | null) => string;
  /** Index-aligned USD cost; only set on billable-complete rows. */
  eventCostByIndex?: Map<number, number | null>;
  /** Live feed: subtle trace grouping via id column + left accent. */
  showTraceGroups?: boolean;
};

function traceShortId(traceId: string): string {
  return traceId.slice(0, 8);
}

function traceTone(traceId: string): number {
  let hash = 0;
  for (let i = 0; i < traceId.length; i++) hash = (hash + traceId.charCodeAt(i)) % 4;
  return hash;
}

export function TraceEventsTable({
  events,
  compact = false,
  formatCost,
  eventCostByIndex,
  showTraceGroups = false,
}: TraceEventsTableProps) {
  const showCost = Boolean(formatCost && eventCostByIndex);
  return (
    <div className="trace-table-container">
      <table className={`trace-table${compact ? " trace-table--compact" : ""}${showTraceGroups ? " trace-table--grouped" : ""}`}>
        <thead>
          <tr>
            {showTraceGroups ? <th>Trace</th> : null}
            <th>Time</th>
            <th>Type</th>
            <th>Message</th>
            <th>Latency</th>
            {showCost ? <th>Cost</th> : null}
            {!compact ? <th>Metadata</th> : null}
          </tr>
        </thead>
        <tbody>
          {events.map((event, index) => {
            const prev = events[index - 1];
            const traceStart = !prev || prev.trace_id !== event.trace_id;
            const rowClass = [
              isReplicateInProgress(event) ? "trace-row--live" : "",
              showTraceGroups ? `trace-row--tone-${traceTone(event.trace_id)}` : "",
              showTraceGroups && traceStart && index > 0 ? "trace-row--trace-start" : "",
            ]
              .filter(Boolean)
              .join(" ");

            return (
            <tr
              key={`${event.trace_id}-${event.created_at}-${event.event_type}-${index}`}
              className={rowClass || undefined}
            >
              {showTraceGroups ? (
                <td className="trace-id-cell">
                  {traceStart ? (
                    <span className="trace-id-chip" title={event.trace_id}>
                      {traceShortId(event.trace_id)}
                    </span>
                  ) : (
                    <span className="trace-id-cont" aria-hidden>
                      ┊
                    </span>
                  )}
                </td>
              ) : null}
              <td className="time-cell">
                {new Date(event.created_at).toLocaleTimeString([], {
                  hour12: false,
                  fractionalSecondDigits: 3,
                })}
              </td>
              <td>
                <span className={`type-badge${isReplicateInProgress(event) ? " type-badge--live" : ""}`}>
                  {traceEventTypeLabel(event)}
                </span>
              </td>
              <td className="message-cell">{event.message}</td>
              <td className="latency-cell">
                {event.latency_ms != null ? `${(event.latency_ms / 1000).toFixed(2)}s` : "—"}
              </td>
              {showCost ? (
                <td className="latency-cell">
                  {eventCostByIndex!.has(index)
                    ? formatCost!(eventCostByIndex!.get(index) ?? null)
                    : "—"}
                </td>
              ) : null}
              {!compact ? (
                <td className="meta-cell" title={JSON.stringify(event.metadata, null, 2)}>
                  {event.metadata ? JSON.stringify(event.metadata) : "{}"}
                </td>
              ) : null}
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
