/** @typedef {"system" | "light" | "dark"} ThemeMode */

export const THEME_KEY = "gg:theme";

/** @param {unknown} value @returns {ThemeMode | null} */
export function coerceThemeMode(value) {
  if (value === "light" || value === "dark" || value === "system") return value;
  return null;
}

/** @param {unknown} metadata @returns {ThemeMode | null} */
export function themeFromUserMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") return null;
  return coerceThemeMode(/** @type {Record<string, unknown>} */ (metadata).theme);
}

/** @returns {ThemeMode} */
export function loadTheme() {
  if (typeof window === "undefined") return "system";
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch {
    // private mode
  }
  return "system";
}

/** @param {ThemeMode} mode */
export function applyTheme(mode) {
  if (typeof document === "undefined") return;
  if (mode === "light") document.documentElement.dataset.theme = "light";
  else if (mode === "dark") document.documentElement.dataset.theme = "dark";
  else delete document.documentElement.dataset.theme;
}

/** @param {ThemeMode} mode */
export function saveTheme(mode) {
  applyTheme(mode);
  if (typeof window === "undefined") return;
  try {
    if (mode === "system") window.localStorage.removeItem(THEME_KEY);
    else window.localStorage.setItem(THEME_KEY, mode);
  } catch {
    // quota/private mode
  }
}
