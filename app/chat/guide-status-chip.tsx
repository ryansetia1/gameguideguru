import { IconAlert, IconCheck, IconClock, IconX } from "../icons";

export function GuideStatusChip({ state }: { state: string }) {
  if (state === "indexed") {
    return (
      <span className="guide-status-chip is-indexed">
        <IconCheck size={12} /> Indexed
      </span>
    );
  }
  if (state === "failed") {
    return (
      <span className="guide-status-chip is-failed">
        <IconX size={10} /> Failed
      </span>
    );
  }
  if (state === "blocked") {
    return (
      <span className="guide-status-chip is-blocked">
        <IconAlert size={12} /> Blocked
      </span>
    );
  }
  if (state === "pending") {
    return (
      <span className="guide-status-chip is-pending">
        <IconClock size={12} /> Pending
      </span>
    );
  }
  if (state === "checking") {
    return (
      <span className="guide-status-chip is-checking">
        <IconClock size={12} /> Checking…
      </span>
    );
  }
  if (state === "unavailable") {
    return (
      <span className="guide-status-chip is-unavailable">
        <IconAlert size={12} /> N/A
      </span>
    );
  }
  return null;
}
