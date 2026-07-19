/**
 * User-facing copy when preferred-guide indexing fails or the URL looks like a hub.
 * @param {{
 *   available?: boolean;
 *   indexed?: boolean;
 *   hubWarning?: boolean;
 *   indexedCount?: number;
 *   total?: number;
 * }} input
 * @returns {string | null}
 */
export function guideIngestHint(input = {}) {
  if (input.hubWarning) {
    return "That link looks like an index page. Paste the page with the full walkthrough.";
  }
  if (input.available === false) return null;

  const total = input.total ?? 1;
  const indexedCount =
    input.indexedCount ??
    (input.indexed === false ? 0 : input.indexed === true ? total : total);
  const failed = total - indexedCount;

  if (failed <= 0) return null;
  if (indexedCount === 0) {
    return total === 1
      ? "Couldn't index that guide. Answering from web search instead."
      : "Couldn't index your guides. Answering from web search instead.";
  }
  return `Couldn't index ${failed} of ${total} guides. Answering from what we could, plus web search.`;
}

/**
 * Parse a batch ingest API response into toast copy.
 * @param {unknown} payload
 * @returns {string | null}
 */
export function guideIngestHintFromResponse(payload) {
  if (!payload || typeof payload !== "object") return null;
  const record = /** @type {Record<string, unknown>} */ (payload);
  const results = Array.isArray(record.results) ? record.results : [];
  const total =
    typeof record.total === "number"
      ? record.total
      : results.length || (record.indexed === false ? 1 : 0);
  const indexedCount =
    typeof record.indexedCount === "number"
      ? record.indexedCount
      : results.filter((row) => row && typeof row === "object" && row.indexed).length;
  return guideIngestHint({
    available: record.available !== false,
    hubWarning: Boolean(record.hubWarning),
    indexedCount,
    total: total || undefined,
  });
}
