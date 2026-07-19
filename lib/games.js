/**
 * @typedef {{ id: number, name: string, year: string, releaseDate: string, cover: string, platform: string, hint?: string }} Game
 */

// Prefer a mid-size box art; fall back down the chain TheGamesDB exposes.
const BASE_URL_KEYS = ["medium", "large", "original", "small", "thumb"];

/**
 * Map a TheGamesDB `Games/ByGameName?include=boxart` payload into the minimal
 * shape the UI needs. Drops entries missing an id or title; derives the year from
 * `release_date` (YYYY-MM-DD) and builds a front-boxart URL from the `include`
 * block when available (empty string otherwise).
 *
 * @param {unknown} payload
 * @returns {Game[]}
 */
export function mapGames(payload) {
  // Runtime-validated below; cast loosely so the JSON walk isn't a type puzzle.
  const root = /** @type {any} */ (payload && typeof payload === "object" ? payload : {});
  const games = root?.data?.games;
  if (!Array.isArray(games)) return [];

  const baseUrls = root?.include?.boxart?.base_url ?? {};
  let base = "";
  for (const key of BASE_URL_KEYS) {
    if (typeof baseUrls[key] === "string") {
      base = baseUrls[key];
      break;
    }
  }
  const artData = root?.include?.boxart?.data ?? {};
  // Note: include.platform is keyed by id DIRECTLY (no `.data` wrapper, unlike
  // boxart) -> { "10": { id, name, alias }, ... }.
  const platformData = root?.include?.platform ?? {};

  return games.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const id = "id" in entry ? entry.id : undefined;
    const rawName = "game_title" in entry ? entry.game_title : undefined;
    if (typeof id !== "number" || typeof rawName !== "string") return [];
    const name = rawName.trim();
    if (!name) return [];

    const release = "release_date" in entry ? entry.release_date : undefined;
    const releaseDate =
      typeof release === "string" && /^\d{4}-\d{2}-\d{2}/.test(release) ? release.slice(0, 10) : "";
    const year = releaseDate ? releaseDate.slice(0, 4) : "";

    const arts = Array.isArray(artData[id]) ? artData[id] : [];
    const front =
      arts.find((a) => a && a.side === "front" && typeof a.filename === "string") ||
      arts.find((a) => a && typeof a.filename === "string");
    const cover = base && front ? `${base}${front.filename}` : "";

    // Platform name resolved via the include=platform block (id -> { name }).
    const platName = platformData[entry.platform]?.name;
    const platform = typeof platName === "string" ? platName : "";

    return [{ id, name, year, releaseDate, cover, platform }];
  });
}

/** @param {string} name */
function normName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** @param {Game} game */
function groupKey(game) {
  return `${normName(game.name)}|${game.platform}|${game.year}`;
}

/** @param {string} releaseDate ISO YYYY-MM-DD */
export function formatReleaseHint(releaseDate) {
  if (!releaseDate || releaseDate.length < 10) return "";
  const d = new Date(`${releaseDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Prefer a row with cover art, then the lower TGDB id. */
function pickBetter(/** @type {Game} */ a, /** @type {Game} */ b) {
  if (Boolean(a.cover) !== Boolean(b.cover)) return a.cover ? a : b;
  return a.id < b.id ? a : b;
}

/**
 * Collapse noisy TGDB duplicates and attach a short hint when rows under the
 * same name · platform · year still need disambiguation (usually release date).
 *
 * @param {Game[]} games
 * @returns {Game[]}
 */
export function prepareAutocompleteGames(games) {
  /** @type {Map<string, Game[]>} */
  const groups = new Map();
  for (const game of games) {
    const key = groupKey(game);
    const bucket = groups.get(key) ?? [];
    if (!groups.has(key)) groups.set(key, bucket);
    bucket.push(game);
  }

  /** @type {Game[]} */
  const out = [];
  for (const items of groups.values()) {
    if (items.length === 1) {
      out.push({ ...items[0], hint: "" });
      continue;
    }

    // Same title/platform/year: collapse identical release date + cover rows.
    /** @type {Map<string, Game>} */
    const buckets = new Map();
    for (const game of items) {
      const dupKey = `${game.releaseDate}|${game.cover}`;
      const prev = buckets.get(dupKey);
      buckets.set(dupKey, prev ? pickBetter(game, prev) : game);
    }
    let uniq = [...buckets.values()];
    if (uniq.length === 1) {
      out.push({ ...uniq[0], hint: "" });
      continue;
    }

    const dates = [...new Set(uniq.map((g) => g.releaseDate).filter(Boolean))];
    if (dates.length > 1) {
      uniq = uniq.map((game) => ({
        ...game,
        hint: game.releaseDate ? formatReleaseHint(game.releaseDate) : "Release date unknown",
      }));
    } else {
      uniq = uniq.map((game) => ({ ...game, hint: "" }));
    }
    out.push(...uniq);
  }

  const order = new Map(games.map((game, index) => [game.id, index]));
  out.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return out;
}
