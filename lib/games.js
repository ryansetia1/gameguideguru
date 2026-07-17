/**
 * @typedef {{ id: number, name: string, year: string }} Game
 */

/**
 * Map raw IGDB `/games` results into the minimal shape the UI needs.
 * Drops entries missing an id or name; derives the year from the unix
 * `first_release_date` (seconds) when present.
 *
 * @param {unknown} results
 * @returns {Game[]}
 */
export function mapGames(results) {
  if (!Array.isArray(results)) return [];

  return results.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const id = "id" in entry ? entry.id : undefined;
    const rawName = "name" in entry ? entry.name : undefined;
    if (typeof id !== "number" || typeof rawName !== "string") return [];
    const name = rawName.trim();
    if (!name) return [];

    const released =
      "first_release_date" in entry && typeof entry.first_release_date === "number"
        ? entry.first_release_date
        : 0;
    const year =
      released > 0 ? String(new Date(released * 1000).getUTCFullYear()) : "";

    return [{ id, name, year }];
  });
}
