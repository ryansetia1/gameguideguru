import {
  coercePlayerStyle,
  MEMORY_GAME_NOTE_CAP,
  MEMORY_STYLE_NOTE_CAP,
  normGameKey,
} from "./player-memory.js";

/** @typedef {{ fields?: string[], notes?: boolean[], games?: Record<string, { progress?: boolean, notes?: boolean[] }> }} PlayerStyleUserPins */
/** @typedef {"answerLength" | "tone" | "language" | "detailLevel"} StyleFieldKey */

/** @type {readonly StyleFieldKey[]} */
export const STYLE_FIELD_KEYS = ["answerLength", "tone", "language", "detailLevel"];

export const STYLE_FIELD_OPTIONS = {
  answerLength: [
    { value: "", label: "Not set" },
    { value: "short", label: "Short answers" },
    { value: "medium", label: "Medium-length answers" },
    { value: "detailed", label: "Detailed answers" },
  ],
  tone: [
    { value: "", label: "Not set" },
    { value: "casual", label: "Casual, friendly" },
    { value: "direct", label: "Direct, to the point" },
  ],
  language: [
    { value: "", label: "Not set" },
    { value: "id", label: "Indonesian" },
    { value: "en", label: "English" },
    { value: "mixed", label: "Mixed ID / EN" },
  ],
  detailLevel: [
    { value: "", label: "Not set" },
    { value: "steps", label: "Step-by-step walkthroughs" },
    { value: "context", label: "Story or context when relevant" },
    { value: "minimal", label: "Essentials only" },
  ],
};

const STYLE_FIELD_SET = new Set(/** @type {string[]} */ (STYLE_FIELD_KEYS));

/** @param {unknown} value @returns {PlayerStyleUserPins} */
export function coerceUserPins(value) {
  if (!value || typeof value !== "object") return {};
  const record = /** @type {Record<string, unknown>} */ (value);
  /** @type {PlayerStyleUserPins} */
  const pins = {};

  if (Array.isArray(record.fields)) {
    pins.fields = record.fields
      .flatMap((item) => (typeof item === "string" && STYLE_FIELD_SET.has(item) ? [item] : []))
      .slice(0, STYLE_FIELD_KEYS.length);
  }

  if (Array.isArray(record.notes)) {
    pins.notes = record.notes.map((item) => item === true).slice(0, MEMORY_STYLE_NOTE_CAP);
  }

  if (record.games && typeof record.games === "object") {
    /** @type {Record<string, { progress?: boolean, notes?: boolean[] }>} */
    const games = {};
    for (const [key, row] of Object.entries(record.games)) {
      if (!row || typeof row !== "object") continue;
      const gamePin = /** @type {Record<string, unknown>} */ (row);
      /** @type {{ progress?: boolean, notes?: boolean[] }} */
      const entry = {};
      if (gamePin.progress === true) entry.progress = true;
      if (Array.isArray(gamePin.notes)) {
        entry.notes = gamePin.notes.map((item) => item === true).slice(0, MEMORY_GAME_NOTE_CAP);
      }
      if (entry.progress || entry.notes?.length) games[key] = entry;
    }
    if (Object.keys(games).length) pins.games = games;
  }

  return pins;
}

/** @param {string} gameKey @param {string} [platform] */
export function gameMemoryPinKey(gameKey, platform = "") {
  return `${normGameKey(gameKey)}|${platform || ""}`;
}

/** @param {PlayerStyleUserPins} pins */
function pinsHasContent(pins) {
  return Boolean(
    pins.fields?.length || pins.notes?.some(Boolean) || Object.keys(pins.games ?? {}).length,
  );
}

/**
 * @param {import("./player-memory.js").PlayerStyleShape} style
 * @param {PlayerStyleUserPins} userPins
 */
export function writeStyleRecord(style, userPins) {
  /** @type {Record<string, unknown>} */
  const payload = { ...style };
  if (pinsHasContent(userPins)) payload.userPins = userPins;
  return payload;
}

/**
 * @param {unknown} raw
 * @returns {{ style: import("./player-memory.js").PlayerStyleShape, userPins: PlayerStyleUserPins }}
 */
export function readStyleRecord(raw) {
  const record = raw && typeof raw === "object" ? /** @type {Record<string, unknown>} */ (raw) : {};
  return {
    style: coercePlayerStyle(raw),
    userPins: coerceUserPins(record.userPins),
  };
}

