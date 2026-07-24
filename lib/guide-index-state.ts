export type GuideIndexStateValue =
  | "unknown"
  | "checking"
  | "indexed"
  | "failed"
  | "blocked"
  | "unavailable"
  | "pending";

export type GuideIndexState = Record<string, GuideIndexStateValue>;

export function guideIndexStateFromIngest(
  row?: Record<string, unknown>,
  meta?: { isBlocked?: boolean },
): GuideIndexStateValue {
  if (row?.indexed) return "indexed";
  if (row?.isBlocked === true || meta?.isBlocked) return "blocked";
  return "failed";
}

export function resolveGuideDisplayState(
  state?: GuideIndexStateValue,
  meta?: { isBlocked?: boolean },
): GuideIndexStateValue {
  if (state === "indexed" || state === "unavailable" || state === "checking") {
    return state;
  }
  if (meta?.isBlocked) return "blocked";
  return state || "pending";
}
