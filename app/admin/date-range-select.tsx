"use client";

import {
  ADMIN_DATE_RANGE_OPTIONS,
  type AdminDateRangePreset,
} from "@/lib/admin-activity";

type DateRangeSelectProps = {
  value: AdminDateRangePreset;
  onChange: (value: AdminDateRangePreset) => void;
};

export function DateRangeSelect({ value, onChange }: DateRangeSelectProps) {
  return (
    <select
      className="activity-filter activity-range-filter"
      value={value}
      onChange={(event) => onChange(event.target.value as AdminDateRangePreset)}
      aria-label="Date range"
    >
      {ADMIN_DATE_RANGE_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