/** @param {PlayerStyleUserPins} pins @param {string} field */
export function isStyleFieldPinned(pins, field) {
  return pins.fields?.includes(field) ?? false;
}

/** @param {PlayerStyleUserPins} pins @param {number} index */
export function isStyleNotePinned(pins, index) {
  return pins.notes?.[index] === true;
}

/** @param {PlayerStyleUserPins} pins @param {string} gameKey @param {string} platform */
export function isGameProgressPinned(pins, gameKey, platform) {
  return pins.games?.[gameMemoryPinKey(gameKey, platform)]?.progress === true;
}

/** @param {PlayerStyleUserPins} pins @param {string} gameKey @param {string} platform @param {number} index */
export function isGameNotePinned(pins, gameKey, platform, index) {
  return pins.games?.[gameMemoryPinKey(gameKey, platform)]?.notes?.[index] === true;
}

/**
 * @param {string[] | undefined} existing
 * @param {string[] | undefined} summary
 * @param {boolean[] | undefined} pinnedFlags
 */
export function mergePinnedNotes(existing, summary, pinnedFlags) {
  const merged = [...(summary ?? [])].slice(0, MEMORY_STYLE_NOTE_CAP);
  for (let index = 0; index < (existing ?? []).length; index += 1) {
    if (!pinnedFlags?.[index]) continue;
    const text = existing?.[index]?.trim();
    if (!text) continue;
    if (index < merged.length) merged[index] = text;
    else if (merged.length < MEMORY_STYLE_NOTE_CAP) merged.push(text);
  }
  return merged.filter(Boolean).slice(0, MEMORY_STYLE_NOTE_CAP);
}

/**
 * @param {import("./player-memory.js").PlayerStyleShape} existingStyle
 * @param {PlayerStyleUserPins} userPins
 * @param {import("./player-memory.js").PlayerStyleShape} summaryStyle
 */
export function mergeStyleAfterSummarize(existingStyle, userPins, summaryStyle) {
  /** @type {import("./player-memory.js").PlayerStyleShape} */
  const merged = { ...summaryStyle, notes: [...(summaryStyle.notes ?? [])] };

  for (const field of STYLE_FIELD_KEYS) {
    if (isStyleFieldPinned(userPins, field) && existingStyle[field]) {
      merged[field] = existingStyle[field];
    }
  }

  merged.notes = mergePinnedNotes(existingStyle.notes, summaryStyle.notes, userPins.notes);
  return merged;
}

/**
 * @param {{ game_key: string, platform: string, progress: string | null, notes: string[] }} existingRow
 * @param {{ gameKey: string, platform: string, progress?: string, notes: string[] }} summaryGame
 * @param {PlayerStyleUserPins} userPins
 */
export function mergeGameRowAfterSummarize(existingRow, summaryGame, userPins) {
  const key = gameMemoryPinKey(existingRow.game_key, existingRow.platform);
  const gamePin = userPins.games?.[key];
  const progress = gamePin?.progress
    ? existingRow.progress
    : summaryGame.progress?.trim() || existingRow.progress || null;
  const notes = mergePinnedNotes(existingRow.notes, summaryGame.notes, gamePin?.notes);
  return {
    game_key: existingRow.game_key,
    platform: existingRow.platform,
    progress: progress?.slice(0, 200) ?? null,
    notes,
  };
}

/**
 * ponytail: self-check for pin merge — run via `npm run check`.
 * @returns {boolean}
 */
export function demoPlayerMemoryPins() {
  const existing = {
    answerLength: "short",
    tone: "direct",
    notes: ["Keep it brief", "User pinned this"],
  };
  const pins = {
    fields: ["answerLength"],
    notes: [false, true],
  };
  const summary = {
    answerLength: "detailed",
    tone: "casual",
    notes: ["LLM note"],
  };
  const merged = mergeStyleAfterSummarize(existing, pins, summary);
  if (merged.answerLength !== "short") return false;
  if (merged.tone !== "casual") return false;
  if (!merged.notes?.includes("User pinned this")) return false;

  const gameMerged = mergeGameRowAfterSummarize(
    { game_key: "zelda", platform: "nes", progress: "Dungeon 3", notes: ["Pinned tip"] },
    { gameKey: "zelda", platform: "nes", progress: "Dungeon 4", notes: ["New tip"] },
    { games: { "zelda|nes": { progress: true, notes: [true] } } },
  );
  if (gameMerged.progress !== "Dungeon 3") return false;
  if (gameMerged.notes[0] !== "Pinned tip") return false;
  return true;
}
