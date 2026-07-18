/**
 * Build a web search query for browsing walkthrough pages in the setup UI.
 * @param {string} game
 * @param {string} platform
 * @param {string} [query]
 */
export function buildGuideDiscoveryQuery(game, platform, query = "") {
  const extra = query.trim() || "walkthrough guide";
  return [game.trim(), platform.trim(), extra]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
