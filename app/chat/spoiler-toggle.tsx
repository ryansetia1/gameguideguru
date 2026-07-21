import { SPOILER_TOGGLE_LABEL, type SpoilerPrefs } from "@/lib/spoiler-prefs.js";

export function SpoilerToggle({
  prefs,
  onChange,
  compact = false,
}: {
  prefs: SpoilerPrefs;
  onChange: (value: boolean) => void;
  compact?: boolean;
}) {
  return (
    <label className={`spoiler-toggle${compact ? " spoiler-toggle-compact" : ""}`}>
      <input
        type="checkbox"
        checked={prefs.major === true}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{SPOILER_TOGGLE_LABEL}</span>
    </label>
  );
}
