/** @typedef {{ story: boolean, recruits: boolean, bosses: boolean }} SpoilerPrefs */

export const SPOILER_KINDS = /** @type {const} */ ([
  { id: "story", label: "Story & plot" },
  { id: "recruits", label: "Characters" },
  { id: "bosses", label: "Bosses" },
]);

/** @type {SpoilerPrefs} */
export const DEFAULT_SPOILER_PREFS = {
  story: false,
  recruits: false,
  bosses: false,
};

export const SPOILER_PREFS_KEY = "gg:spoiler-prefs";

/** @param {string} game */
function normGameKey(game) {
  return game.replace(/\s+/g, " ").trim().toLowerCase();
}

/** @param {unknown} value @returns {SpoilerPrefs} */
export function coerceSpoilerPrefs(value) {
  const out = { ...DEFAULT_SPOILER_PREFS };
  if (!value || typeof value !== "object") return out;
  const record = /** @type {Record<string, unknown>} */ (value);
  if (typeof record.story === "boolean") out.story = record.story;
  if (typeof record.recruits === "boolean") out.recruits = record.recruits;
  if (typeof record.bosses === "boolean") out.bosses = record.bosses;
  return out;
}

/** @param {string} game @returns {SpoilerPrefs} */
export function loadSpoilerPrefs(game) {
  if (typeof window === "undefined" || !game.trim()) return { ...DEFAULT_SPOILER_PREFS };
  try {
    const all = JSON.parse(window.localStorage.getItem(SPOILER_PREFS_KEY) || "{}");
    const entry = all[normGameKey(game)];
    return coerceSpoilerPrefs(entry);
  } catch {
    return { ...DEFAULT_SPOILER_PREFS };
  }
}

/** @param {string} game @param {SpoilerPrefs} prefs */
export function saveSpoilerPrefs(game, prefs) {
  if (typeof window === "undefined" || !game.trim()) return;
  try {
    const all = JSON.parse(window.localStorage.getItem(SPOILER_PREFS_KEY) || "{}");
    all[normGameKey(game)] = coerceSpoilerPrefs(prefs);
    window.localStorage.setItem(SPOILER_PREFS_KEY, JSON.stringify(all));
  } catch {
    // ponytail: quota/private mode — prefs just won't persist.
  }
}

/** @type {Record<"story" | "recruits" | "bosses", string>} */
export const SPOILER_CATEGORY_LABELS = {
  story: "Story & plot",
  recruits: "Characters",
  bosses: "Bosses",
};

/** @param {SpoilerPrefs} prefs @param {"story"|"recruits"|"bosses"} id */
function prefOn(prefs, id) {
  return prefs[id];
}

/** @param {SpoilerPrefs} prefs */
export function hasAnySpoilerEnabled(prefs) {
  const normalized = coerceSpoilerPrefs(prefs);
  return SPOILER_KINDS.some((kind) => normalized[kind.id]);
}

/** @param {SpoilerPrefs} prefs */
export function buildSpoilerOutputRules(prefs) {
  const normalized = coerceSpoilerPrefs(prefs);
  const enabled = SPOILER_KINDS.filter((kind) => normalized[kind.id]).map((kind) => kind.id);
  if (!enabled.length) {
    return 'Spoiler output: all categories blocked — use "spoilers":[] and keep "answer" and "highlights" free of story, recruit, and boss reveals.';
  }
  return (
    `Spoiler output: enabled categories: ${enabled.join(", ")}. ` +
    'Put each reveal ONLY in the "spoilers" array with the matching category — NOT in "answer" or "highlights". ' +
    "The app shows each spoiler in a collapsed section the player must tap to open. " +
    'Keep "answer" helpful without those reveals. Use "spoilers":[] when none apply for enabled categories.'
  );
}

/** @param {SpoilerPrefs} prefs */
export function buildSpoilerBlock(prefs) {
  const normalized = coerceSpoilerPrefs(prefs);
  const enabled = SPOILER_KINDS.filter((k) => prefOn(normalized, k.id)).map((k) => k.label);
  const disabled = SPOILER_KINDS.filter((k) => !prefOn(normalized, k.id)).map((k) => k.label);

  if (disabled.length === 0) {
    return 'Spoiler settings: all categories allowed — put story, character, and boss reveals in the "spoilers" array (shown collapsed), not in "answer".';
  }

  const lines = [
    "Spoiler settings (STRICT — never reveal disabled categories, even if web research or your knowledge contains them):",
    ...disabled.map((label) => `- ${label}: BLOCKED — omit entirely; do not hint or foreshadow.`),
  ];
  if (enabled.length) {
    lines.push(...enabled.map((label) => `- ${label}: allowed.`));
  }
  lines.push(
    'When withholding a spoiler, still help with what the player can do now without naming future events. You may add a brief note like "(Story spoiler hidden — enable Story & plot in spoiler settings)" when useful.',
  );
  return lines.join("\n");
}
