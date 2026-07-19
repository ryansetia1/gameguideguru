// Pure HowLongToBeat helpers: parse search responses, pick the row that
// matches a Steam game, and shape/format playtime figures. Side-effect-free so
// scripts/check.mjs can assert matching + formatting.
//
// Playtime is near-static per game; the cache TTL is long (see lib/hltb-cache.js).

/** @typedef {{ game_id: number | null, game_name: string, profile_steam: number | null, comp_main: number, comp_plus: number, comp_100: number, comp_all: number, comp_all_count: number }} HltbGame */
/** @typedef {{ hltbId: number | null, main: number | null, mainPlus: number | null, complete: number | null, allStyles: number | null }} HltbData */

export const HLTB_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Reject a fuzzy match that shares less than this fraction of characters with
// the title. We search by the exact Steam title, so the exact-name branch hits
// almost always; this only guards the typo/punctuation fallback.
const MATCH_MIN_SIMILARITY = 0.5;

/** @param {unknown} v */
function num(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/**
 * Cache key for hltb_cache rows (normalized title).
 * @param {unknown} title
 */
export function hltbCacheKey(title) {
  return normalizeTitle(String(title || ""));
}

/**
 * Lowercase, strip accents + punctuation, collapse whitespace.
 * @param {string} s
 */
export function normalizeTitle(s) {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Classic two-row edit distance. Small strings, so O(n*m) is fine.
 * @param {string} a
 * @param {string} b
 */
export function levenshtein(a, b) {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  /** @type {number[]} */
  let curr = new Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/**
 * Defensive: pull the `data[]` rows out of an HLTB search response.
 * @param {any} json
 */
export function parseHltbSearch(json) {
  if (!json || typeof json !== "object") return [];
  const data = json.data;
  if (!Array.isArray(data)) return [];
  /** @type {HltbGame[]} */
  const out = [];
  for (const row of data) {
    if (!row || typeof row !== "object") continue;
    if (typeof row.game_name !== "string") continue;
    out.push({
      game_id: typeof row.game_id === "number" ? row.game_id : null,
      game_name: row.game_name,
      profile_steam:
        typeof row.profile_steam === "number" && row.profile_steam > 0
          ? row.profile_steam
          : null,
      comp_main: num(row.comp_main),
      comp_plus: num(row.comp_plus),
      comp_100: num(row.comp_100),
      comp_all: num(row.comp_all),
      comp_all_count: num(row.comp_all_count),
    });
  }
  return out;
}

/**
 * Pick the HLTB row for a Steam game: exact Steam appId first (when present),
 * then exact normalized name, then the closest fuzzy match (tie-broken by
 * popularity) as long as it is similar enough.
 *
 * @param {HltbGame[]} games
 * @param {string} title
 * @param {string | number} appId
 * @returns {HltbGame | null}
 */
export function pickBestMatch(games, title, appId) {
  if (games.length === 0) return null;

  const targetAppId = Number(appId);
  if (Number.isFinite(targetAppId) && targetAppId > 0) {
    const byId = games.find((g) => g.profile_steam === targetAppId);
    if (byId) return byId;
  }

  const target = normalizeTitle(title);
  if (!target) return null;

  const exact = games.find((g) => normalizeTitle(g.game_name) === target);
  if (exact) return exact;

  /** @type {{ game: HltbGame, dist: number } | null} */
  let best = null;
  for (const g of games) {
    const name = normalizeTitle(g.game_name);
    if (!name) continue;
    const dist = levenshtein(target, name);
    if (
      best === null ||
      dist < best.dist ||
      (dist === best.dist && g.comp_all_count > best.game.comp_all_count)
    ) {
      best = { game: g, dist };
    }
  }
  if (!best) return null;

  const longer = Math.max(target.length, normalizeTitle(best.game.game_name).length);
  const similarity = longer === 0 ? 0 : 1 - best.dist / longer;
  return similarity >= MATCH_MIN_SIMILARITY ? best.game : null;
}

/**
 * Seconds -> hours, null when the game has no data point (0).
 * @param {number} sec
 */
export function secondsToHours(sec) {
  return typeof sec === "number" && sec > 0 ? sec / 3600 : null;
}

/**
 * Reduce a matched HLTB row to the cached record.
 * @param {HltbGame} game
 */
export function buildHltbData(game) {
  return {
    hltbId: typeof game.game_id === "number" ? game.game_id : null,
    main: secondsToHours(game.comp_main),
    mainPlus: secondsToHours(game.comp_plus),
    complete: secondsToHours(game.comp_100),
    allStyles: secondsToHours(game.comp_all),
  };
}

/**
 * True when a record carries at least one usable playtime figure.
 * @param {HltbData | null | undefined} data
 */
export function hasHltbData(data) {
  return (
    !!data &&
    (data.main != null ||
      data.mainPlus != null ||
      data.complete != null ||
      data.allStyles != null)
  );
}

/**
 * Format hours for display: half-hour precision under 10h, whole hours above.
 * Returns null for missing/zero so the segment can be dropped.
 * @param {number | null | undefined} hours
 */
export function formatHltbHours(hours) {
  if (hours == null || !Number.isFinite(hours) || hours <= 0) return null;
  const rounded = hours < 10 ? Math.round(hours * 2) / 2 : Math.round(hours);
  if (rounded <= 0) return null;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
