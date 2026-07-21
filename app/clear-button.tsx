import { IconX } from "./icons";

/**
 * Trailing "clear the field" button. Drop it right after a text input inside a
 * `position: relative` wrapper (`.field-clear-wrap`); it floats over the input's
 * right edge. Render nothing when there's no text so it never covers a placeholder.
 */
export function ClearButton({
  show,
  onClear,
  disabled,
  label = "Clear",
  className = "field-clear",
}: {
  show: boolean;
  onClear: () => void;
  disabled?: boolean;
  label?: string;
  className?: string;
}) {
  if (!show) return null;
  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      // Keep the input from blurring (matters for comboboxes) before we clear it.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClear}
      disabled={disabled}
    >
      <IconX size={16} />
    </button>
  );
}
