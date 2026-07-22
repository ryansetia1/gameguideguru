// Per-game dismissal for the in-answer "add a guide" nudge, so it stops nagging
// once a player has decided to answer this game from knowledge alone.
// localStorage-only (a UI hint, not data worth syncing). Keyed by normalized name.

const KEY = "gg:guide-nudge-dismissed";

/** @param {string} game */
function norm(game) {
  return String(game || "").trim().toLowerCase();
}

/** @param {string} game */
export function isGuideNudgeDismissed(game) {
  const name = norm(game);
  if (!name || typeof localStorage === "undefined") return false;
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(list) && list.includes(name);
  } catch {
    return false;
  }
}

/** @param {string} game */
export function dismissGuideNudge(game) {
  const name = norm(game);
  if (!name || typeof localStorage === "undefined") return;
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || "[]");
    const arr = Array.isArray(list) ? list : [];
    if (!arr.includes(name)) {
      arr.push(name);
      localStorage.setItem(KEY, JSON.stringify(arr));
    }
  } catch {
    // ignore quota / private-mode failures — the nudge just reappears next load.
  }
}
