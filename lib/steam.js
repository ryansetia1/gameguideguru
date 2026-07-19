import crypto from "node:crypto";

const STEAM_OPENID = "https://steamcommunity.com/openid/login";
const OWNED_GAMES_URL = "https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/";
const APPDETAILS_URL = "https://store.steampowered.com/api/appdetails";
const GET_ITEMS_URL = "https://api.steampowered.com/IStoreBrowseService/GetItems/v1/";
const CLAIMED_ID_RE = /^https?:\/\/steamcommunity\.com\/openid\/id\/(\d+)$/;

export const PENDING_STEAM_COOKIE = "pending_steam_id";
export const OPENID_STATE_COOKIE = "openid_state";
export const OPENID_STATE_MAX_AGE = 60 * 10;

/** Cryptographically random OpenID state (URL-safe). */
export function newOpenIdState() {
  return crypto.randomBytes(24).toString("base64url");
}

/**
 * Constant-time string compare for CSRF state.
 * @param {string} a
 * @param {string} b
 */
export function safeEqual(a, b) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/**
 * @param {string} origin App origin, e.g. https://example.com
 * @param {string} state CSRF nonce echoed on return_to
 * @param {"signin" | "link"} [intent] "signin" mints/bridges a Supabase account;
 *   "link" (default) attaches Steam to the already signed-in account. Round-tripped
 *   through return_to (`i=`) so the callback knows which return to redirect to,
 *   with no extra cookie. Steam echoes return_to verbatim, so this survives.
 */
export function buildSteamLoginUrl(origin, state, intent = "link") {
  const i = intent === "signin" ? "signin" : "link";
  const returnTo = `${origin}/api/steam/callback?s=${state}&i=${i}`;
  const params = new URLSearchParams({
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "checkid_setup",
    "openid.return_to": returnTo,
    "openid.realm": origin,
    "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
  });
  return `${STEAM_OPENID}?${params}`;
}

/**
 * @param {string} claimedId
 * @returns {string | null}
 */
export function steamIdFromClaimedId(claimedId) {
  if (typeof claimedId !== "string") return null;
  const match = claimedId.match(CLAIMED_ID_RE);
  return match ? match[1] : null;
}

/**
 * @param {Record<string, string>} queryParams
 * @returns {Promise<string | null>}
 */
export async function verifySteamOpenId(queryParams) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(queryParams)) {
    if (key.startsWith("openid.")) body.set(key, value);
  }
  body.set("openid.mode", "check_authentication");

  let text = "";
  try {
    const response = await fetch(STEAM_OPENID, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return null;
    text = await response.text();
  } catch {
    return null;
  }

  if (!/is_valid\s*:\s*true/i.test(text)) return null;
  return steamIdFromClaimedId(queryParams["openid.claimed_id"] ?? "");
}

/**
 * Public Steam profile (persona name + avatar) via GetPlayerSummaries. Used to
 * give a "Sign in with Steam" account a real display name instead of a bare
 * SteamID. Keyless => name falls back to a short SteamID tag. Best-effort.
 * @param {string} steamId
 * @returns {Promise<{ name: string, avatar: string }>}
 */
export async function fetchSteamProfile(steamId) {
  const fallback = { name: `Player ${String(steamId).slice(-4)}`, avatar: "" };
  const key = process.env.STEAM_API_KEY;
  if (!key) return fallback;
  try {
    const url = new URL("https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/");
    url.searchParams.set("key", key);
    url.searchParams.set("steamids", steamId);
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return fallback;
    const player = (await res.json())?.response?.players?.[0];
    if (!player || typeof player !== "object") return fallback;
    return {
      name: typeof player.personaname === "string" && player.personaname.trim()
        ? player.personaname.trim()
        : fallback.name,
      avatar: typeof player.avatarfull === "string" ? player.avatarfull : "",
    };
  } catch {
    return fallback;
  }
}

/** @param {number | string} appId */
export function steamLibraryCoverUrl(appId) {
  return `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/library_600x900.jpg`;
}

/**
 * Reverse of steamLibraryCoverUrl: pull the appId out of a Steam CDN cover URL
 * (`.../apps/<appId>/...`). Lets us spot a saved chat that came from Steam so its
 * release year can be backfilled. Returns null for non-Steam / unparseable URLs.
 * @param {unknown} url
 * @returns {number | null}
 */
export function steamAppIdFromCoverUrl(url) {
  if (typeof url !== "string") return null;
  const match = url.match(/\/apps\/(\d+)\//);
  return match ? Number(match[1]) : null;
}

/**
 * @param {unknown} metadata
 * @returns {string | null}
 */
export function steamIdFromMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") return null;
  const raw = /** @type {Record<string, unknown>} */ (metadata).steam_id;
  if (typeof raw === "string" && /^\d{5,}$/.test(raw)) return raw;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return String(Math.trunc(raw));
  return null;
}

/**
 * @param {string} steamId
 * @param {string} apiKey
 * @returns {Promise<Array<{ appId: number, name: string, playtimeMinutes: number, lastPlayedUnix: number, cover: string }>>}
 */
