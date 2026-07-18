/**
 * @typedef {{ id: number, name: string, year: string, cover: string, platform: string }} Game
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
    const year =
      typeof release === "string" && /^\d{4}/.test(release) ? release.slice(0, 4) : "";

    const arts = Array.isArray(artData[id]) ? artData[id] : [];
    const front =
      arts.find((a) => a && a.side === "front" && typeof a.filename === "string") ||
      arts.find((a) => a && typeof a.filename === "string");
    const cover = base && front ? `${base}${front.filename}` : "";

    // Platform name resolved via the include=platform block (id -> { name }).
    const platName = platformData[entry.platform]?.name;
    const platform = typeof platName === "string" ? platName : "";

    return [{ id, name, year, cover, platform }];
  });
}
