export function todayDateInput(): string {
  return dateInputFromDate(new Date());
}

export function dateInputFromDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function defaultDateFrom(days = 7): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return dateInputFromDate(date);
}

export type AdminDateRangePreset = "today" | "7d" | "30d" | "quarter" | "half" | "year";

export const ADMIN_DATE_RANGE_OPTIONS: Array<{ value: AdminDateRangePreset; label: string }> = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "quarter", label: "This quarter" },
  { value: "half", label: "This half" },
  { value: "year", label: "This year" },
];

export const DEFAULT_ADMIN_DATE_PRESET: AdminDateRangePreset = "30d";

/** Local-date range for admin filters (`YYYY-MM-DD`, inclusive through end of day). */
export function dateRangeForPreset(preset: AdminDateRangePreset, now = new Date()): { from: string; to: string } {
  const to = dateInputFromDate(now);

  switch (preset) {
    case "today":
      return { from: to, to };
    case "7d": {
      const start = new Date(now);
      start.setDate(start.getDate() - 7);
      return { from: dateInputFromDate(start), to };
    }
    case "30d": {
      const start = new Date(now);
      start.setDate(start.getDate() - 30);
      return { from: dateInputFromDate(start), to };
    }
    case "quarter": {
      const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
      const start = new Date(now.getFullYear(), quarterStartMonth, 1);
      return { from: dateInputFromDate(start), to };
    }
    case "half": {
      const halfStartMonth = now.getMonth() < 6 ? 0 : 6;
      const start = new Date(now.getFullYear(), halfStartMonth, 1);
      return { from: dateInputFromDate(start), to };
    }
    case "year": {
      const start = new Date(now.getFullYear(), 0, 1);
      return { from: dateInputFromDate(start), to };
    }
    default:
      return dateRangeForPreset(DEFAULT_ADMIN_DATE_PRESET, now);
  }
}

export function dateRangeBounds(from: string, to: string): { fromIso: string; toIso: string } {
  const fromDate = new Date(`${from}T00:00:00`);
  const toDate = new Date(`${to}T23:59:59.999`);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    const fallback = new Date();
    fallback.setDate(fallback.getDate() - 30);
    return {
      fromIso: fallback.toISOString(),
      toIso: new Date().toISOString(),
    };
  }
  return { fromIso: fromDate.toISOString(), toIso: toDate.toISOString() };
}
