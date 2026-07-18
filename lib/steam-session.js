import crypto from "node:crypto";

export const STEAM_SESSION_COOKIE = "gg_steam";
export const STEAM_SESSION_MAX_AGE = 60 * 60 * 24 * 30;

const DEV_SECRET = "dev-insecure-steam-session";

function secret() {
  const value = process.env.AUTH_SECRET;
  if (value && value !== DEV_SECRET) return value;
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
    return value || null;
  }
  return DEV_SECRET;
}

/** @param {string} steamId */
export function signSteamSession(steamId) {
  const key = secret();
  if (!key) {
    throw new Error("AUTH_SECRET must be set in production");
  }
  const payload = Buffer.from(JSON.stringify({ steamId })).toString("base64url");
  const sig = crypto.createHmac("sha256", key).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

/** @param {string | null | undefined} token */
export function verifySteamSession(token) {
  if (!token) return null;
  const key = secret();
  if (!key) return null;

  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;

  const expected = crypto.createHmac("sha256", key).update(payload).digest("base64url");
  const given = Buffer.from(sig);
  const want = Buffer.from(expected);
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString());
    const steamId = parsed?.steamId;
    return typeof steamId === "string" && /^\d{5,}$/.test(steamId) ? steamId : null;
  } catch {
    return null;
  }
}
