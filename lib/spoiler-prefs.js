/** @typedef {{ major: boolean }} SpoilerPrefs */

/** @type {SpoilerPrefs} */
export const DEFAULT_SPOILER_PREFS = { major: false };

export const SPOILER_PREFS_KEY = "gg:spoiler-prefs";
export const SPOILER_TOGGLE_LABEL = "Allow major spoilers";

/** @param {string} game */
function normGameKey(game) {
  return game.replace(/\s+/g, " ").trim().toLowerCase();
}

/** @param {unknown} value @returns {SpoilerPrefs} */
export function coerceSpoilerPrefs(value) {
  if (!value || typeof value !== "object") return { ...DEFAULT_SPOILER_PREFS };
  const record = /** @type {Record<string, unknown>} */ (value);
  if (typeof record.major === "boolean") return { major: record.major };
  // ponytail: migrate the old three-toggle shape — any on => major on.
  const legacy =
    record.story === true || record.recruits === true || record.bosses === true;
  return { major: legacy };
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

/** @param {SpoilerPrefs} prefs */
export function hasMajorSpoilersEnabled(prefs) {
  return coerceSpoilerPrefs(prefs).major;
}

/** @param {SpoilerPrefs} prefs */
export function buildSpoilerOutputRules(prefs) {
  const { major } = coerceSpoilerPrefs(prefs);
  if (!major) {
    return (
      'Major spoilers: OFF — use "spoilers":[] and keep "answer" and "highlights" free of major plot twists, deaths, betrayals, identity surprises, endings, and other community-recognized big reveals.'
    );
  }
  return (
    'Major spoilers: ON — put ONLY genuinely major, potentially disappointing reveals in the "spoilers" array (collapsed in the app). ' +
    'Routine recruitment, area names, boss tips, and mild story beats belong in "answer" or "highlights", NOT in "spoilers". ' +
    'Each entry: {"detail":"..."} with an optional vague "title" (never the reveal itself). Use "spoilers":[] when nothing qualifies.'
  );
}

/** @param {SpoilerPrefs} prefs */
export function buildSpoilerBlock(prefs) {
  const { major } = coerceSpoilerPrefs(prefs);
  if (!major) {
    return [
      "Major spoiler settings (STRICT — default off):",
      "- BLOCKED: deaths, betrayals, twist endings, hidden antagonists, identity reveals, irreversible story branches, and other reveals players commonly avoid.",
      "- ALLOWED in the main answer: routine party joins, where to go next, shops, items, boss mechanics, and widely-known community facts.",
      "- When withholding a major reveal, still guide what the player can do now without naming the twist. You may note briefly that a major spoiler is hidden.",
    ].join("\n");
  }

  return [
    "Major spoiler settings: ON — the player accepts major reveals in collapsed spoiler sections.",
    "- Put ONLY major, impactful twists in \"spoilers\" — things that would disappoint someone who wanted to discover them organically.",
    "- Do NOT put routine recruitment, mild foreshadowing, or standard walkthrough steps in \"spoilers\".",
    "- Titles must stay vague (e.g. \"Late-game twist\"); the actual reveal goes in \"detail\" only.",
  ].join("\n");
}