export async function fetchOwnedGames(steamId, apiKey) {
  const url = new URL(OWNED_GAMES_URL);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("steamid", steamId);
  url.searchParams.set("include_appinfo", "1");
  url.searchParams.set("include_played_free_games", "1");
  url.searchParams.set("format", "json");

  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) {
    throw new Error(`Steam owned games failed with status ${response.status}`);
  }

  const payload = await response.json();
  const games = payload?.response?.games;
  if (!Array.isArray(games)) return [];

  return games
    .flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const appId = "appid" in entry ? entry.appid : undefined;
      const name = "name" in entry && typeof entry.name === "string" ? entry.name.trim() : "";
      if (typeof appId !== "number" || !name) return [];
      const playtimeMinutes =
        "playtime_forever" in entry && typeof entry.playtime_forever === "number"
          ? entry.playtime_forever
          : 0;
      // Unix seconds of the last play session (0 when never played / hidden).
      // Powers the "Recently played" sort in the shelf.
      const lastPlayedUnix =
        "rtime_last_played" in entry && typeof entry.rtime_last_played === "number"
          ? entry.rtime_last_played
          : 0;
      return [
        {
          appId,
          name,
          playtimeMinutes,
          lastPlayedUnix,
          cover: steamLibraryCoverUrl(appId),
        },
      ];
    })
    .sort((a, b) => b.playtimeMinutes - a.playtimeMinutes);
}

/**
 * Parse a Steam Store `release_date.date` string to a 4-digit year.
 * @param {unknown} date e.g. "Nov 1, 2004" or "2020"
 * @returns {string}
 */
export function yearFromSteamReleaseDate(date) {
  if (typeof date !== "string" || !date.trim()) return "";
  const match = date.match(/\b(19|20)\d{2}\b/);
  return match ? match[0] : "";
}

/**
 * @param {unknown} seconds Unix epoch seconds from GetItems `release`
 * @returns {string}
 */
export function yearFromUnixSeconds(seconds) {
  const n = typeof seconds === "number" ? seconds : Number(seconds);
  if (!Number.isFinite(n) || n <= 0) return "";
  return String(new Date(n * 1000).getUTCFullYear());
}

/**
 * Batch release years for many appIds via IStoreBrowseService/GetItems
 * (`include_release`) — GetOwnedGames has no release date, so the Steam-library
 * shelf enriches its games with this. One request per 50-id chunk; needs the
 * Steam Web API key (the library route already requires it). Returns a
 * `{ [appId]: "YYYY" }` map; missing/failed entries are simply absent.
 * ponytail: sequential chunks — a huge library is a few calls behind the
 * client's 6h localStorage cache + stale-while-revalidate, so latency is hidden.
 * @param {number[]} appIds
 * @param {string} apiKey
 * @returns {Promise<Record<number, string>>}
 */
export async function fetchSteamReleaseYears(appIds, apiKey) {
  /** @type {Record<number, string>} */
  const out = {};
  if (!apiKey || !Array.isArray(appIds) || !appIds.length) return out;
  const ids = appIds
    .filter((id) => Number.isFinite(id) && id > 0)
    .map((id) => Math.trunc(id));
  const CHUNK = 50;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const input = JSON.stringify({
      ids: chunk.map((appid) => ({ appid })),
      context: { language: "english", country_code: "US" },
      data_request: { include_release: true },
    });
    try {
      const url = new URL(GET_ITEMS_URL);
      url.searchParams.set("key", apiKey);
      url.searchParams.set("input_json", input);
      const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!response.ok) continue;
      const payload = await response.json();
      const items = payload?.response?.store_items;
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        const appid = item?.appid;
        const release = item?.release;
        if (typeof appid !== "number" || !release || typeof release !== "object") continue;
        const seconds =
          typeof release.steam_release_date === "number" && release.steam_release_date > 0
            ? release.steam_release_date
            : release.original_release_date;
        const year = yearFromUnixSeconds(seconds);
        if (year) out[appid] = year;
      }
    } catch {
      // skip this chunk — best-effort enrichment
    }
  }
  return out;
}

/**
 * Release year via the keyless Steam Store `appdetails` endpoint, parsing
 * `release_date.date` (e.g. "24 Feb, 2022"). GetOwnedGames has no release date;
 * `appdetails?filters=basic` omits it — so we fetch WITHOUT `filters`. Keyless is
 * deliberate: the release year then works even when STEAM_API_KEY is unset (the
 * IStoreBrowseService path silently returned "" without a key). Best-effort;
 * returns "" on any failure. ponytail: appdetails is IP rate-limited (~200/5min)
 * and region-gated — fine for occasional per-game clicks; batch/cache if it ever
 * gets hit hard.
 * @param {number} appId
 * @returns {Promise<string>}
 */
export async function fetchSteamReleaseYear(appId) {
  if (!Number.isFinite(appId) || appId <= 0) return "";
  const id = String(Math.trunc(appId));
  try {
    const url = new URL(APPDETAILS_URL);
    url.searchParams.set("appids", id);
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return "";
    const payload = await response.json();
    const entry = payload?.[id];
    if (!entry?.success) return "";
    return yearFromSteamReleaseDate(entry.data?.release_date?.date);
  } catch {
    return "";
  }
}
