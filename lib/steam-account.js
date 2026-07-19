import crypto from "node:crypto";

// Deterministic Supabase credentials for a "Sign in with Steam" identity.
//
// Steam OpenID gives us ONLY a numeric SteamID (no email), so we mint a Supabase
// user in a reserved email namespace that can never collide with a real
// Google/email account — that's what makes the "same email as Google" merge
// impossible by construction. The password is an HMAC of the SteamID keyed by a
// server secret, so the same Steam user always re-signs into the same account and
// the password is never guessable from the (predictable) synthetic email.
//
// Both the bridge route (mint + sign in) and the link guard derive creds here so
// they always agree.

const DOMAIN = "steam.gameguidego.local";

function secret() {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.AUTH_SECRET ||
    process.env.STEAM_API_KEY ||
    ""
  );
}

/** @param {string} steamId */
export function syntheticEmail(steamId) {
  return `steam_${steamId}@${DOMAIN}`;
}

/** @param {unknown} email @returns {string | null} */
export function steamIdFromSyntheticEmail(email) {
  const match = String(email || "").match(
    new RegExp(`^steam_(\\d{5,})@${DOMAIN}$`),
  );
  return match ? match[1] : null;
}

/** @param {string} steamId */
export function syntheticPassword(steamId) {
  const key = secret();
  if (!key) throw new Error("No secret for Steam account password");
  return crypto.createHmac("sha256", key).update(`steam:${steamId}`).digest("base64url");
}
